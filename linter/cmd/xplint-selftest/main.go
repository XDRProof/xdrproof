// Command xplint-selftest checks the linter against its seeded fixtures (testdata/fixtures) and mutants
// (testdata/mutations.json):
//
//  1. every `// want RULE` marker has a finding of that rule on that line, and no other line has one;
//  2. every mutant (a guard removed from a good case, or a fixed bug put back) makes its rule fire.
//
// Exit status 0 when both hold, 1 otherwise. With -json the result is one JSON object on stdout (for
// linter/selftest.mjs, which draws it as proof cards) and progress lines ("progress ...") go to stderr.
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
	At     string `json:"at"`     // text on the line the finding must be on, searched from the change
	Whole  bool   `json:"whole"`  // search for At from the start of the file instead
	Offset int    `json:"offset"` // the finding is this many lines below At's line
}

// report is the -json output.
type report struct {
	Seeded     int            `json:"seeded"`
	Caught     int            `json:"caught"`
	Missed     []string       `json:"missed"`
	Unexpected []string       `json:"unexpected"`
	PerRule    map[string]int `json:"per_rule"`
	Mutants    []mutantResult `json:"mutants"`
}

type mutantResult struct {
	Name   string `json:"name"`
	Expect string `json:"expect"`
	Line   int    `json:"line,omitempty"`
	Caught bool   `json:"caught"`
	Why    string `json:"why,omitempty"`
	Bad    string `json:"bad,omitempty"` // the mutant itself is broken (its text not found, or the analysis failed)
}

var want = regexp.MustCompile(`// want ((?:XP00\d/[a-z-]+ ?)+)\s*$`)

func main() {
	dir := flag.String("fixtures", "testdata/fixtures", "the fixtures module")
	muts := flag.String("mutations", "testdata/mutations.json", "the mutants")
	asJSON := flag.Bool("json", false, "print the result as one JSON object, progress on stderr")
	flag.Parse()
	abs, _ := filepath.Abs(*dir)
	failed := 0
	rep := report{Missed: []string{}, Unexpected: []string{}, Mutants: []mutantResult{}}
	// say prints the text report; progress tells a -json caller where the run is
	say := func(format string, a ...any) {
		if !*asJSON {
			fmt.Printf(format, a...)
		}
	}
	progress := func(format string, a ...any) {
		if *asJSON {
			fmt.Fprintf(os.Stderr, "progress "+format+"\n", a...)
		}
	}
	progress("fixtures")

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
	rep.Seeded, rep.Caught, rep.PerRule = len(expected), len(expected)-len(missing), perRule
	rep.Missed = append(rep.Missed, missing...)
	rep.Unexpected = append(rep.Unexpected, extra...)
	say("fixtures: %d seeded violations, %d caught, %d missed, %d findings on lines marked good\n", len(expected), len(expected)-len(missing), len(missing), len(extra))
	rules := make([]string, 0, len(perRule))
	for r := range perRule {
		rules = append(rules, r)
	}
	sort.Strings(rules)
	for _, r := range rules {
		say("  %-26s %d\n", r, perRule[r])
	}
	for _, k := range missing {
		say("  MISSED      %s\n", k)
		failed++
	}
	for _, k := range extra {
		say("  UNEXPECTED  %s\n", k)
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
	killed := 0
	progress("fixtures-done")
	for i, m := range ms {
		progress("mutant %d/%d", i, len(ms))
		path := filepath.Join(abs, m.File)
		src, err := os.ReadFile(path)
		if err != nil || strings.Count(string(src), m.From) != 1 {
			say("  BAD MUTANT  %s: the text to replace must occur exactly once in %s\n", m.Name, m.File)
			rep.Mutants = append(rep.Mutants, mutantResult{Name: m.Name, Expect: m.Expect, Bad: "the text to replace must occur exactly once in " + m.File})
			failed++
			continue
		}
		at := strings.Index(string(src), m.From)
		mutated := strings.Replace(string(src), m.From, m.To, 1)
		from := at
		if m.Whole {
			from = 0
		}
		k := strings.Index(mutated[from:], m.At)
		if m.At == "" || k < 0 {
			say("  BAD MUTANT  %s: %q is not in the mutated file\n", m.Name, m.At)
			rep.Mutants = append(rep.Mutants, mutantResult{Name: m.Name, Expect: m.Expect, Bad: fmt.Sprintf("%q is not in the mutated file", m.At)})
			failed++
			continue
		}
		line := strings.Count(mutated[:from+k], "\n") + 1 + m.Offset
		ds, err := xplint.Run(abs, []string{"./..."}, map[string][]byte{path: []byte(mutated)}, nil)
		if err != nil {
			say("  BAD MUTANT  %s: %v\n", m.Name, err)
			rep.Mutants = append(rep.Mutants, mutantResult{Name: m.Name, Expect: m.Expect, Bad: err.Error()})
			failed++
			continue
		}
		hit := false
		for _, d := range ds {
			if d.Rule == m.Expect && d.File == m.File && d.Line == line {
				hit = true
			}
		}
		if hit {
			killed++
			say("  caught      %-50s %s at line %d\n", m.Name, m.Expect, line)
		} else {
			say("  SURVIVED    %-50s %s at line %d (%s)\n", m.Name, m.Expect, line, m.Why)
			failed++
		}
		rep.Mutants = append(rep.Mutants, mutantResult{Name: m.Name, Expect: m.Expect, Line: line, Caught: hit, Why: m.Why})
	}
	say("mutants: %d of %d caught\n", killed, len(ms))
	if *asJSON {
		out, _ := json.Marshal(rep)
		fmt.Println(string(out))
	}
	if failed > 0 {
		os.Exit(1)
	}
	say("OK: every seeded violation and every mutant is caught, and no good case is flagged.\n")
}
