package xplint

import (
	"fmt"
	"go/ast"
	"go/constant"
	"go/token"
	"go/types"
	"os"
	"reflect"
	"sort"
	"strings"

	"golang.org/x/tools/go/analysis"
	"golang.org/x/tools/go/ssa"
)

// Label marks where a value came from. A value can carry several.
type Label uint32

const (
	LText      Label = 1 << iota // raw bytes core does not validate as text
	LMuxed                       // a muxed or non-account address
	LNum                         // an integer a contract chose
	LFootprint                   // the declared Soroban footprint
	LWire                        // an integer read off the wire
	LAuth                        // the declared Soroban authorization tree
	LOpBody                      // an account named by an operation body
	LDiag                        // a diagnostic event
	LFootRaw                     // the declared footprint itself (internal: a contract taken from it is LFootprint)
	realBits   = 9
	realMask   = Label(1<<realBits) - 1
	paramShift = 16 // bits 16..31 mark "derived from parameter i" while summarising a function
	maxParams  = 16
)

var labelRule = map[Label]string{
	LText: "XP001/text-bytes", LMuxed: "XP001/muxed-as-account", LNum: "XP001/contract-number",
	LFootprint: "XP001/declared-footprint", LWire: "XP002/alloc-from-wire", LAuth: "XP003/declared-auth",
	LOpBody: "XP003/op-body-ungated", LDiag: "XP003/events-ungated",
}

var labelSource = map[Label]string{
	LText: "text bytes core does not validate", LMuxed: "an address that may be muxed (M...) or not an account",
	LNum: "an integer chosen by a contract", LFootprint: "the declared footprint", LWire: "an integer read off the wire",
	LAuth: "the declared authorization tree", LOpBody: "an account named by an operation body", LDiag: "a diagnostic event",
}

// Sink kinds and the labels each one matters for.
const (
	sinkAttr     = "attribution"
	sinkMapKey   = "map key"
	sinkMapValue = "map value"
	sinkText     = "storage or encoding"
	sinkNum      = "size, exponent or shift"
	sinkAlloc    = "allocation size"
)

var sinkLabels = map[string]Label{
	sinkAttr:     LMuxed | LAuth | LOpBody | LDiag | LFootprint,
	sinkMapKey:   LMuxed | LAuth | LOpBody | LDiag | LFootprint,
	sinkMapValue: LAuth | LFootprint | LText | LDiag, // details maps that are exported (stellar-etl#488)
	sinkText:     LText,
	sinkNum:      LNum,
	sinkAlloc:    LNum | LWire,
}

func marker(i int) Label {
	if i >= maxParams {
		return 0
	}
	return Label(1) << (paramShift + i)
}

// ---- summaries and facts -----------------------------------------------------------------------------

// ParamSink: parameter Param reaches a sink of kind Kind in the function, ungated.
type ParamSink struct {
	Param  int
	Kind   string
	Labels Label  // the labels that would matter there
	Where  string // file:line of the sink
}

// Summary is what callers need to know about a function.
type Summary struct {
	Ret           Label  // labels its results carry whatever its arguments are
	RetFrom       uint32 // bit i: argument i flows to a result
	ParamSinks    []ParamSink
	ValidatesUTF8 uint32           // bit i: it checks argument i is valid UTF-8
	RetOrigins    map[Label]string // where each label of Ret comes from
	RetKeys       Label            // labels of the keys of a map it returns (Ret holds its values)
}

// funcFact carries a function's summary to the packages that import it.
type funcFact struct{ S Summary }

func (*funcFact) AFact()           {}
func (f *funcFact) String() string { return fmt.Sprintf("summary%+v", f.S) }

func (s Summary) equal(o Summary) bool { return reflect.DeepEqual(s, o) }

// Finding is one report of the taint engine.
type Finding struct {
	Pos     token.Pos
	Rule    string
	Message string
}

// ---- the analyzer ------------------------------------------------------------------------------------

// Scope decides which packages the engine analyses (the others are skipped, and export no facts).
// The driver sets it; by default every package is in scope.
var Scope = func(path string) bool { return true }

// TaintAnalyzer computes the findings of every taint-based sub-rule; XP001, XP002 and XP003 report
// their share.
var TaintAnalyzer = &analysis.Analyzer{
	Name:       "xptaint",
	Doc:        "taint engine shared by XP001, XP002 and XP003",
	Run:        runTaint,
	FactTypes:  []analysis.Fact{new(funcFact)},
	ResultType: reflect.TypeOf([]Finding(nil)),
}

type engine struct {
	pass      *analysis.Pass
	fns       []*ssa.Function
	summary   map[*ssa.Function]Summary
	freeVars  map[*ssa.Function][]Label // labels bound to each free variable by its closures
	callers   map[*ssa.Function][]ssa.CallInstruction
	gatedFn   map[*ssa.Function]bool // every local call site is success-gated
	findings  map[string]Finding
	reporting bool
}

func runTaint(pass *analysis.Pass) (any, error) {
	if !Scope(pass.Pkg.Path()) {
		return []Finding(nil), nil
	}
	prog, pkg := buildSSA(pass)
	if pkg == nil {
		return []Finding(nil), nil
	}
	e := &engine{pass: pass, summary: map[*ssa.Function]Summary{}, freeVars: map[*ssa.Function][]Label{},
		callers: map[*ssa.Function][]ssa.CallInstruction{}, gatedFn: map[*ssa.Function]bool{}, findings: map[string]Finding{}}
	e.fns = sourceFunctions(prog, pkg, pass)

	// local call graph, for gates proven in every caller
	for _, fn := range e.fns {
		for _, b := range fn.Blocks {
			for _, ins := range b.Instrs {
				if c, ok := ins.(ssa.CallInstruction); ok {
					if callee := e.calleeOf(fn, c.Common()); callee != nil {
						e.callers[callee] = append(e.callers[callee], c)
					}
				}
			}
		}
	}

	// summaries to a fixpoint, then one reporting pass
	for iter := 0; iter < 12; iter++ {
		changed := false
		e.computeGatedFns()
		for _, fn := range e.fns {
			s := e.analyse(fn)
			if !s.equal(e.summary[fn]) {
				e.summary[fn] = s
				changed = true
			}
		}
		if !changed {
			break
		}
	}
	e.reporting = true
	e.computeGatedFns()
	for _, fn := range e.fns {
		e.analyse(fn)
	}
	for _, fn := range e.fns {
		if obj, ok := fn.Object().(*types.Func); ok && obj.Pkg() == pass.Pkg && fn.Parent() == nil {
			if s := e.summary[fn]; s.Ret != 0 || s.RetFrom != 0 || len(s.ParamSinks) > 0 || s.ValidatesUTF8 != 0 || s.RetKeys != 0 {
				pass.ExportObjectFact(obj, &funcFact{S: s})
			}
		}
	}
	out := make([]Finding, 0, len(e.findings))
	for _, f := range e.findings {
		out = append(out, f)
	}
	sort.Slice(out, func(i, j int) bool {
		return out[i].Pos < out[j].Pos || out[i].Pos == out[j].Pos && out[i].Rule < out[j].Rule
	})
	return out, nil
}

