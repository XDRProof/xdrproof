package xplint

import (
	"go/ast"
	"go/constant"
	"go/token"
	"go/types"
	"sort"
	"strings"
	"sync"

	"golang.org/x/tools/go/analysis"
)

// ImplicitWalk turns on XP002/implicit-walk (off by default).
var ImplicitWalk = false

// Self-referential xdr types whose nesting stellar-core bounds itself, so a walk needs no budget of its own.
var coreBounded = map[string]string{
	"ClaimPredicate": "stellar-core v30.0.0 CreateClaimableBalanceOpFrame.cpp:78 rejects a predicate deeper than 4",
	"ScpQuorumSet":   "stellar-core v30.0.0 QuorumSetUtils.cpp:16,60 rejects a quorum set nested deeper than 4",
}

var (
	recMu    sync.Mutex
	recCache = map[*types.Package]map[string]bool{}
)

// RecursiveXDRTypes: the named types of the xdr package that can contain themselves (through fields,
// pointers, slices and union arms), computed from the package's own types, minus those core bounds.
// For go-stellar-sdk v0.9.0 this includes ScVal, ScVec, ScMap, ScMapEntry, SorobanAuthorizedInvocation,
// SorobanDelegateSignature (CAP-0071 nested delegates) and the contract-spec types.
func RecursiveXDRTypes(xdrPkg *types.Package) map[string]bool {
	recMu.Lock()
	defer recMu.Unlock()
	if r, ok := recCache[xdrPkg]; ok {
		return r
	}
	edges := map[string]map[string]bool{}
	scope := xdrPkg.Scope()
	var reach func(t types.Type, from string, seen map[types.Type]bool)
	reach = func(t types.Type, from string, seen map[types.Type]bool) {
		if t == nil || seen[t] {
			return
		}
		seen[t] = true
		switch u := types.Unalias(t).(type) {
		case *types.Named:
			if u.Obj().Pkg() == xdrPkg {
				edges[from][u.Obj().Name()] = true
				return
			}
			reach(u.Underlying(), from, seen)
		case *types.Pointer:
			reach(u.Elem(), from, seen)
		case *types.Slice:
			reach(u.Elem(), from, seen)
		case *types.Array:
			reach(u.Elem(), from, seen)
		case *types.Map:
			reach(u.Key(), from, seen)
			reach(u.Elem(), from, seen)
		case *types.Struct:
			for i := 0; i < u.NumFields(); i++ {
				reach(u.Field(i).Type(), from, seen)
			}
		}
	}
	for _, name := range scope.Names() {
		tn, ok := scope.Lookup(name).(*types.TypeName)
		if !ok {
			continue
		}
		edges[name] = map[string]bool{}
		reach(tn.Type().Underlying(), name, map[types.Type]bool{})
	}
	// a type is recursive when it reaches itself
	out := map[string]bool{}
	for name := range edges {
		seen := map[string]bool{}
		stack := []string{name}
		for len(stack) > 0 {
			n := stack[len(stack)-1]
			stack = stack[:len(stack)-1]
			for m := range edges[n] {
				if m == name {
					out[name] = true
				}
				if !seen[m] {
					seen[m] = true
					stack = append(stack, m)
				}
			}
		}
	}
	for n := range coreBounded {
		delete(out, n)
	}
	recCache[xdrPkg] = out
	return out
}

// findXDR returns the xdr package among pkg's transitive imports.
func findXDR(pkg *types.Package) *types.Package {
	seen := map[*types.Package]bool{}
	var walk func(p *types.Package) *types.Package
	walk = func(p *types.Package) *types.Package {
		if seen[p] {
			return nil
		}
		seen[p] = true
		if stellarPkg(p, "xdr") {
			return p
		}
		for _, q := range p.Imports() {
			if r := walk(q); r != nil {
				return r
			}
		}
		return nil
	}
	return walk(pkg)
}

func recursiveIn(rec map[string]bool, t types.Type) string {
	if n := xdrName(t); n != "" && rec[n] {
		return n
	}
	return ""
}

// unit is one function declaration or one closure assigned to a variable.
type unit struct {
	obj    types.Object
	name   string
	pos    token.Pos
	ftype  *ast.FuncType
	recv   *ast.FieldList
	body   *ast.BlockStmt
	callee map[types.Object]bool
}

