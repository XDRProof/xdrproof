// Package xp001 holds seeded XP001 cases: fields stellar-core does not validate. Each bad case names the
// real code it is modelled on. A `// want RULE` comment marks the line a finding must be on; every other
// line must stay quiet.
package xp001

import (
	"encoding/hex"
	"errors"
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
