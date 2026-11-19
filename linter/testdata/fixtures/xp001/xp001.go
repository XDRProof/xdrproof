// Package xp001 holds seeded XP001 cases: fields stellar-core does not validate. Each bad case names the
// real code it is modelled on. A `// want RULE` comment marks the line a finding must be on; every other
// line must stay quiet.
package xp001

import (
	"encoding/hex"
	"errors"
	"fmt"
	"math"
	"math/big"
	"strconv"
	"unicode/utf8"

	set "github.com/deckarep/golang-set/v2"
	"github.com/stellar/go-stellar-sdk/ingest"
	"github.com/stellar/go-stellar-sdk/xdr"
)

// ---- XP001/text-bytes -------------------------------------------------------------------------------

type TransactionOutput struct {
	Hash string `json:"transaction_hash"`
	Memo string `json:"memo"`
}

// Bad: memo text into a JSON-tagged field, as stellar-etl transform/transaction.go:77 does (stellar-etl#504).
func BadMemoText(tx ingest.LedgerTransaction) TransactionOutput {
	out := TransactionOutput{Hash: tx.Result.TransactionHash.HexString()}
	if memo, ok := tx.Envelope.Memo().GetText(); ok {
		out.Memo = memo // want XP001/text-bytes
	}
	return out
}

// Bad: a contract string into a details map that is JSON-encoded later (wallet-backend Blend pool
// names before #803).
func BadScString(v xdr.ScVal, details map[string]interface{}) {
	if s, ok := v.GetStr(); ok {
		details["name"] = string(s) // want XP001/text-bytes
	}
}

// Good: checked before it is stored.
func GoodMemoValidated(tx ingest.LedgerTransaction) TransactionOutput {
	out := TransactionOutput{}
	memo := tx.Memo()
	if utf8.ValidString(memo) {
		out.Memo = memo
	}
	return out
}

// Good: stored as hex.
func GoodMemoHex(tx ingest.LedgerTransaction) TransactionOutput {
	out := TransactionOutput{}
	out.Memo = hex.EncodeToString([]byte(tx.Memo()))
	return out
}

func validName(s string) error {
	if !utf8.ValidString(s) || len(s) > 64 {
		return errors.New("bad name")
	}
	return nil
}

// Good: a validator that checks UTF-8, as wallet-backend's Blend decoder does after #803.
func GoodScStringValidated(v xdr.ScVal, details map[string]interface{}) error {
	s := string(v.MustStr())
	if err := validName(s); err != nil {
		return err
	}
	details["name"] = s
	return nil
}

// Bad: the check is on a different memo than the one stored.
func BadCheckedOtherMemo(a, b ingest.LedgerTransaction) TransactionOutput {
	out := TransactionOutput{}
	checked, raw := a.Memo(), b.Memo()
	if utf8.ValidString(checked) {
		out.Memo = raw // want XP001/text-bytes
	}
	return out
}

// Bad: %q quotes the label, %s still passes the memo's bytes through.
func BadSprintfMixed(tx ingest.LedgerTransaction) TransactionOutput {
	out := TransactionOutput{}
	out.Memo = fmt.Sprintf("%q: %s", "memo", tx.Memo()) // want XP001/text-bytes
	return out
}

// Good: every verb quotes.
func GoodSprintfQuoted(tx ingest.LedgerTransaction) TransactionOutput {
	out := TransactionOutput{}
	out.Memo = fmt.Sprintf("%q", tx.Memo())
	return out
}

// Good: a scratch map that never leaves the function is not storage.
func GoodTempMap(v xdr.ScVal) int {
	tmp := map[string]interface{}{}
	tmp["name"] = string(v.MustStr())
	return len(tmp)
}

func validToken(s string) error {
	if !utf8.ValidString(s) {
		return errors.New("not UTF-8")
	}
	return nil
}

type TokenOutput struct {
	Name *string `json:"name"`
}

