// Package xp003 holds seeded XP003 cases: participants derived from the envelope instead of the meta.
package xp003

import (
	set "github.com/deckarep/golang-set/v2"
	"github.com/stellar/go-stellar-sdk/ingest"
	"github.com/stellar/go-stellar-sdk/xdr"
)

// ---- XP003/declared-auth -----------------------------------------------------------------------------

// addressOf returns the G account an address credential names (other address kinds are skipped).
func addressOf(c xdr.SorobanCredentials) (string, bool) {
	if c.Address == nil || c.Address.Address.Type != xdr.ScAddressTypeScAddressTypeAccount {
		return "", false
	}
	return c.Address.Address.AccountId.Address(), true
}

// Bad: every address that signed an auth entry becomes a participant, whether its invocation ran or
// not (wallet-backend participantsForAuthEntries at 666a64d4, removed by #739).
func BadAuthParticipants(op xdr.InvokeHostFunctionOp) set.Set[string] {
	out := set.NewThreadUnsafeSet[string]()
	for _, e := range op.Auth {
		if a, ok := addressOf(e.Credentials); ok {
			out.Add(a) // want XP003/declared-auth
		}
	}
	return out
}

type builder struct{ account, creator string }

func (b builder) WithAccount(a string) builder { b.account = a; return b }
func (b builder) WithCreator(a string) builder { b.creator = a; return b }

func contractIDOf(f xdr.SorobanAuthorizedFunction) string {
	if f.CreateContractHostFn == nil {
		return ""
	}
	return f.CreateContractHostFn.ContractIdPreimage.Type.String()
}

// Bad: a deploy recorded from the auth tree whether it executed or not (wallet-backend
// contract_deploy.go at 73f6a24, #746).
func BadDeclaredDeploy(op xdr.InvokeHostFunctionOp) []builder {
	var out []builder
	for _, e := range op.Auth {
		id := contractIDOf(e.RootInvocation.Function)
		out = append(out, builder{}.WithAccount(id)) // want XP003/declared-auth
	}
	return out
}

// Bad: a "seen" set is deduplication, not confirmation.
func BadDedupeGuard(op xdr.InvokeHostFunctionOp) set.Set[string] {
	seen := set.NewThreadUnsafeSet[string]()
	out := set.NewThreadUnsafeSet[string]()
	for _, e := range op.Auth {
		a, _ := addressOf(e.Credentials)
		if !seen.Contains(a) {
			seen.Add(a) // want XP003/declared-auth
			out.Add(a)  // want XP003/declared-auth
		}
	}
	return out
}

// Good: the declared deploy is recorded only for an instance the meta created (wallet-backend HEAD
// contract_deploy.go).
func GoodMetaConfirmed(op xdr.InvokeHostFunctionOp, created map[string]bool) []builder {
	var out []builder
	for _, e := range op.Auth {
		id := contractIDOf(e.RootInvocation.Function)
		if _, ok := created[id]; ok {
			out = append(out, builder{}.WithAccount(id))
		}
	}
	return out
}

// ---- XP003/op-body-ungated ---------------------------------------------------------------------------

func destinations(op xdr.Operation) []xdr.AccountId {
	var out []xdr.AccountId
	switch op.Body.Type {
	case xdr.OperationTypePayment:
		out = append(out, op.Body.MustPaymentOp().Destination.ToAccountId())
	case xdr.OperationTypeCreateAccount:
		out = append(out, op.Body.MustCreateAccountOp().Destination)
	}
	return out
}

// Bad: operation-body accounts attributed for every transaction, failed or not (stellar-etl
// participants with no success check).
func BadOpBodyUngated(tx ingest.LedgerTransaction) set.Set[string] {
	out := set.NewThreadUnsafeSet[string]()
	for _, op := range tx.Envelope.Operations() {
		for _, a := range destinations(op) {
			out.Add(a.Address()) // want XP003/op-body-ungated
		}
	}
	return out
}

// Good: a failed transaction attributes only the accounts that paid (wallet-backend
// GetOperationParticipants).
func GoodGateInFunction(tx ingest.LedgerTransaction, op xdr.Operation) set.Set[string] {
	src := tx.Envelope.SourceAccount().ToAccountId()
	out := set.NewThreadUnsafeSet(src.Address())
	if !tx.Successful() {
		return out
	}
	for _, a := range destinations(op) {
		out.Add(a.Address())
	}
	return out
}

func addDestinations(op xdr.Operation, out set.Set[string]) {
	for _, a := range destinations(op) {
		out.Add(a.Address())
	}
}

// Good: the helper's only caller checks success first.
func GoodGateInCaller(tx ingest.LedgerTransaction) set.Set[string] {
	out := set.NewThreadUnsafeSet[string]()
	if tx.Successful() {
		for _, op := range tx.Envelope.Operations() {
			addDestinations(op, out)
		}
	}
	return out
}

// ---- XP003/events-ungated ----------------------------------------------------------------------------

// Bad: diagnostic events exist for failed transactions; their topics are not participants
// (stellar-etl#488).
func BadDiagnosticEvents(tx ingest.LedgerTransaction) (set.Set[string], error) {
	out := set.NewThreadUnsafeSet[string]()
	evs, err := tx.GetDiagnosticEvents()
	if err != nil {
		return nil, err
	}
	for _, ev := range evs {
		for _, t := range ev.Event.Body.MustV0().Topics {
			if a, ok := t.GetAddress(); ok {
				acct := a.AccountId.Address()
				out.Add(acct) // want XP003/events-ungated
			}
		}
	}
	return out, nil
}

// Good: only for a transaction that succeeded.
func GoodEventsAfterSuccess(tx ingest.LedgerTransaction) (set.Set[string], error) {
	out := set.NewThreadUnsafeSet[string]()
	if !tx.Successful() {
		return out, nil
	}
	evs, err := tx.GetDiagnosticEvents()
	if err != nil {
		return nil, err
	}
	for _, ev := range evs {
		for _, t := range ev.Event.Body.MustV0().Topics {
			if a, ok := t.GetAddress(); ok {
				acct := a.AccountId.Address()
				out.Add(acct)
			}
		}
	}
	return out, nil
}
