package xplint

import (
	"go/types"

	"golang.org/x/tools/go/analysis"
	"golang.org/x/tools/go/ssa"
)

// buildSSA builds the package's SSA form, as golang.org/x/tools/go/analysis/passes/buildssa does, with
// its imports created from type information only.
func buildSSA(pass *analysis.Pass) (*ssa.Program, *ssa.Package) {
	prog := ssa.NewProgram(pass.Fset, ssa.InstantiateGenerics)
	created := map[*types.Package]bool{}
	var createAll func([]*types.Package)
	createAll = func(pkgs []*types.Package) {
		for _, p := range pkgs {
			if !created[p] {
				created[p] = true
				prog.CreatePackage(p, nil, nil, true)
				createAll(p.Imports())
			}
		}
	}
	createAll(pass.Pkg.Imports())
	pkg := prog.CreatePackage(pass.Pkg, pass.Files, pass.TypesInfo, false)
	pkg.Build()
	return prog, pkg
}