func calleeObj(info *types.Info, call *ast.CallExpr) types.Object {
	switch f := ast.Unparen(call.Fun).(type) {
	case *ast.Ident:
		return info.ObjectOf(f)
	case *ast.SelectorExpr:
		return info.ObjectOf(f.Sel)
	}
	return nil
}

func intVar(o types.Object) bool {
	v, ok := o.(*types.Var)
	if !ok {
		return false
	}
	b, ok := types.Unalias(v.Type()).(*types.Basic)
	return ok && b.Info()&types.IsInteger != 0
}

// mutatedInts: integer variables and fields assigned or incremented anywhere in the package.
func mutatedInts(pass *analysis.Pass) map[types.Object]bool {
	m := map[types.Object]bool{}
	mark := func(e ast.Expr) {
		switch x := e.(type) {
		case *ast.Ident:
			if o := pass.TypesInfo.ObjectOf(x); o != nil && intVar(o) {
				m[o] = true
			}
		case *ast.SelectorExpr:
			if o := pass.TypesInfo.ObjectOf(x.Sel); o != nil && intVar(o) {
				m[o] = true
			}
		}
	}
	for _, f := range pass.Files {
		ast.Inspect(f, func(n ast.Node) bool {
			switch x := n.(type) {
			case *ast.IncDecStmt:
				mark(x.X)
			case *ast.AssignStmt:
				if x.Tok != token.DEFINE {
					for _, l := range x.Lhs {
						mark(l)
					}
				}
			}
			return true
		})
	}
	return m
}

// budgetChecks: the conditions in u that compare an integer which changes across the recursion: a
// parameter a call on the cycle passes as a new expression (depth+1), or a counter declared outside
// the walker and assigned somewhere. Comparisons with len() never count; == and != count only for a
// count-down parameter (if maxDepth == 0).
func budgetChecks(info *types.Info, u *unit, cycle map[types.Object]bool, mutated map[types.Object]bool) []*ast.IfStmt {
	params := map[types.Object]bool{}
	if u.ftype.Params != nil {
		for _, f := range u.ftype.Params.List {
			for _, n := range f.Names {
				if o := info.ObjectOf(n); o != nil && intVar(o) {
					params[o] = true
				}
			}
		}
	}
	stepped := map[types.Object]bool{}
	ast.Inspect(u.body, func(n ast.Node) bool {
		call, ok := n.(*ast.CallExpr)
		if !ok || !cycle[calleeObj(info, call)] {
			return true
		}
		for _, a := range call.Args {
			if _, plain := a.(*ast.Ident); plain {
				continue
			}
			ast.Inspect(a, func(m ast.Node) bool {
				if id, ok := m.(*ast.Ident); ok && params[info.ObjectOf(id)] {
					stepped[info.ObjectOf(id)] = true
				}
				return true
			})
		}
		return true
	})
	changes := func(o types.Object) bool {
		if o == nil || !intVar(o) {
			return false
		}
		if stepped[o] {
			return true
		}
		local := o.Pos() >= u.body.Pos() && o.Pos() <= u.body.End()
		return mutated[o] && !local
	}
	isLen := func(e ast.Expr) bool {
		call, ok := e.(*ast.CallExpr)
		if !ok {
			return false
		}
		id, ok := call.Fun.(*ast.Ident)
		return ok && id.Name == "len"
	}
	isBudget := func(e ast.Expr) bool {
		found := false
		ast.Inspect(e, func(n ast.Node) bool {
			be, ok := n.(*ast.BinaryExpr)
			if !ok {
				return true
			}
			switch be.Op {
			case token.LSS, token.GTR, token.LEQ, token.GEQ, token.EQL, token.NEQ:
				if isLen(be.X) || isLen(be.Y) {
					return true
				}
				for _, side := range []ast.Expr{be.X, be.Y} {
					ast.Inspect(side, func(m ast.Node) bool {
						if id, ok := m.(*ast.Ident); ok && changes(info.ObjectOf(id)) {
							if (be.Op == token.EQL || be.Op == token.NEQ) && !params[info.ObjectOf(id)] {
								return true
							}
							found = true
						}
						return true
					})
				}
			}
			return true
		})
		return found
	}
	var out []*ast.IfStmt
	ast.Inspect(u.body, func(n ast.Node) bool {
		if is, ok := n.(*ast.IfStmt); ok && isBudget(is.Cond) {
			out = append(out, is)
		}
		return true
	})
	if len(out) == 0 {
		ast.Inspect(u.body, func(n ast.Node) bool {
			if fs, ok := n.(*ast.ForStmt); ok && fs.Cond != nil && isBudget(fs.Cond) {
				out = append(out, &ast.IfStmt{Cond: fs.Cond, Body: &ast.BlockStmt{}})
			}
			return true
		})
	}
	return out
}

