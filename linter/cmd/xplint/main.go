// Command xplint runs XDRProof's ingestion lint rules (XP001, XP002, XP003) on Go packages.
//
//	xplint [-format text|json|sarif] [-o file] [-rules list] [-implicit-walk] [-scope prefixes] [packages]
//
// Exit status: 0 no findings, 1 findings, 2 the packages could not be loaded or analysed.
package main

import (
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"flag"
	"fmt"
	"io"
	"os"
	"path/filepath"
	"strings"

	"github.com/XDRProof/xdrproof/linter/xplint"
)

// Version is the linter's version, reported in SARIF.
const Version = "0.1.0"

type finding = xplint.Diagnostic

func main() {
	format := flag.String("format", "text", "text, json or sarif")
	out := flag.String("o", "", "write the report to this file instead of stdout")
	rules := flag.String("rules", "default", `sub-rules: "default", "all", or a comma list of IDs or prefixes (XP001, XP002/walk-unbudgeted)`)
	implicit := flag.Bool("implicit-walk", false, "also report XP002/implicit-walk (off by default)")
	scope := flag.String("scope", "", "comma list of package path prefixes to analyse for facts (default: github.com/stellar/ and the loaded modules)")
	srcroot := flag.String("C", ".", "run in this directory (package patterns and report paths are relative to it)")
	listRules := flag.Bool("list", false, "print the sub-rules and exit")
	flag.Parse()

	if *listRules {
		for _, r := range xplint.Rules {
			def := ""
			if !r.Default {
				def = " (off by default)"
			}
			fmt.Printf("%-26s %-8s %s%s\n", r.ID, r.Level, r.Short, def)
		}
		return
	}
	xplint.ImplicitWalk = *implicit
	switch *rules {
	case "default":
	case "all":
		xplint.Enabled = map[string]bool{}
		for _, r := range xplint.Rules {
			xplint.Enabled[r.ID] = true
		}
	default:
		xplint.Enabled = map[string]bool{}
		for _, want := range strings.Split(*rules, ",") {
			matched := false
			for _, r := range xplint.Rules {
				if r.ID == want || strings.HasPrefix(r.ID, want+"/") {
					xplint.Enabled[r.ID] = true
					matched = true
				}
			}
			if !matched {
				fail(fmt.Errorf("no rule or rule family %q (xplint -list shows them)", want))
			}
		}
	}

	patterns := flag.Args()
	if len(patterns) == 0 {
		patterns = []string{"./..."}
	}
	var prefixes []string
	if *scope != "" {
		prefixes = strings.Split(*scope, ",")
	}
	fs, err := xplint.Run(*srcroot, patterns, nil, prefixes)
	if err != nil {
		fail(err)
	}

	var w io.Writer = os.Stdout
	if *out != "" {
		f, err := os.Create(*out)
		if err != nil {
			fail(err)
		}
		defer f.Close()
		w = f
	}
	switch *format {
	case "json":
		enc := json.NewEncoder(w)
		enc.SetIndent("", "  ")
		if fs == nil {
			fs = []finding{}
		}
		enc.Encode(fs)
	case "sarif":
		enc := json.NewEncoder(w)
		enc.SetIndent("", "  ")
		enc.Encode(sarif(fs, *srcroot))
	default:
		for _, f := range fs {
			fmt.Fprintf(w, "%s:%d:%d: %s: %s\n", f.File, f.Line, f.Column, f.Rule, f.Message)
		}
	}
	if len(fs) > 0 {
		os.Exit(1)
	}
}

func fail(err error) {
	fmt.Fprintln(os.Stderr, "xplint:", err)
	os.Exit(2)
}

// lineHash: a stable fingerprint of a finding's line for code scanning (primaryLocationLineHash): the
// rule, the file and the line's text with its whitespace trimmed, so it survives lines moving.
func lineHash(root string, f finding) string {
	text := ""
	if b, err := os.ReadFile(filepath.Join(root, f.File)); err == nil {
		lines := strings.Split(string(b), "\n")
		if f.Line-1 < len(lines) && f.Line > 0 {
			text = strings.TrimSpace(lines[f.Line-1])
		}
	}
	h := sha256.Sum256([]byte(f.Rule + "\x00" + f.File + "\x00" + text))
	return hex.EncodeToString(h[:16]) + ":1"
}

// sarif renders the findings as SARIF 2.1.0, with every sub-rule described. Paths are relative to
// %SRCROOT%, the directory xplint ran in (left for the consumer to resolve, so no local path leaks).
func sarif(fs []finding, root string) any {
	type obj = map[string]any
	var rules []obj
	for _, r := range xplint.Rules {
		rules = append(rules, obj{
			"id": r.ID, "name": r.Name,
			"shortDescription":     obj{"text": r.Short},
			"fullDescription":      obj{"text": r.Short + " " + r.Help},
			"help":                 obj{"text": r.Help + " Evidence: " + r.Evidence},
			"defaultConfiguration": obj{"level": r.Level, "enabled": r.Default},
			"helpUri":              "https://xdrproof.dev/docs/linter#" + strings.ToLower(strings.ReplaceAll(r.ID, "/", "-")),
		})
	}
	results := []obj{}
	for _, f := range fs {
		results = append(results, obj{
			"ruleId": f.Rule, "level": f.Level,
			"message": obj{"text": f.Message},
			"locations": []obj{{"physicalLocation": obj{
				"artifactLocation": obj{"uri": f.File, "uriBaseId": "%SRCROOT%"},
				"region":           obj{"startLine": f.Line, "startColumn": f.Column},
			}}},
			"partialFingerprints": obj{"primaryLocationLineHash": lineHash(root, f)},
		})
	}
	return obj{
		"$schema": "https://json.schemastore.org/sarif-2.1.0.json",
		"version": "2.1.0",
		"runs": []obj{{
			"tool": obj{"driver": obj{
				"name": "xplint", "version": Version, "informationUri": "https://github.com/XDRProof/xdrproof/tree/main/linter",
				"rules": rules,
			}},
			"originalUriBaseIds": obj{"%SRCROOT%": obj{"description": obj{"text": "The directory xplint ran in (the root of the analysed module)."}}},
			"results":            results,
		}},
	}
}