// Good: checked through one conversion and stored, by address, through another conversion of the same
// bytes (wallet-backend sep41 fetchOne).
func GoodValidatedConversion(v xdr.ScVal) (*TokenOutput, error) {
	b, _ := v.GetStr()
	if err := validToken(string(b)); err != nil {
		return nil, err
	}
	name := string(b)
	return &TokenOutput{Name: &name}, nil
}

// Bad: the same, unchecked.
func BadUncheckedByAddress(v xdr.ScVal) *TokenOutput {
	b, _ := v.GetStr()
	name := string(b)
	return &TokenOutput{Name: &name} // want XP001/text-bytes
}

// Bad: only a prefix was checked.
func BadValidatedPrefix(v xdr.ScVal) (TransactionOutput, error) {
	b, _ := v.GetStr()
	if err := validToken(string(b[:4])); err != nil {
		return TransactionOutput{}, err
	}
	name := string(b)
	return TransactionOutput{Memo: name}, nil // want XP001/text-bytes
}

// Good: an uncalled helper reaches no sink (wallet-backend internal/utils GetText helper).
func GoodDeadHelper(m xdr.Memo) string {
	t, _ := m.GetText()
	return t
}

// ---- XP001/muxed-as-account -------------------------------------------------------------------------

// Bad: the operation source as written, which may be M..., starts the participant set: wallet-backend
// contract_operations.go before #753 (f8e5786d).
func BadMuxedSource(op xdr.Operation, tx xdr.TransactionEnvelope) set.Set[string] {
	src := tx.SourceAccount()
	if op.SourceAccount != nil {
		src = *op.SourceAccount
	}
	return set.NewThreadUnsafeSet(src.Address()) // want XP001/muxed-as-account
}

// Bad: an ScAddress string, which can be M, W, L or B, keys an account map.
func BadScAddressKey(a xdr.ScAddress, balances map[string]int64, amount int64) {
	if s, err := a.String(); err == nil {
		balances[s] += amount // want XP001/muxed-as-account
	}
}

// Bad: the map is kept in the receiver, so it outlives the call (wallet-backend Blend
// stageBackstopPoolBalance).
type stager struct{ pools map[string]int64 }

func (s *stager) stage(a xdr.ScAddress, amount int64) {
	if str, err := a.String(); err == nil {
		s.pools[str] += amount // want XP001/muxed-as-account
	}
}

// Good: reduced to the account first (wallet-backend after #753, bb0b162b).
func GoodToAccountID(op xdr.Operation, tx xdr.TransactionEnvelope) set.Set[string] {
	src := tx.SourceAccount()
	if op.SourceAccount != nil {
		src = *op.SourceAccount
	}
	acct := src.ToAccountId()
	return set.NewThreadUnsafeSet(acct.Address())
}

// Good: the muxed form kept in its own field, after a switch on the kind (stellar-etl
// addAccountAndMuxedAccountDetails).
func GoodMuxedTypeSwitch(a xdr.MuxedAccount, details map[string]interface{}) {
	acct := a.ToAccountId()
	details["account"] = acct.Address()
	if a.Type == xdr.CryptoKeyTypeKeyTypeMuxedEd25519 {
		details["account_muxed"] = a.Address()
	}
}

// Bad: the kind check is on a different address than the one stringified.
func BadKindCheckedOtherAddress(a, b xdr.ScAddress, out set.Set[string]) {
	if a.Type == xdr.ScAddressTypeScAddressTypeAccount {
		s, _ := b.String()
		out.Add(s) // want XP001/muxed-as-account
	}
}

// Bad: on this branch the address is known to be muxed.
func BadKindIsMuxed(a xdr.ScAddress, out set.Set[string]) {
	if a.Type == xdr.ScAddressTypeScAddressTypeMuxedAccount {
		s, _ := a.String()
		out.Add(s) // want XP001/muxed-as-account
	}
}