// sourceFunctions: every function and closure with a body in the package, outside tests and generated files.
func sourceFunctions(prog *ssa.Program, pkg *ssa.Package, pass *analysis.Pass) []*ssa.Function {
	var out []*ssa.Function
	var add func(fn *ssa.Function)
	add = func(fn *ssa.Function) {
		if fn == nil || fn.Blocks == nil || skipFile(pass, fn.Pos()) {
			return
		}
		out = append(out, fn)
		for _, a := range fn.AnonFuncs {
			add(a)
		}
	}
	for _, f := range pass.Files {
		for _, d := range f.Decls {
			fd, ok := d.(*ast.FuncDecl)
			if !ok || fd.Body == nil {
				continue
			}
			if obj, ok := pass.TypesInfo.Defs[fd.Name].(*types.Func); ok {
				add(prog.FuncValue(obj))
			}
		}
	}
	if init := pkg.Func("init"); init != nil {
		add(init)
	}
	return out
}

// skipFile: tests and generated code are not linted.
func skipFile(pass *analysis.Pass, pos token.Pos) bool {
	if !pos.IsValid() {
		return true
	}
	name := pass.Fset.Position(pos).Filename
	if strings.HasSuffix(name, "_test.go") || strings.HasSuffix(name, "_generated.go") {
		return true
	}
	for _, f := range pass.Files {
		if f.Pos() <= pos && pos <= f.End() {
			return ast.IsGenerated(f)
		}
	}
	return false
}

// ---- callees -----------------------------------------------------------------------------------------

// calleeOf resolves a call to a function in this package: static calls, closures, and closures stored in
// a local variable (a recursive closure is called through the variable it is assigned to).
func (e *engine) calleeOf(fn *ssa.Function, c *ssa.CallCommon) *ssa.Function {
	if c.IsInvoke() {
		return nil
	}
	if f := c.StaticCallee(); f != nil {
		return f
	}
	// a closure captured by value by this closure: the parent bound the free variable to it
	if fv, ok := c.Value.(*ssa.FreeVar); ok {
		if b := bindingOf(fn, fv); b != nil {
			switch x := b.(type) {
			case *ssa.MakeClosure:
				return x.Fn.(*ssa.Function)
			case *ssa.Function:
				return x
			case *ssa.Alloc:
				return closureStoredIn(x)
			}
		}
	}
	if l, ok := c.Value.(*ssa.UnOp); ok && l.Op == token.MUL {
		if a, ok := l.X.(*ssa.Alloc); ok {
			return closureStoredIn(a)
		}
		if fv, ok := l.X.(*ssa.FreeVar); ok {
			// the free variable is bound to an Alloc in the parent: find the closure stored there
			if p := fn.Parent(); p != nil {
				for _, b := range p.Blocks {
					for _, ins := range b.Instrs {
						if mc, ok := ins.(*ssa.MakeClosure); ok && mc.Fn == fn {
							for j, v := range fn.FreeVars {
								if v == fv && j < len(mc.Bindings) {
									if a, ok := mc.Bindings[j].(*ssa.Alloc); ok {
										return closureStoredIn(a)
									}
								}
							}
						}
					}
				}
			}
		}
	}
	return nil
}

// bindingOf: the value fn's parent binds to free variable fv when it makes the closure.
func bindingOf(fn *ssa.Function, fv *ssa.FreeVar) ssa.Value {
	p := fn.Parent()
	if p == nil {
		return nil
	}
	for _, b := range p.Blocks {
		for _, ins := range b.Instrs {
			if mc, ok := ins.(*ssa.MakeClosure); ok && mc.Fn == fn {
				for j, v := range fn.FreeVars {
					if v == fv && j < len(mc.Bindings) {
						return mc.Bindings[j]
					}
				}
			}
		}
	}
	return nil
}

func closureStoredIn(a *ssa.Alloc) *ssa.Function {
	for _, r := range *a.Referrers() {
		if st, ok := r.(*ssa.Store); ok && st.Addr == a {
			if mc, ok := st.Val.(*ssa.MakeClosure); ok {
				return mc.Fn.(*ssa.Function)
			}
			if f, ok := st.Val.(*ssa.Function); ok {
				return f
			}
		}
	}
	return nil
}

func callObj(c *ssa.CallCommon) *types.Func {
	if c.IsInvoke() {
		return c.Method
	}
	if f := c.StaticCallee(); f != nil {
		if o, ok := f.Object().(*types.Func); ok {
			return o
		}
	}
	return nil
}

// args returns the receiver (if any) followed by the arguments, as the callee sees its parameters.
func args(c *ssa.CallCommon) []ssa.Value {
	if c.IsInvoke() {
		return append([]ssa.Value{c.Value}, c.Args...)
	}
	return c.Args
}

// ---- one function ------------------------------------------------------------------------------------

type fnState struct {
	e     *engine
	fn    *ssa.Function
	taint map[ssa.Value]Label
	// memory, keyed by the root an address points into: mem holds what was stored under an unknown key,
	// index or the whole value; memAt what was stored under a constant map key ("k:...") or a first-level
	// struct field ("f:i"); memKeys the labels of the keys stored into a map
	mem     map[ssa.Value]Label
	memAt   map[ssa.Value]map[string]Label
	memKeys map[ssa.Value]Label
	tuple   map[ssa.Value][]Label // per-element labels of a Next tuple (ok, key, value)
	iterOf  map[ssa.Value]ssa.Value
	origin  map[ssa.Value]map[Label]string // where each label of a value (or of a memory root) came from
	returns map[ssa.Value]bool             // memory roots the function returns
	sum     Summary
	changed bool
}

type origins = map[Label]string

