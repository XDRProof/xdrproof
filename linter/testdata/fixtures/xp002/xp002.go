// Package xp002 holds seeded XP002 cases: missing depth and size limits on recursive structures.
package xp002

import (
	"errors"

	xdr3 "github.com/stellar/go-xdr/xdr3"
	"github.com/stellar/go-stellar-sdk/xdr"
)

// ---- XP002/walk-unbudgeted ----------------------------------------------------------------------------

// Bad: a named function recursing over the authorization tree (wallet-backend
// participantsFromInvocationAndSubInvocations at 666a64d4).
func BadNamedRecursion(inv xdr.SorobanAuthorizedInvocation) int { // want XP002/walk-unbudgeted
	n := 1
	for _, sub := range inv.SubInvocations {
		n += BadNamedRecursion(sub)
	}
	return n
}

// Bad: a closure recursing over the tree (wallet-backend contract_deploy.go walkInvocation, #820).
func BadClosureRecursion(entries []xdr.SorobanAuthorizationEntry) int {
	count := 0
	var walk func(inv xdr.SorobanAuthorizedInvocation)
	walk = func(inv xdr.SorobanAuthorizedInvocation) { // want XP002/walk-unbudgeted
		count++
		for _, sub := range inv.SubInvocations {
			walk(sub)
		}
	}
	for _, e := range entries {
		walk(e.RootInvocation)
	}
	return count
}

// Bad: mutual recursion over nested ScVals (ScVal <-> ScMapEntry).
func badVal(v xdr.ScVal) int { // want XP002/walk-unbudgeted
	if m, ok := v.GetMap(); ok && m != nil {
		n := 0
		for _, e := range *m {
			n += badEntry(e)
		}
		return n
	}
	return 1
}

func badEntry(e xdr.ScMapEntry) int { // want XP002/walk-unbudgeted
	return badVal(e.Key) + badVal(e.Val)
}

// Bad: CAP-0071 delegate signatures nest without limit (hazard H-B14).
func BadDelegates(ds []xdr.SorobanDelegateSignature, out *[]xdr.ScAddress) {
	for _, d := range ds {
		walkDelegate(d, out)
	}
}

func walkDelegate(d xdr.SorobanDelegateSignature, out *[]xdr.ScAddress) { // want XP002/walk-unbudgeted
	*out = append(*out, d.Address)
	for _, n := range d.NestedDelegates {
		walkDelegate(n, out)
	}
}

// Bad: an int parameter that is never compared is not a budget.
func BadFakeBudget(inv xdr.SorobanAuthorizedInvocation, tag int) int { // want XP002/walk-unbudgeted
	n := tag
	for _, sub := range inv.SubInvocations {
		n += BadFakeBudget(sub, tag)
	}
	return n
}

// Good: a depth parameter checked and stepped.
func GoodDepthParam(inv xdr.SorobanAuthorizedInvocation, depth int) int {
	if depth > 256 {
		return 0
	}
	n := 1
	for _, sub := range inv.SubInvocations {
		n += GoodDepthParam(sub, depth+1)
	}
	return n
}

// Good: a count-down budget, as the generated decoders do.
func GoodCountDown(v xdr.ScVal, maxDepth uint) int {
	if maxDepth == 0 {
		return 0
	}
	if vec, ok := v.GetVec(); ok && vec != nil {
		n := 0
		for _, e := range *vec {
			n += GoodCountDown(e, maxDepth-1)
		}
		return n
	}
	return 1
}

// Good: a node budget in a struct the walker updates.
type walker struct{ nodes, limit int }

func (w *walker) visit(inv xdr.SorobanAuthorizedInvocation) {
	w.nodes++
	if w.nodes > w.limit {
		return
	}
	for _, sub := range inv.SubInvocations {
		w.visit(sub)
	}
}

// Good: iterative, with a bounded stack.
func GoodIterative(root xdr.SorobanAuthorizedInvocation) int {
	stack := []xdr.SorobanAuthorizedInvocation{root}
	n := 0
	for len(stack) > 0 && n < 4096 {
		inv := stack[len(stack)-1]
		stack = stack[:len(stack)-1]
		n++
		stack = append(stack, inv.SubInvocations...)
	}
	return n
}

// Good: a flat loop over one level (stellar-etl serializeScValArray).
func GoodFlatLoop(vs []xdr.ScVal) []string {
	out := []string{}
	for _, v := range vs {
		out = append(out, v.Type.String())
	}
	return out
}

// ---- XP002/budget-fails ------------------------------------------------------------------------------

// Bad: the first #820 patch; at the limit it fails the ledger, and core closes deeper trees (245 apply).
func BadBudgetFails(inv xdr.SorobanAuthorizedInvocation, depth int) error {
	if depth > 64 {
		return errors.New("auth invocation tree deeper than 64") // want XP002/budget-fails
	}
	for _, sub := range inv.SubInvocations {
		if err := BadBudgetFails(sub, depth+1); err != nil {
			return err
		}
	}
	return nil
}

// Good: at the limit it stops descending and carries on.
func GoodBudgetStops(inv xdr.SorobanAuthorizedInvocation, depth int, truncated *int) error {
	if depth > 256 {
		*truncated++
		return nil
	}
	for _, sub := range inv.SubInvocations {
		if err := GoodBudgetStops(sub, depth+1, truncated); err != nil {
			return err
		}
	}
	return nil
}

// ---- XP002/decode-unlimited ---------------------------------------------------------------------------

// Bad: the decoder's depth limit turned off.
func BadUnlimited(b []byte) (xdr.ScVal, error) {
	var v xdr.ScVal
	d := xdr3.NewDecoderWithOptions(nil, xdr3.DecodeOptions{MaxDepth: xdr3.DecodeUnlimitedDepth}) // want XP002/decode-unlimited
	_ = d
	err := xdr.SafeUnmarshal(b, &v)
	return v, err
}

// Bad: a limit far above the SDK default.
func BadHugeDepth() xdr3.DecodeOptions {
	return xdr3.DecodeOptions{MaxDepth: 100000} // want XP002/decode-unlimited
}

// Good: the default limit.
func GoodSafeUnmarshal(b []byte) (xdr.ScVal, error) {
	var v xdr.ScVal
	err := xdr.SafeUnmarshal(b, &v)
	return v, err
}

// ---- XP002/alloc-from-wire ----------------------------------------------------------------------------

// Bad: an allocation sized from a field read off the wire.
func BadAlloc(tx xdr.TransactionV1Envelope) []byte {
	return make([]byte, tx.Tx.Fee) // want XP002/alloc-from-wire
}

// Good: bounded first.
func GoodAlloc(tx xdr.TransactionV1Envelope) []byte {
	if tx.Tx.Fee > 1<<16 {
		return nil
	}
	return make([]byte, tx.Tx.Fee)
}
