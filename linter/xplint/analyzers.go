package xplint

import (
	"strings"

	"golang.org/x/tools/go/analysis"
)

// Enabled is the set of sub-rules that report; nil means the rules marked Default.
var Enabled map[string]bool

func enabled(rule string) bool {
	if Enabled != nil {
		return Enabled[rule]
	}
	r, ok := RuleByID(rule)
	return ok && (r.Default || rule == "XP002/implicit-walk" && ImplicitWalk)
}

func family(prefix, doc string, extra func(*analysis.Pass) []Finding) *analysis.Analyzer {
	return &analysis.Analyzer{
		Name:     prefix,
		Doc:      doc,
		Requires: []*analysis.Analyzer{TaintAnalyzer},
		Run: func(pass *analysis.Pass) (any, error) {
			if !Scope(pass.Pkg.Path()) {
				return nil, nil
			}
			fs := pass.ResultOf[TaintAnalyzer].([]Finding)
			if extra != nil {
				fs = append(fs, extra(pass)...)
			}
			for _, f := range fs {
				if strings.HasPrefix(f.Rule, prefix+"/") && enabled(f.Rule) {
					pass.Report(analysis.Diagnostic{Pos: f.Pos, Category: f.Rule, Message: f.Message})
				}
			}
			return nil, nil
		},
	}
}

var (
	// XP001: trusting a field stellar-core does not validate.
	XP001 = family("XP001", "trusting fields stellar-core does not validate: text bytes, muxed addresses, muxed IDs, contract integers, the declared footprint", nil)
	// XP002: no depth or size limit on recursive structures.
	XP002 = family("XP002", "missing depth and size limits on recursive structures: authorization trees, CAP-0071 delegates, nested ScVals, decoders, allocations", structural)
	// XP003: participants from the envelope instead of the meta.
	XP003 = family("XP003", "participants derived from the envelope instead of the meta: the declared auth tree, operation bodies of failed transactions, diagnostic events", nil)
)

// Analyzers is the full rule set.
var Analyzers = []*analysis.Analyzer{XP001, XP002, XP003}