func (e *engine) analyse(fn *ssa.Function) Summary {
	s := &fnState{e: e, fn: fn, taint: map[ssa.Value]Label{}, mem: map[ssa.Value]Label{}, memAt: map[ssa.Value]map[string]Label{},
		memKeys: map[ssa.Value]Label{}, tuple: map[ssa.Value][]Label{}, iterOf: map[ssa.Value]ssa.Value{}, origin: map[ssa.Value]origins{},
		returns: map[ssa.Value]bool{}}
	for _, b := range fn.Blocks {
		for _, ins := range b.Instrs {
			if r, ok := ins.(*ssa.Return); ok {
				for _, v := range r.Results {
					s.returns[root(v)] = true
				}
			}
		}
	}
	for i, p := range fn.Params {
		s.set(p, marker(i)|typeLabel(p.Type()), nil)
	}
	for j, fv := range fn.FreeVars {
		var l Label
		if b := e.freeVars[fn]; j < len(b) {
			l = b[j]
		}
		s.set(fv, l|typeLabel(fv.Type()), nil)
	}
	for iter := 0; iter < 30; iter++ {
		s.changed = false
		for _, b := range fn.Blocks {
			for _, ins := range b.Instrs {
				s.step(ins)
			}
		}
		if !s.changed {
			break
		}
	}
	// sinks: record the parameter sinks of the summary; findings are kept only in the reporting pass
	for _, b := range fn.Blocks {
		for _, ins := range b.Instrs {
			s.sinks(ins)
		}
	}
	if e.reporting {
		s.muxIDs()
		if d := os.Getenv("XPLINT_DEBUG"); d != "" && strings.Contains(fn.String(), d) {
			s.dump()
		}
	}
	sort.Slice(s.sum.ParamSinks, func(i, j int) bool {
		a, b := s.sum.ParamSinks[i], s.sum.ParamSinks[j]
		return a.Param < b.Param || a.Param == b.Param && (a.Where < b.Where || a.Where == b.Where && a.Kind < b.Kind)
	})
	return s.sum
}

// clean drops labels a value of this type cannot carry: booleans and errors carry none; numbers only
// numeric labels.
func clean(t types.Type, l Label) Label {
	if t == nil {
		return l
	}
	if t.String() == "error" {
		return 0
	}
	switch u := types.Unalias(t).Underlying().(type) {
	case *types.Basic:
		if u.Info()&types.IsBoolean != 0 {
			return 0
		}
		if u.Info()&types.IsNumeric != 0 {
			return l & (LNum | LWire | ^realMask)
		}
	case *types.Tuple:
		return l
	case *types.Signature:
		return 0
	}
	return l
}

// merge adds the origins of src for the labels in l to dst.
func merge(dst origins, src origins, l Label) origins {
	for bit, o := range src {
		if l&bit != 0 {
			if dst == nil {
				dst = origins{}
			}
			if _, ok := dst[bit]; !ok {
				dst[bit] = o
			}
		}
	}
	return dst
}

// at: an origin for every real label in l.
func at(l Label, o string) origins {
	out := origins{}
	for bit := Label(1); bit < 1<<realBits; bit <<= 1 {
		if l&bit != 0 {
			out[bit] = o
		}
	}
	return out
}

func (s *fnState) set(v ssa.Value, l Label, org origins) {
	if v == nil {
		return
	}
	l = clean(v.Type(), l)
	if old := s.taint[v]; old|l != old {
		s.taint[v] = old | l
		s.changed = true
	}
	if l&realMask != 0 {
		s.origin[v] = merge(s.origin[v], org, l)
	}
}

func (s *fnState) get(v ssa.Value) Label {
	if v == nil {
		return 0
	}
	if _, ok := v.(*ssa.Const); ok {
		return 0
	}
	return s.taint[v]
}

// fromBit: where label bit of v came from.
func (s *fnState) fromBit(v ssa.Value, bit Label) string {
	if o := s.origin[v][bit]; o != "" {
		return o
	}
	return s.origin[root(v)][bit]
}

// root: the value whose memory an address points into (an Alloc, a parameter, a global, a free variable,
// a map).
func root(v ssa.Value) ssa.Value {
	r, _ := rootSlot(v)
	return r
}

// rootSlot: the root of an address, and the first-level struct field of the root it points into ("f:i"),
// or "" when it points into an element or the whole value.
func rootSlot(addr ssa.Value) (ssa.Value, string) {
	sl, v := "", addr
	for i := 0; i < 32; i++ {
		switch x := v.(type) {
		case *ssa.FieldAddr:
			sl, v = fmt.Sprintf("f:%d", x.Field), x.X
		case *ssa.IndexAddr:
			sl, v = "", x.X
		case *ssa.Slice:
			sl, v = "", x.X
		default:
			return v, sl
		}
	}
	return v, ""
}

func constKey(k ssa.Value) string {
	if c, ok := k.(*ssa.Const); ok && c.Value != nil && c.Value.Kind() == constant.String {
		return "k:" + constant.StringVal(c.Value)
	}
	return ""
}

// memAll: everything stored in the memory rooted at v.
func (s *fnState) memAll(v ssa.Value) Label {
	r := root(v)
	l := s.mem[r]
	for _, x := range s.memAt[r] {
		l |= x
	}
	return l
}

// storeAt records labels stored into the memory of root r under slot sl ("" for an unknown place).
func (s *fnState) storeAt(r ssa.Value, sl string, l Label, org origins) {
	if sl == "" {
		if old := s.mem[r]; old|l != old {
			s.mem[r] = old | l
			s.changed = true
		}
	} else {
		if s.memAt[r] == nil {
			s.memAt[r] = map[string]Label{}
		}
		if old := s.memAt[r][sl]; old|l != old {
			s.memAt[r][sl] = old | l
			s.changed = true
		}
	}
	if l&realMask != 0 {
		s.origin[r] = merge(s.origin[r], org, l)
	}
}

// load: what a load from addr reads.
func (s *fnState) load(addr ssa.Value) Label {
	r, sl := rootSlot(addr)
	if sl == "" {
		return s.memAll(addr)
	}
	return s.mem[r] | s.memAt[r][sl]
}

func (s *fnState) pos(ins ssa.Instruction) string {
	p := ins.Pos()
	if !p.IsValid() {
		p = s.fn.Pos()
	}
	pp := s.e.pass.Fset.Position(p)
	return fmt.Sprintf("%s:%d", shortFile(pp.Filename), pp.Line)
}

func shortFile(f string) string {
	if i := strings.LastIndex(f, "/"); i >= 0 {
		if j := strings.LastIndex(f[:i], "/"); j >= 0 {
			return f[j+1:]
		}
		return f[i+1:]
	}
	return f
}

