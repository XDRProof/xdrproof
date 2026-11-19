package xplint

import (
	"fmt"
	"path/filepath"
	"sort"
	"strings"

	"golang.org/x/tools/go/analysis/checker"
	"golang.org/x/tools/go/packages"
)

// Diagnostic is one finding, located.
type Diagnostic struct {
	Rule    string `json:"rule"`
	Level   string `json:"level"`
	File    string `json:"file"`
	Line    int    `json:"line"`
	Column  int    `json:"column"`
	Message string `json:"message"`
}

// Run loads the packages matching patterns in dir (with file contents replaced by overlay, keyed by
// absolute path), runs XP001, XP002 and XP003 and returns the findings, with file paths relative to
// dir. scope lists the package path prefixes analysed for facts; empty means github.com/stellar/ and
// the loaded modules.
func Run(dir string, patterns []string, overlay map[string][]byte, scope []string) ([]Diagnostic, error) {
	cfg := &packages.Config{Mode: packages.LoadAllSyntax, Dir: dir, Overlay: overlay}
	pkgs, err := packages.Load(cfg, patterns...)
	if err != nil {
		return nil, err
	}
	var errs []string
	packages.Visit(pkgs, nil, func(p *packages.Package) {
		for _, e := range p.Errors {
			errs = append(errs, e.Error())
		}
	})
	if len(errs) > 0 {
		return nil, fmt.Errorf("the packages have errors:\n  %s", strings.Join(errs, "\n  "))
	}
	prefixes := scope
	if len(prefixes) == 0 {
		prefixes = []string{"github.com/stellar/"}
		for _, p := range pkgs {
			if p.Module != nil {
				prefixes = append(prefixes, p.Module.Path)
			} else {
				prefixes = append(prefixes, p.PkgPath)
			}
		}
	}
	Scope = func(path string) bool {
		for _, p := range prefixes {
			if strings.HasSuffix(p, "/") && strings.HasPrefix(path, p) || path == p || strings.HasPrefix(path, p+"/") {
				return true
			}
		}
		return false
	}
	graph, err := checker.Analyze(Analyzers, pkgs, &checker.Options{})
	if err != nil {
		return nil, err
	}
	root, _ := filepath.Abs(dir)
	var out []Diagnostic
	seen := map[string]bool{}
	for act := range graph.All() {
		if !act.IsRoot {
			continue
		}
		if act.Err != nil {
			return nil, fmt.Errorf("%s on %s: %w", act.Analyzer.Name, act.Package.PkgPath, act.Err)
		}
		for _, d := range act.Diagnostics {
			p := act.Package.Fset.Position(d.Pos)
			file := p.Filename
			if rel, err := filepath.Rel(root, file); err == nil && !strings.HasPrefix(rel, "..") {
				file = rel
			}
			r, _ := RuleByID(d.Category)
			f := Diagnostic{Rule: d.Category, Level: r.Level, File: filepath.ToSlash(file), Line: p.Line, Column: p.Column, Message: d.Message}
			k := fmt.Sprintf("%s|%s|%d|%d", f.Rule, f.File, f.Line, f.Column)
			if !seen[k] {
				seen[k] = true
				out = append(out, f)
			}
		}
	}
	sort.Slice(out, func(i, j int) bool {
		a, b := out[i], out[j]
		if a.File != b.File {
			return a.File < b.File
		}
		if a.Line != b.Line {
			return a.Line < b.Line
		}
		return a.Rule < b.Rule
	})
	return out, nil
}