// Good: an account or a contract, checked on the address itself.
func GoodKindChecked(a xdr.ScAddress, out set.Set[string]) {
	if a.Type == xdr.ScAddressTypeScAddressTypeAccount || a.Type == xdr.ScAddressTypeScAddressTypeContract {
		s, _ := a.String()
		out.Add(s)
	}
}

// ---- XP001/mux-id-as-identity -----------------------------------------------------------------------

// Bad: the error is dropped, so a plain G account reads as ID 0.
func BadMuxIDIgnored(a xdr.MuxedAccount) uint64 {
	id, _ := a.GetId() // want XP001/mux-id-as-identity
	return id
}

// Bad: narrowed to int64, so IDs above 2^63-1 change value.
func BadMuxIDNarrowed(a xdr.MuxedAccount) (int64, error) {
	id, err := a.GetId()
	if err != nil {
		return 0, err
	}
	return int64(id), nil // want XP001/mux-id-as-identity
}

// Good: checked and kept unsigned.
func GoodMuxID(a xdr.MuxedAccount) (string, error) {
	id, err := a.GetId()
	if err != nil {
		return "", err
	}
	return strconv.FormatUint(id, 10), nil
}

// ---- XP001/contract-number --------------------------------------------------------------------------

// Bad: a token's decimals, chosen by its contract, as an exponent (wallet-backend Blend before #802).
func BadDecimals(v xdr.ScVal) *big.Int {
	d := v.MustU32()
	return new(big.Int).Exp(big.NewInt(10), big.NewInt(int64(d)), nil) // want XP001/contract-number
}

// Bad: the same through math.Pow10.
func BadDecimalsFloat(v xdr.ScVal) float64 {
	d, _ := v.GetU32()
	return math.Pow10(int(d)) // want XP001/contract-number
}

// Good: capped first (wallet-backend after #802).
func GoodDecimalsCapped(v xdr.ScVal) (*big.Int, error) {
	d := v.MustU32()
	if d > 70 {
		return nil, errors.New("decimals above 70")
	}
	return new(big.Int).Exp(big.NewInt(10), big.NewInt(int64(d)), nil), nil
}

// Bad: the bound holds on the other branch.
func BadBoundWrongBranch(v xdr.ScVal) []byte {
	d := v.MustU32()
	if d > 70 {
		return make([]byte, d) // want XP001/contract-number
	}
	return nil
}

// Bad: max with a constant is a floor, not a bound.
func BadMaxNotABound(v xdr.ScVal) []byte {
	n := max(v.MustU32(), 1)
	return make([]byte, n) // want XP001/contract-number
}

// Good: min with a constant bounds it.
func GoodMinBound(v xdr.ScVal) []byte {
	return make([]byte, min(v.MustU32(), 64))
}

// ---- XP001/declared-footprint -----------------------------------------------------------------------

// contractIdFromTxEnvelope reads the contract from the declared footprint, as stellar-etl does.
func contractIdFromTxEnvelope(env xdr.TransactionEnvelope) string {
	data, ok := env.V1.Tx.Ext.GetSorobanData()
	if !ok {
		return ""
	}
	for _, k := range data.Resources.Footprint.ReadWrite {
		if k.Type == xdr.LedgerEntryTypeContractData {
			id := k.MustContractData().Contract.ContractId
			s, _ := xdr.ScAddress{Type: xdr.ScAddressTypeScAddressTypeContract, ContractId: id}.String()
			return s
		}
	}
	return ""
}

// Bad: the declared contract recorded as the one the operation touched (stellar-etl#462).
func BadFootprintContract(env xdr.TransactionEnvelope, details map[string]interface{}) {
	details["contract_id"] = contractIdFromTxEnvelope(env) // want XP001/declared-footprint
}

// Good: the contract read from what the operation changed.
func GoodContractFromMeta(changes []ingest.Change, details map[string]interface{}) {
	for _, c := range changes {
		if c.Post != nil && c.Post.Data.Type == xdr.LedgerEntryTypeContractData {
			s, _ := c.Post.Data.MustContractData().Contract.String()
			details["contract_id"] = s
		}
	}
}