// step propagates labels through one instruction.
func (s *fnState) step(ins ssa.Instruction) {
	v, isVal := ins.(ssa.Value)
	var l Label
	var org origins
	pick := func(xs ...ssa.Value) {
		for _, x := range xs {
			xl := s.get(x)
			l |= xl
			org = merge(org, s.origin[x], xl)
		}
	}
	pickMem := func(r ssa.Value, ml Label) {
		l |= ml
		org = merge(org, s.origin[r], ml)
	}
	source := func(fl Label, what string) {
		l |= fl
		org = merge(org, at(fl, fmt.Sprintf("%s at %s", what, s.pos(ins))), fl)
	}
	switch x := ins.(type) {
	case *ssa.Phi:
		pick(x.Edges...)
	case *ssa.UnOp:
		pick(x.X)
		if x.Op == token.MUL { // load
			pickMem(root(x.X), s.load(x.X))
		}
	case *ssa.BinOp:
		switch x.Op {
		case token.EQL, token.NEQ, token.LSS, token.LEQ, token.GTR, token.GEQ:
		default:
			pick(x.X, x.Y)
		}
	case *ssa.Convert:
		pick(x.X)
		if textTypes[xdrName(x.X.Type())] {
			if b, ok := types.Unalias(x.Type()).Underlying().(*types.Basic); ok && b.Kind() == types.String {
				source(LText, "string("+xdrName(x.X.Type())+")")
			}
		}
	case *ssa.ChangeType:
		pick(x.X)
	case *ssa.MakeInterface:
		pick(x.X)
	case *ssa.ChangeInterface:
		pick(x.X)
	case *ssa.SliceToArrayPointer:
		pick(x.X)
	case *ssa.TypeAssert:
		pick(x.X)
	case *ssa.Extract:
		if tl, ok := s.tuple[x.Tuple]; ok && x.Index < len(tl) {
			l |= tl[x.Index]
			org = merge(org, s.origin[x.Tuple], tl[x.Index])
		} else {
			pick(x.Tuple)
		}
	case *ssa.Slice:
		pick(x.X)
	case *ssa.Index:
		pick(x.X)
	case *ssa.IndexAddr:
		pick(x.X)
		pickMem(root(x.X), s.memAll(x.X))
	case *ssa.Field:
		if s.get(x.X)&LFootRaw != 0 && footprintContract(x.X.Type(), x.Field) {
			source(LFootprint, "the declared footprint's contract")
		}
		// a field of a struct loaded whole from memory reads that field's slot only
		if ld, ok := x.X.(*ssa.UnOp); ok && ld.Op == token.MUL {
			if r, sl := rootSlot(ld.X); sl == "" && r == ld.X {
				l |= s.get(ld.X)
				pickMem(r, s.mem[r]|s.memAt[r][fmt.Sprintf("f:%d", x.Field)])
				break
			}
		}
		pick(x.X)
		if st, ok := types.Unalias(x.X.Type()).Underlying().(*types.Struct); ok {
			if fl := fieldLabel(x.X.Type(), st.Field(x.Field)); fl != 0 {
				source(fl, xdrName(x.X.Type())+"."+st.Field(x.Field).Name())
			}
		}
	case *ssa.FieldAddr:
		pick(x.X)
		// an address carries what its slot holds, so the labels survive a phi or a copy of the pointer
		pickMem(root(x), s.load(x))
		if pt, ok := types.Unalias(x.X.Type()).Underlying().(*types.Pointer); ok && s.get(x.X)&LFootRaw != 0 && footprintContract(pt.Elem(), x.Field) {
			source(LFootprint, "the declared footprint's contract")
		}
		if pt, ok := types.Unalias(x.X.Type()).Underlying().(*types.Pointer); ok {
			if st, ok := pt.Elem().Underlying().(*types.Struct); ok {
				if fl := fieldLabel(pt.Elem(), st.Field(x.Field)); fl != 0 {
					source(fl, xdrName(pt.Elem())+"."+st.Field(x.Field).Name())
				}
			}
		}
	case *ssa.Lookup:
		// a map's value is what was stored under that key, not the key it was looked up with
		pick(x.X)
		r := root(x.X)
		if k := constKey(x.Index); k != "" {
			pickMem(r, s.mem[r]|s.memAt[r][k])
		} else {
			pickMem(r, s.memAll(x.X))
		}
	case *ssa.Range:
		pick(x.X)
		s.iterOf[x] = x.X
	case *ssa.Next:
		if src, ok := s.iterOf[x.Iter]; ok {
			r := root(src)
			whole := s.get(src)
			var kl, vl Label
			if _, isMap := types.Unalias(src.Type()).Underlying().(*types.Map); isMap {
				// a map's labels say what its values hold; its keys hold only what was stored as keys
				// (and, for a parameter, what the caller's keys hold)
				kl, vl = whole&^realMask|s.memKeys[r], whole|s.memAll(src)
			} else {
				kl, vl = whole, whole
			}
			old := s.tuple[x]
			if len(old) != 3 || old[1]|kl != old[1] || old[2]|vl != old[2] {
				s.tuple[x] = []Label{0, kl, vl}
				s.changed = true
			}
			s.origin[x] = merge(merge(s.origin[x], s.origin[src], whole), s.origin[r], kl|vl)
		}
		pick(x.Iter)
	case *ssa.MakeClosure:
		fn := x.Fn.(*ssa.Function)
		b := s.e.freeVars[fn]
		for len(b) < len(x.Bindings) {
			b = append(b, 0)
		}
		for j, bv := range x.Bindings {
			bl := (s.get(bv) | s.memAll(bv)) & realMask
			if b[j]|bl != b[j] {
				b[j] |= bl
				s.changed = true
			}
		}
		s.e.freeVars[fn] = b
	case *ssa.Store:
		r, sl := rootSlot(x.Addr)
		vl := s.get(x.Val) | s.memAll(x.Val)
		s.storeAt(r, sl, vl, merge(merge(nil, s.origin[x.Val], vl), s.origin[root(x.Val)], vl))
	case *ssa.MapUpdate:
		r := root(x.Map)
		vl := s.get(x.Value) | s.memAll(x.Value)
		s.storeAt(r, constKey(x.Key), vl, merge(merge(nil, s.origin[x.Value], vl), s.origin[root(x.Value)], vl))
		if kl := s.get(x.Key); s.memKeys[r]|kl != s.memKeys[r] {
			s.memKeys[r] |= kl
			s.changed = true
			s.origin[r] = merge(s.origin[r], s.origin[x.Key], kl)
		}
	case *ssa.Send:
		s.storeAt(root(x.Chan), "", s.get(x.X), s.origin[x.X])
	case *ssa.Return:
		g := s.gated(x.Block()) // a value returned on a checked path is clean of what the check rules out
		for _, r := range x.Results {
			if _, isMap := types.Unalias(r.Type()).Underlying().(*types.Map); isMap {
				s.sum.RetKeys |= s.memKeys[root(r)] &^ g & realMask
			}
			rl := (s.get(r) | s.memAll(r)) &^ g
			s.sum.Ret |= rl & realMask
			s.sum.RetFrom |= uint32(rl >> paramShift)
			for bit := Label(1); bit < 1<<realBits; bit <<= 1 {
				if rl&bit != 0 && s.fromBit(r, bit) != "" && s.sum.RetOrigins[bit] == "" {
					if s.sum.RetOrigins == nil {
						s.sum.RetOrigins = map[Label]string{}
					}
					s.sum.RetOrigins[bit] = s.fromBit(r, bit)
				}
			}
		}
	case *ssa.Call:
		var o string
		var so origins
		l, o, so = s.callWithOrigins(x, x.Common())
		org = merge(org, so, l)
		if k := s.retKeys(x.Common()); k != 0 && s.memKeys[x]|k != s.memKeys[x] {
			s.memKeys[x] |= k
			s.changed = true
		}
		org = merge(org, s.callOrigins(x.Common()), l)
		if o != "" {
			org = merge(org, at(l, o), l)
		}
	case *ssa.Go:
		s.call(x, x.Common())
	case *ssa.Defer:
		s.call(x, x.Common())
	}
	if isVal {
		if tl := typeLabel(v.Type()); tl != 0 && l&tl == 0 {
			l |= tl
			org = merge(org, at(tl, fmt.Sprintf("%s at %s", types.TypeString(v.Type(), relTo(s.e.pass.Pkg)), s.pos(ins))), tl)
		}
		s.set(v, l, org)
	}
}

