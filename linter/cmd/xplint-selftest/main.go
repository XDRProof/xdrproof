// Command xplint-selftest checks the linter against its seeded fixtures (testdata/fixtures) and mutants
// (testdata/mutations.json):
//
//  1. every `// want RULE` marker has a finding of that rule on that line, and no other line has one;
//  2. every mutant (a guard removed from a good case, or a fixed bug put back) makes its rule fire.
//
// Exit status 0 when both hold, 1 otherwise.
package main

import (
	"bufio"
	"encoding/json"
	"flag"
	"fmt"
	"io/fs"
	"os"
	"path/filepath"
	"regexp"
	"sort"
	"strings"

	"github.com/XDRProof/xdrproof/linter/xplint"
)

type mutation struct {
	Name   string `json:"name"`
	File   string `json:"file"`
	From   string `json:"from"`
	To     string `json:"to"`
	Expect string `json:"expect"`
	Why    string `json:"why"`
}

var want = regexp.MustCompile(`// want ((?:XP00\d/[a-z-]+ ?)+)\s*$`)

func main() {
	dir := flag.String("fixtures", "testdata/fixtures", "the fixtures module")
	muts := flag.String("mutations", "testdata/mutations.json", "the mutants")
	flag.Parse()
	abs, _ := filepath.Abs(*dir)
	failed := 0

	// 1. markers
	base, err := xplint.Run(abs, []string{"./..."}, nil, nil)
	if err != nil {
		fmt.Fprintln(os.Stderr, err)
		os.Exit(2)
	}
	expected := map[string]bool{}
	filepath.WalkDir(abs, func(p string, d fs.DirEntry, err error) error {
		if err != nil || d.IsDir() || !strings.HasSuffix(p, ".go") {
			return nil
		}
		f, _ := os.Open(p)
		defer f.Close()
		rel, _ := filepath.Rel(abs, p)
		sc := bufio.NewScanner(f)
		for n := 1; sc.Scan(); n++ {
			if m := want.FindStringSubmatch(sc.Text()); m != nil {
				for _, r := range strings.Fields(m[1]) {
					expected[fmt.Sprintf("%s:%d %s", filepath.ToSlash(rel), n, r)] = true
				}
			}
		}
		return nil
	})
	got := map[string]bool{}
	for _, d := range base {
		got[fmt.Sprintf("%s:%d %s", d.File, d.Line, d.Rule)] = true
	}
	var missing, extra []string
	for k := range expected {
		if !got[k] {
			missing = append(missing, k)
		}
	}
	for k := range got {
		if !expected[k] {
			extra = append(extra, k)
		}
	}
	sort.Strings(missing)
	sort.Strings(extra)
	perRule := map[string]int{}
	for k := range expected {
		perRule[strings.Fields(k)[1]]++
	}
	fmt.Printf("fixtures: %d seeded violations, %d caught, %d missed, %d findings on lines marked good\n", len(expected), len(expected)-len(missing), len(missing), len(extra))
	rules := make([]string, 0, len(perRule))
	for r := range perRule {
		rules = append(rules, r)
	}
	sort.Strings(rules)
	for _, r := range rules {
		fmt.Printf("  %-26s %d\n", r, perRule[r])
	}
	for _, k := range missing {
		fmt.Println("  MISSED     ", k)
		failed++
	}
	for _, k := range extra {
		fmt.Println("  UNEXPECTED ", k)
		failed++
	}

	// 2. mutants
	var ms []mutation
	b, err := os.ReadFile(*muts)
	if err != nil {
		fmt.Fprintln(os.Stderr, err)
		os.Exit(2)
	}
	if err := json.Unmarshal(b, &ms); err != nil {
		fmt.Fprintln(os.Stderr, err)
		os.Exit(2)
	}
	count := func(ds []xplint.Diagnostic, rule, file string) int {
		n := 0
		for _, d := range ds {
			if d.Rule == rule && d.File == file {
				n++
			}
		}
		return n
	}
	killed := 0
	for _, m := range ms {
		path := filepath.Join(abs, m.File)
		src, err := os.ReadFile(path)
		if err != nil || strings.Count(string(src), m.From) != 1 {
			fmt.Printf("  BAD MUTANT  %s: the text to replace must occur exactly once in %s\n", m.Name, m.File)
			failed++
			continue
		}
		mutated := strings.Replace(string(src), m.From, m.To, 1)
		ds, err := xplint.Run(abs, []string{"./..."}, map[string][]byte{path: []byte(mutated)}, nil)
		if err != nil {
			fmt.Printf("  BAD MUTANT  %s: %v\n", m.Name, err)
			failed++
			continue
		}
		if count(ds, m.Expect, m.File) > count(base, m.Expect, m.File) {
			killed++
			fmt.Printf("  caught      %-40s %s\n", m.Name, m.Expect)
		} else {
			fmt.Printf("  SURVIVED    %-40s %s (%s)\n", m.Name, m.Expect, m.Why)
			failed++
		}
	}
	fmt.Printf("mutants: %d of %d caught\n", killed, len(ms))
	if failed > 0 {
		os.Exit(1)
	}
	fmt.Println("OK: every seeded violation and every mutant is caught, and no good case is flagged.")
}