var errorIface = types.Universe.Lookup("error").Type().Underlying().(*types.Interface)

// failsOnBudget: the budget check's own block returns a non-nil error.
func failsOnBudget(info *types.Info, is *ast.IfStmt) (token.Pos, bool) {
	for _, st := range is.Body.List {
		ret, ok := st.(*ast.ReturnStmt)
		if !ok || len(ret.Results) == 0 {
			continue
		}
		last := ret.Results[len(ret.Results)-1]
		if id, ok := last.(*ast.Ident); ok && id.Name == "nil" {
			continue
		}
		if t := info.TypeOf(last); t != nil && types.Implements(t, errorIface) {
			return ret.Pos(), true
		}
	}
	return token.NoPos, false
}

// structural runs the XP002 checks that need no data flow: unbudgeted recursive walks, walks that fail
// on their budget, unlimited decoders and (opt-in) implicit SDK walks.
func structural(pass *analysis.Pass) []Finding {
	var out []Finding
	report := func(pos token.Pos, rule, msg string) { out = append(out, Finding{Pos: pos, Rule: rule, Message: msg}) }
	xdrPkg := findXDR(pass.Pkg)
	if xdrPkg == nil {
		return nil
	}
	rec := RecursiveXDRTypes(xdrPkg)
	info := pass.TypesInfo

	// ---- decode-unlimited and implicit-walk: plain syntax
	for _, f := range pass.Files {
		if skipFile(pass, f.Pos()) {
			continue
		}
		ast.Inspect(f, func(n ast.Node) bool {
			switch x := n.(type) {
			case *ast.SelectorExpr:
				if x.Sel.Name == "DecodeUnlimitedDepth" {
					if o := info.ObjectOf(x.Sel); o != nil && o.Pkg() != nil && strings.Contains(o.Pkg().Path(), "stellar/go-xdr") {
						report(x.Pos(), "XP002/decode-unlimited", "xdr3.DecodeUnlimitedDepth turns the decoder's depth limit off; a submitter can nest an ScVal or an authorization tree until the stack is exhausted")
					}
				}
			case *ast.CompositeLit:
				if xdrName(info.TypeOf(x)) == "DecodeOptions" || strings.HasSuffix(types.TypeString(info.TypeOf(x), nil), "xdr3.DecodeOptions") {
					for _, el := range x.Elts {
						if kv, ok := el.(*ast.KeyValueExpr); ok {
							if id, ok := kv.Key.(*ast.Ident); ok && id.Name == "MaxDepth" {
								if tv, ok := info.Types[kv.Value]; ok && tv.Value != nil {
									if d, ok := constant.Int64Val(tv.Value); ok && d > 1500 {
										report(kv.Pos(), "XP002/decode-unlimited", "MaxDepth above the SDK default of 1500 lets a submitter nest values deeper than any reader expects")
									}
								}
							}
						}
					}
				}
			case *ast.CallExpr:
				if sel, ok := x.Fun.(*ast.SelectorExpr); ok && sel.Sel.Name == "DecodeFrom" && len(x.Args) == 2 {
					if tv, ok := info.Types[x.Args[1]]; ok && tv.Value != nil {
						if d, ok := constant.Int64Val(tv.Value); ok && d > 1500 {
							report(x.Pos(), "XP002/decode-unlimited", "DecodeFrom with a depth above the SDK default of 1500")
						}
					}
				}
				if ImplicitWalk {
					if sel, ok := x.Fun.(*ast.SelectorExpr); ok && (sel.Sel.Name == "String" || sel.Sel.Name == "Equals" || sel.Sel.Name == "GoString") {
						if n := recursiveIn(rec, info.TypeOf(sel.X)); n != "" {
							report(x.Pos(), "XP002/implicit-walk", n+"."+sel.Sel.Name+" recurses over the whole value with no budget of its own")
						}
					}
					if o := calleeObj(info, x); o != nil && o.Pkg() != nil && o.Pkg().Path() == "fmt" {
						for _, a := range x.Args {
							if n := recursiveIn(rec, info.TypeOf(a)); n != "" {
								report(a.Pos(), "XP002/implicit-walk", "fmt formats a "+n+" by walking all of it, with no budget")
							}
						}
					}
				}
			}
			return true
		})
	}

	// ---- walk-unbudgeted and budget-fails
	var units []*unit
	byObj := map[types.Object]*unit{}
	add := func(u *unit) {
		u.callee = map[types.Object]bool{}
		ast.Inspect(u.body, func(n ast.Node) bool {
			if call, ok := n.(*ast.CallExpr); ok {
				if o := calleeObj(info, call); o != nil {
					u.callee[o] = true
				}
			}
			return true
		})
		units = append(units, u)
		byObj[u.obj] = u
	}
	for _, f := range pass.Files {
		if skipFile(pass, f.Pos()) {
			continue
		}
		ast.Inspect(f, func(n ast.Node) bool {
			switch x := n.(type) {
			case *ast.FuncDecl:
				if x.Body != nil {
					add(&unit{obj: info.ObjectOf(x.Name), name: "function " + x.Name.Name, pos: x.Name.Pos(), ftype: x.Type, recv: x.Recv, body: x.Body})
				}
			case *ast.AssignStmt:
				if len(x.Lhs) == 1 && len(x.Rhs) == 1 {
					fl, ok1 := x.Rhs[0].(*ast.FuncLit)
					id, ok2 := x.Lhs[0].(*ast.Ident)
					if ok1 && ok2 && info.ObjectOf(id) != nil {
						add(&unit{obj: info.ObjectOf(id), name: "closure " + id.Name, pos: id.Pos(), ftype: fl.Type, body: fl.Body})
					}
				}
			}
			return true
		})
	}
	mutated := mutatedInts(pass)
	reach := func(from *unit) map[types.Object]bool {
		seen := map[types.Object]bool{}
		var visit func(u *unit)
		visit = func(u *unit) {
			for o := range u.callee {
				if c := byObj[o]; c != nil && !seen[o] {
					seen[o] = true
					visit(c)
				}
			}
		}
		visit(from)
		return seen
	}
	reachOf := map[*unit]map[types.Object]bool{}
	for _, u := range units {
		reachOf[u] = reach(u)
	}
	recursiveParam := func(u *unit) string {
		for _, l := range []*ast.FieldList{u.ftype.Params, u.recv} {
			if l == nil {
				continue
			}
			for _, f := range l.List {
				if n := recursiveIn(rec, info.TypeOf(f.Type)); n != "" {
					return n
				}
			}
		}
		return ""
	}
	for _, u := range units {
		tn := recursiveParam(u)
		if tn == "" || !reachOf[u][u.obj] {
			continue
		}
		cycle := map[types.Object]bool{u.obj: true}
		for o := range reachOf[u] {
			if c := byObj[o]; c != nil && reachOf[c][u.obj] {
				cycle[o] = true
			}
		}
		var checks []*ast.IfStmt
		names := []string{}
		for o := range cycle {
			checks = append(checks, budgetChecks(info, byObj[o], cycle, mutated)...)
			names = append(names, byObj[o].name)
		}
		sort.Strings(names)
		if len(checks) == 0 {
			via := ""
			if len(names) > 1 {
				via = " (a cycle of " + strings.Join(names, ", ") + ")"
			}
			report(u.pos, "XP002/walk-unbudgeted", u.name+" recurses over "+tn+via+" with no depth or node budget")
			continue
		}
		for _, is := range budgetChecks(info, u, cycle, mutated) {
			if pos, bad := failsOnBudget(info, is); bad {
				report(pos, "XP002/budget-fails", u.name+" returns an error when its budget over "+tn+" is exceeded")
			}
		}
	}
	return out
}