// retKeys: the key labels of a map the callee returns, from its summary.
func (s *fnState) retKeys(c *ssa.CallCommon) Label {
	if callee := s.e.calleeOf(s.fn, c); callee != nil {
		return s.e.summary[callee].RetKeys
	}
	if obj := callObj(c); obj != nil && obj.Pkg() != s.e.pass.Pkg && !stellarPkg(obj.Pkg(), "xdr") {
		var f funcFact
		if s.e.pass.ImportObjectFact(obj, &f) {
			return f.S.RetKeys
		}
	}
	return 0
}

// callOrigins: the origins of a call's arguments, which its result inherits.
func (s *fnState) callOrigins(c *ssa.CallCommon) origins {
	var o origins
	for _, a := range args(c) {
		o = merge(o, s.origin[a], s.get(a))
		o = merge(o, s.origin[root(a)], s.memAll(a))
	}
	return o
}

func relTo(p *types.Package) types.Qualifier {
	return func(o *types.Package) string {
		if o == p {
			return ""
		}
		return o.Name()
	}
}

// call propagates through a call and returns the labels of its result.
func (s *fnState) call(ins ssa.Instruction, c *ssa.CallCommon) (Label, string) {
	l, o, _ := s.callWithOrigins(ins, c)
	return l, o
}

// callWithOrigins also returns the per-label origins a callee's summary states.
func (s *fnState) callWithOrigins(ins ssa.Instruction, c *ssa.CallCommon) (Label, string, origins) {
	as := args(c)
	if b, ok := c.Value.(*ssa.Builtin); ok {
		var l Label
		var org string
		switch b.Name() {
		case "len", "cap", "delete", "close", "print", "println", "panic", "recover", "clear":
			return 0, "", nil
		case "append":
			for _, a := range as {
				l |= s.get(a) | s.memAll(a)
			}
		case "copy":
			if len(as) == 2 {
				s.storeAt(root(as[0]), "", s.get(as[1])|s.memAll(as[1]), s.origin[as[1]])
			}
		case "min", "max":
			for _, a := range as {
				if _, isConst := a.(*ssa.Const); isConst {
					return 0, "", nil // bounded by a constant
				}
				l |= s.get(a)
			}
		default:
			for _, a := range as {
				l |= s.get(a)
			}
		}
		return l, org, nil
	}
	obj := callObj(c)
	key := keyOf(obj)
	var l Label
	var org string // only a source's own origin; argument origins are merged by the caller of call
	for _, a := range as {
		l |= s.get(a) | s.memAll(a)
	}
	// a source: its label, on top of whatever its receiver and arguments carry, unless a check that
	// dominates the call already rules it out (a switch on the address kind before ScAddress.String)
	if src, ok := sourceCalls[key]; ok {
		if hostConstrained(key, as) {
			return l, org, nil
		}
		src &^= s.gated(ins.Block())
		if src == 0 {
			return l, org, nil
		}
		return src | l, fmt.Sprintf("%s.%s at %s", key.recv, key.name, s.pos(ins)), nil
	}
	if obj != nil && footprintFuncs[obj.Name()] {
		return LFootprint | l, fmt.Sprintf("%s at %s", obj.Name(), s.pos(ins)), nil
	}
	// a sanitizer
	if cl, ok := cleanCalls[key]; ok {
		return l &^ cl, org, nil
	}
	if key.pkg == "fmt" && strings.HasPrefix(key.name, "Sprintf") && len(c.Args) > 0 {
		if k, ok := c.Args[0].(*ssa.Const); ok && k.Value != nil && k.Value.Kind() == constant.String {
			f := constant.StringVal(k.Value)
			if strings.Contains(f, "%q") || strings.Contains(f, "%x") || strings.Contains(f, "%X") {
				return l &^ LText, org, nil
			}
		}
	}
	// a function of this package, or one summarised in another package
	var sum *Summary
	if callee := s.e.calleeOf(s.fn, c); callee != nil {
		if sm, ok := s.e.summary[callee]; ok {
			sum = &sm
		}
	}
	if sum == nil && obj != nil && obj.Pkg() != s.e.pass.Pkg && !stellarPkg(obj.Pkg(), "xdr") {
		var f funcFact
		if s.e.pass.ImportObjectFact(obj, &f) {
			sum = &f.S
		}
	}
	if sum != nil {
		rl := sum.Ret

		for i, a := range as {
			if i < 32 && sum.RetFrom&(1<<i) != 0 {
				rl |= s.get(a) | s.memAll(a)
			}
		}
		return rl, "", sum.RetOrigins
	}
	// an unknown callee: its result derives from its arguments
	return l, org, nil
}

// footprintContract: the Contract field of a contract-data ledger key.
func footprintContract(t types.Type, field int) bool {
	if xdrName(t) != "LedgerKeyContractData" {
		return false
	}
	st, ok := types.Unalias(t).Underlying().(*types.Struct)
	return ok && st.Field(field).Name() == "Contract"
}

// hostConstrained: ScAddress.String on the contract field of a contract-data entry or key. The host only
// creates contract data under a contract address (or, for nonces, the G or C address that authorised),
// so it is never muxed, a claimable balance or a pool.
func hostConstrained(key apiKey, as []ssa.Value) bool {
	if key != (apiKey{"xdr", "ScAddress", "String"}) || len(as) == 0 {
		return false
	}
	v := as[0]
	if u, ok := v.(*ssa.UnOp); ok && u.Op == token.MUL {
		v = u.X
	}
	var st types.Type
	var idx int
	switch f := v.(type) {
	case *ssa.Field:
		st, idx = f.X.Type(), f.Field
	case *ssa.FieldAddr:
		if pt, ok := types.Unalias(f.X.Type()).Underlying().(*types.Pointer); ok {
			st, idx = pt.Elem(), f.Field
		}
	default:
		return false
	}
	n := xdrName(st)
	if n != "ContractDataEntry" && n != "LedgerKeyContractData" {
		return false
	}
	s, ok := st.Underlying().(*types.Struct)
	return ok && s.Field(idx).Name() == "Contract"
}

// ---- gates -------------------------------------------------------------------------------------------

// gated returns the labels a gate clears at block b: a success check, a membership check against a
// collection the indexer built itself, a UTF-8 check, a bound against a constant, an address-kind check.
func (s *fnState) gated(b *ssa.BasicBlock) Label {
	var g Label
	if s.e.gatedFn[s.fn] {
		g |= LOpBody | LDiag
	}
	// every block that dominates b: if each edge into it carries a check, the check holds at b
	for a := b; a != nil; a = a.Idom() {
		g |= s.edgeGate(a)
	}
	return g
}

// edgeGate: the labels every incoming edge of block a clears (the intersection over its predecessors),
// so a `case A, B:` with two edges counts when both compare the address kind.
func (s *fnState) edgeGate(a *ssa.BasicBlock) Label {
	if len(a.Preds) == 0 {
		return 0
	}
	all := ^Label(0)
	for _, p := range a.Preds {
		if len(p.Instrs) == 0 {
			return 0
		}
		iff, ok := p.Instrs[len(p.Instrs)-1].(*ssa.If)
		if !ok || len(p.Succs) != 2 || p.Succs[0] == p.Succs[1] {
			return 0
		}
		all &= s.gateOf(iff.Cond, a == p.Succs[0])
	}
	return all
}

// gateOf: what holds on the branch taken when cond is `truth`.
func (s *fnState) gateOf(cond ssa.Value, truth bool) Label {
	var g Label
	switch x := cond.(type) {
	case *ssa.Call:
		c := x.Common()
		obj := callObj(c)
		key := keyOf(obj)
		as := args(c)
		if truth && obj != nil && successMethods[obj.Name()] {
			g |= LOpBody | LDiag
		}
		if truth && utf8Guards[key] {
			g |= LText
		}
		if truth && accountGuards[key] {
			g |= LMuxed
		}
		if truth && obj != nil && (obj.Name() == "Contains" || obj.Name() == "Has" || obj.Name() == "ContainsOne" || obj.Name() == "ContainsAny") && len(as) >= 2 {
			if (s.get(as[0])|s.memAll(as[0]))&realMask == 0 && s.get(as[1])&(LAuth|LFootprint) != 0 {
				g |= LAuth | LFootprint
			}
		}
		if truth && s.validatesUTF8(c) {
			g |= LText
		}
	case *ssa.Extract:
		// v, ok := m[k]; if ok { ... }: k is confirmed against a map the indexer built
		if lk, ok := x.Tuple.(*ssa.Lookup); ok && x.Index == 1 && truth {
			if (s.get(lk.X)|s.memAll(lk.X))&realMask == 0 && s.get(lk.Index)&(LAuth|LFootprint) != 0 {
				g |= LAuth | LFootprint
			}
		}
	case *ssa.UnOp:
		if x.Op == token.NOT {
			g |= s.gateOf(x.X, !truth)
		}
	case *ssa.BinOp:
		switch x.Op {
		case token.LSS, token.LEQ, token.GTR, token.GEQ:
			// n compared with a constant: bounded on either branch
			if isConst(x.X) && s.get(x.Y)&(LNum|LWire) != 0 || isConst(x.Y) && s.get(x.X)&(LNum|LWire) != 0 {
				g |= LNum | LWire
			}
		case token.EQL, token.NEQ:
			// a switch on the address kind, or the transaction's result code
			for _, side := range []ssa.Value{x.X, x.Y} {
				if addressKindTypes[xdrName(side.Type())] && (isConst(x.X) || isConst(x.Y)) {
					g |= LMuxed
				}
				if xdrName(side.Type()) == "TransactionResultCode" && (x.Op == token.EQL) == truth {
					g |= LOpBody | LDiag
				}
			}
			// err == nil after a UTF-8 validator
			if (x.Op == token.EQL) == truth {
				for _, side := range []ssa.Value{x.X, x.Y} {
					if ex, ok := side.(*ssa.Extract); ok {
						if call, ok := ex.Tuple.(*ssa.Call); ok && s.validatesUTF8(call.Common()) {
							g |= LText
						}
					}
					if call, ok := side.(*ssa.Call); ok && s.validatesUTF8(call.Common()) {
						g |= LText
					}
				}
			}
		case token.LAND:
		}
	}
	return g
}

func isConst(v ssa.Value) bool { _, ok := v.(*ssa.Const); return ok }

// validatesUTF8: a call to a function that checks one of its tainted arguments is valid UTF-8.
func (s *fnState) validatesUTF8(c *ssa.CallCommon) bool {
	as := args(c)
	var mask uint32
	if callee := s.e.calleeOf(s.fn, c); callee != nil {
		mask = s.e.summary[callee].ValidatesUTF8
	} else if obj := callObj(c); obj != nil && obj.Pkg() != s.e.pass.Pkg {
		var f funcFact
		if s.e.pass.ImportObjectFact(obj, &f) {
			mask = f.S.ValidatesUTF8
		}
	}
	for i, a := range as {
		if i < 32 && mask&(1<<i) != 0 && s.get(a)&LText != 0 {
			return true
		}
	}
	return false
}

// computeGatedFns: functions every local caller reaches only on a success-gated branch.
func (e *engine) computeGatedFns() {
	g := map[*ssa.Function]bool{}
	for iter := 0; iter < 10; iter++ {
		changed := false
		for _, fn := range e.fns {
			cs := e.callers[fn]
			if len(cs) == 0 || g[fn] {
				continue
			}
			all := true
			for _, c := range cs {
				parent := c.Parent()
				if g[parent] {
					continue
				}
				st := &fnState{e: e, fn: parent, taint: map[ssa.Value]Label{}, mem: map[ssa.Value]Label{}}
				if st.gated(c.Block())&LOpBody == 0 {
					all = false
					break
				}
			}
			if all {
				g[fn] = true
				changed = true
			}
		}
		if !changed {
			break
		}
	}
	e.gatedFn = g
}

// ---- sinks -------------------------------------------------------------------------------------------

func (s *fnState) sinks(ins ssa.Instruction) {
	switch x := ins.(type) {
	case *ssa.Call:
		s.callSinks(ins, x.Common())
	case *ssa.Go:
		s.callSinks(ins, x.Common())
	case *ssa.Defer:
		s.callSinks(ins, x.Common())
	case *ssa.MapUpdate:
		if addressLike(x.Key.Type()) {
			s.hit(ins, sinkMapKey, x.Key, "a map key")
		}
		if it, ok := types.Unalias(x.Map.Type()).Underlying().(*types.Map); ok {
			if _, isIface := it.Elem().Underlying().(*types.Interface); isIface || addressLike(it.Elem()) {
				s.hitInto(ins, sinkMapValue, x.Value, "a map value", root(x.Map))
			}
		}
	case *ssa.Store:
		if fa, ok := x.Addr.(*ssa.FieldAddr); ok {
			if pt, ok := types.Unalias(fa.X.Type()).Underlying().(*types.Pointer); ok {
				if st, ok := pt.Elem().Underlying().(*types.Struct); ok && storageTag(st.Tag(fa.Field)) {
					s.hitInto(ins, sinkText, x.Val, fmt.Sprintf("field %s (tag %s)", st.Field(fa.Field).Name(), st.Tag(fa.Field)), root(fa.X))
				}
			}
		}
	case *ssa.MakeSlice:
		s.hit(ins, sinkAlloc, x.Len, "make() length")
		if x.Cap != x.Len {
			s.hit(ins, sinkAlloc, x.Cap, "make() capacity")
		}
	case *ssa.MakeMap:
		if x.Reserve != nil {
			s.hit(ins, sinkAlloc, x.Reserve, "make() size")
		}
	case *ssa.MakeChan:
		s.hit(ins, sinkAlloc, x.Size, "make() size")
	case *ssa.BinOp:
		if x.Op == token.SHL || x.Op == token.SHR {
			s.hit(ins, sinkNum, x.Y, "a shift count")
		}
	}
}

func (s *fnState) callSinks(ins ssa.Instruction, c *ssa.CallCommon) {
	obj := callObj(c)
	key := keyOf(obj)
	as := args(c)
	callee := s.e.calleeOf(s.fn, c)
	if obj != nil {
		s.catalogueSinks(ins, c, obj, key, as)
	}
	// arguments that reach a sink inside the callee (a function of this package, a closure, or a
	// function summarised in another package)
	var sum *Summary
	name := ""
	if callee != nil {
		if sm, ok := s.e.summary[callee]; ok {
			sum = &sm
		}
		name = callee.Name()
		if obj == nil && callee.Parent() != nil {
			name = "the closure at " + s.posOf(callee.Pos())
		}
	} else if obj != nil && obj.Pkg() != s.e.pass.Pkg && !stellarPkg(obj.Pkg(), "xdr") {
		var f funcFact
		if s.e.pass.ImportObjectFact(obj, &f) {
			sum = &f.S
		}
		name = obj.Name()
	}
	if sum == nil {
		return
	}
	for _, ps := range sum.ParamSinks {
		if ps.Param >= len(as) {
			continue
		}
		s.hitVia(ins, ps.Kind, as[ps.Param], ps.Labels, ps.Where, name, false)
	}
	if sum.ValidatesUTF8 != 0 {
		for i, a := range as {
			if i < 32 && sum.ValidatesUTF8&(1<<i) != 0 {
				s.sum.ValidatesUTF8 |= uint32(s.get(a) >> paramShift)
			}
		}
	}
}

func (s *fnState) posOf(p token.Pos) string {
	pp := s.e.pass.Fset.Position(p)
	return fmt.Sprintf("%s:%d", shortFile(pp.Filename), pp.Line)
}

// catalogueSinks: the sinks named in sdk.go (attribution methods, database writes, encoders, numbers).
func (s *fnState) catalogueSinks(ins ssa.Instruction, c *ssa.CallCommon, obj *types.Func, key apiKey, as []ssa.Value) {
	// a UTF-8 check on a value derived from a parameter: this function validates that parameter
	if utf8Guards[key] {
		for _, a := range as {
			s.sum.ValidatesUTF8 |= uint32(s.get(a) >> paramShift)
		}
	}
	switch {
	case recvName(obj) == "" && strings.HasPrefix(obj.Name(), "New") && strings.Contains(obj.Name(), "Set"):
		// a set built with its first members: set.NewThreadUnsafeSet(op.SourceAccount().Address())
		for _, a := range as {
			if addressLike(a.Type()) {
				s.hit(ins, sinkAttr, a, obj.Name()+"()")
			}
		}
	case isAttributionMethod(obj.Name()) && recvName(obj) != "" || c.IsInvoke() && isAttributionMethod(obj.Name()):
		for _, a := range as[1:] {
			if addressLike(a.Type()) {
				s.hit(ins, sinkAttr, a, "."+obj.Name()+"()")
			}
		}
	case dbMethods[obj.Name()] && len(as) > 0 && isDBReceiver(as[0].Type()):
		for _, a := range as[1:] {
			s.hit(ins, sinkText, a, "a database write ("+obj.Name()+")")
		}
	case encodeCalls[key]:
		for _, a := range as {
			s.hit(ins, sinkText, a, "a JSON encoder")
		}
	case numberSinks[key]:
		for _, a := range as {
			s.hit(ins, sinkNum, a, key.name+"()")
		}
	}
}

// hit: value v reaches a sink of this kind at ins. where is "file:line|what".
func (s *fnState) hit(ins ssa.Instruction, kind string, v ssa.Value, what string) {
	s.hitVia(ins, kind, v, sinkLabels[kind], s.pos(ins)+"|"+what, "", false)
}

// hitInto: v is stored into memory rooted at target. When the function returns that memory, a value
// derived from its parameters is only building the result (its callers see it through the summary's
// RetFrom), so it is not a parameter sink; values with labels of their own still report here.
func (s *fnState) hitInto(ins ssa.Instruction, kind string, v ssa.Value, what string, target ssa.Value) {
	s.hitVia(ins, kind, v, sinkLabels[kind], s.pos(ins)+"|"+what, "", s.returns[target])
}

// hitVia: v reaches a sink, here or (via != "") inside the callee via, at where.
func (s *fnState) hitVia(ins ssa.Instruction, kind string, v ssa.Value, labels Label, where, via string, noParams bool) {
	if v == nil {
		return
	}
	l := s.get(v) | s.memAll(v)
	g := s.gated(ins.Block())
	// derived from this function's own parameters: part of its summary
	if pm := l >> paramShift; pm != 0 && labels&^g != 0 && !noParams {
		for i := 0; i < maxParams; i++ {
			if pm&(1<<i) != 0 {
				s.sum.ParamSinks = appendSink(s.sum.ParamSinks, ParamSink{Param: i, Kind: kind, Labels: labels &^ g, Where: where})
			}
		}
	}
	real := l & labels & realMask &^ g
	if real == 0 || !s.e.reporting {
		return
	}
	sinkPos, what := where, ""
	if i := strings.Index(where, "|"); i >= 0 {
		sinkPos, what = where[:i], where[i+1:]
	}
	pos := ins.Pos()
	if !pos.IsValid() {
		pos = s.fn.Pos()
	}
	for bit := Label(1); bit < 1<<realBits; bit <<= 1 {
		if real&bit == 0 {
			continue
		}
		msg := fmt.Sprintf("%s reaches %s", labelSource[bit], what)
		if via != "" {
			msg = fmt.Sprintf("%s is passed to %s, where it reaches %s at %s", labelSource[bit], via, what, sinkPos)
		}
		if o := s.fromBit(v, bit); o != "" {
			msg += "; it comes from " + o
		}
		k := fmt.Sprintf("%d|%s", pos, labelRule[bit])
		if _, dup := s.e.findings[k]; !dup {
			s.e.findings[k] = Finding{Pos: pos, Rule: labelRule[bit], Message: msg}
		}
	}
}

// muxIDs: XP001/mux-id-as-identity. A muxed ID read with its error dropped (a G account has no ID,
// so the value is 0), or narrowed to a signed or floating type.
func (s *fnState) muxIDs() {
	report := func(pos token.Pos, msg string) {
		k := fmt.Sprintf("%d|XP001/mux-id-as-identity", pos)
		if _, dup := s.e.findings[k]; !dup {
			s.e.findings[k] = Finding{Pos: pos, Rule: "XP001/mux-id-as-identity", Message: msg}
		}
	}
	isID := func(v ssa.Value) bool {
		switch x := v.(type) {
		case *ssa.Extract:
			if c, ok := x.Tuple.(*ssa.Call); ok && x.Index == 0 && keyOf(callObj(c.Common())) == (apiKey{"xdr", "MuxedAccount", "GetId"}) {
				return true
			}
		case *ssa.Field:
			if xdrName(x.X.Type()) == "MuxedAccountMed25519" {
				if st, ok := types.Unalias(x.X.Type()).Underlying().(*types.Struct); ok && st.Field(x.Field).Name() == "Id" {
					return true
				}
			}
		case *ssa.UnOp:
			if fa, ok := x.X.(*ssa.FieldAddr); ok && x.Op == token.MUL {
				if pt, ok := types.Unalias(fa.X.Type()).Underlying().(*types.Pointer); ok && xdrName(pt.Elem()) == "MuxedAccountMed25519" {
					if st, ok := pt.Elem().Underlying().(*types.Struct); ok && st.Field(fa.Field).Name() == "Id" {
						return true
					}
				}
			}
		}
		return false
	}
	for _, b := range s.fn.Blocks {
		for _, ins := range b.Instrs {
			switch x := ins.(type) {
			case *ssa.Call:
				if keyOf(callObj(x.Common())) != (apiKey{"xdr", "MuxedAccount", "GetId"}) {
					continue
				}
				usesErr := false
				for _, r := range *x.Referrers() {
					if ex, ok := r.(*ssa.Extract); ok && ex.Index == 1 && len(*ex.Referrers()) > 0 {
						usesErr = true
					}
				}
				if !usesErr {
					report(x.Pos(), "the error from MuxedAccount.GetId is dropped: a plain G account has no ID, so the value is 0, indistinguishable from ID 0")
				}
			case *ssa.Convert:
				if !isID(x.X) {
					continue
				}
				if b, ok := types.Unalias(x.Type()).Underlying().(*types.Basic); ok && (b.Info()&types.IsFloat != 0 || b.Info()&types.IsInteger != 0 && b.Info()&types.IsUnsigned == 0) {
					report(x.Pos(), fmt.Sprintf("a muxed ID (64 unsigned bits) is converted to %s: IDs above %s change value", b.Name(), map[bool]string{true: "2^53", false: "2^63-1"}[b.Info()&types.IsFloat != 0]))
				}
			}
		}
	}
}

func appendSink(xs []ParamSink, p ParamSink) []ParamSink {
	for _, x := range xs {
		if x == p {
			return xs
		}
	}
	return append(xs, p)
}

// dump prints every instruction of the function with the labels of its value (XPLINT_DEBUG).
func (s *fnState) dump() {
	fmt.Fprintf(os.Stderr, "== %s  summary %+v\n", s.fn, s.sum)
	for _, b := range s.fn.Blocks {
		fmt.Fprintf(os.Stderr, "  block %d (idom %v, preds %d)\n", b.Index, b.Idom(), len(b.Preds))
		for _, ins := range b.Instrs {
			lab := ""
			if v, ok := ins.(ssa.Value); ok {
				lab = fmt.Sprintf("%s = [%08b|p%x mem=%08b]", v.Name(), s.taint[v]&realMask, s.taint[v]>>paramShift, s.memAll(v)&realMask)
			}
			fmt.Fprintf(os.Stderr, "    %-36s %s\n", lab, ins)
		}
	}
}
