package xplint

import (
	"go/types"
	"strings"
)

// The Stellar Go packages the rules key on. The SDK moved from github.com/stellar/go to
// github.com/stellar/go-stellar-sdk; both are matched.
func stellarPkg(p *types.Package, sub string) bool {
	if p == nil {
		return false
	}
	path := p.Path()
	return (strings.HasPrefix(path, "github.com/stellar/go-stellar-sdk/") || strings.HasPrefix(path, "github.com/stellar/go/")) &&
		(path == "github.com/stellar/go-stellar-sdk/"+sub || path == "github.com/stellar/go/"+sub)
}

// deref strips pointers, slices and arrays down to the element type.
func deref(t types.Type) types.Type {
	for i := 0; i < 6 && t != nil; i++ {
		switch u := types.Unalias(t).(type) {
		case *types.Pointer:
			t = u.Elem()
		case *types.Slice:
			t = u.Elem()
		case *types.Array:
			t = u.Elem()
		default:
			return t
		}
	}
	return t
}

// xdrName returns the name of t (after deref) if it is a named type of the xdr package.
func xdrName(t types.Type) string {
	if t == nil {
		return ""
	}
	n, ok := types.Unalias(deref(t)).(*types.Named)
	if !ok || !stellarPkg(n.Obj().Pkg(), "xdr") {
		return ""
	}
	return n.Obj().Name()
}

// recvName returns the named receiver type of a method, or "".
func recvName(f *types.Func) string {
	sig, ok := f.Type().(*types.Signature)
	if !ok || sig.Recv() == nil {
		return ""
	}
	if n, ok := types.Unalias(deref(sig.Recv().Type())).(*types.Named); ok {
		return n.Obj().Name()
	}
	return ""
}

// apiKey identifies a function or method: package ("xdr", "ingest", "strkey", or a full std path),
// receiver type name ("" for functions), name.
type apiKey struct{ pkg, recv, name string }

func keyOf(f *types.Func) apiKey {
	if f == nil || f.Pkg() == nil {
		return apiKey{}
	}
	pkg := f.Pkg().Path()
	for _, sub := range []string{"xdr", "ingest", "strkey"} {
		if stellarPkg(f.Pkg(), sub) {
			pkg = sub
		}
	}
	return apiKey{pkg, recvName(f), f.Name()}
}

// ---- sources -----------------------------------------------------------------------------------------

// Calls whose result carries a label.
var sourceCalls = map[apiKey]Label{
	// a muxed address renders as M... (40-byte payload); ScAddress.String can return M, W, L or B
	{"xdr", "MuxedAccount", "Address"}:                 LMuxed,
	{"xdr", "MuxedAccount", "GetAddress"}:              LMuxed,
	{"xdr", "ScAddress", "String"}:                     LMuxed,
	{"ingest", "LedgerTransaction", "AccountMuxed"}:    LMuxed,
	{"ingest", "LedgerTransaction", "FeeAccountMuxed"}: LMuxed,
	// raw bytes core does not validate as text
	{"xdr", "Memo", "GetText"}:              LText,
	{"xdr", "Memo", "MustText"}:             LText,
	{"ingest", "LedgerTransaction", "Memo"}: LText,
	{"xdr", "ScVal", "GetStr"}:              LText,
	{"xdr", "ScVal", "MustStr"}:             LText,
	{"xdr", "ScVal", "GetSym"}:              LText,
	{"xdr", "ScVal", "MustSym"}:             LText,
	// integers a contract chose
	{"xdr", "ScVal", "GetU32"}: LNum, {"xdr", "ScVal", "MustU32"}: LNum,
	{"xdr", "ScVal", "GetI32"}: LNum, {"xdr", "ScVal", "MustI32"}: LNum,
	{"xdr", "ScVal", "GetU64"}: LNum, {"xdr", "ScVal", "MustU64"}: LNum,
	{"xdr", "ScVal", "GetI64"}: LNum, {"xdr", "ScVal", "MustI64"}: LNum,
	// diagnostic events exist for failed transactions too
	{"ingest", "LedgerTransaction", "GetDiagnosticEvents"}: LDiag,
}

// Functions, in any package, that return the declared footprint's contract or keys.
var footprintFuncs = map[string]bool{
	"ContractIdFromTxEnvelope": true, "contractIdFromTxEnvelope": true,
	"LedgerKeyHashesFromSorobanFootprint": true, "ledgerKeyHashesFromSorobanFootprint": true,
}

// Types whose values come only from the transaction envelope's Soroban authorization: what the submitter
// declared, not what ran.
var authTypes = map[string]bool{
	"SorobanAuthorizationEntry": true, "SorobanAuthorizedInvocation": true, "SorobanAuthorizedFunction": true,
	"SorobanCredentials": true, "SorobanAddressCredentials": true, "SorobanAddressCredentialsWithDelegates": true,
	"SorobanDelegateSignature": true,
}

// typeLabel: a value of this xdr type carries a label whatever it was derived from.
func typeLabel(t types.Type) Label {
	switch n := xdrName(t); {
	case n == "":
		return 0
	case authTypes[n]:
		return LAuth
	case n == "LedgerFootprint":
		return LFootRaw
	case n == "DiagnosticEvent":
		return LDiag
	}
	return 0
}

// convertLabel: a conversion from one of these xdr types to a Go string yields raw bytes as text.
var textTypes = map[string]bool{"ScString": true, "ScSymbol": true, "DataValue": true}

// fieldLabel: reading this field of an xdr struct yields a labelled value.
func fieldLabel(structType types.Type, field *types.Var) Label {
	sn := xdrName(structType)
	if sn == "" {
		return 0
	}
	if sn == "Memo" && field.Name() == "Text" {
		return LText
	}
	// accounts named by an operation body: what the submitter asked for, which only a successful
	// transaction makes true
	if strings.HasSuffix(sn, "Op") || sn == "ClaimantV0" || sn == "RevokeSponsorshipOpSigner" {
		switch xdrName(field.Type()) {
		case "AccountId", "MuxedAccount", "SignerKey", "Claimant":
			return LOpBody
		}
	}
	// an integer read off the wire
	if b, ok := types.Unalias(field.Type()).Underlying().(*types.Basic); ok && b.Info()&types.IsInteger != 0 {
		return LWire
	}
	return 0
}

// ---- sanitizers --------------------------------------------------------------------------------------

// Calls whose result is clean of these labels.
var cleanCalls = map[apiKey]Label{
	{"strings", "", "ToValidUTF8"}:                    LText,
	{"encoding/hex", "", "EncodeToString"}:            LText,
	{"encoding/hex", "", "Encode"}:                    LText,
	{"encoding/base64", "Encoding", "EncodeToString"}: LText,
	{"encoding/base64", "Encoding", "Encode"}:         LText,
	{"strconv", "", "Quote"}:                          LText,
	{"strconv", "", "QuoteToASCII"}:                   LText,
	{"strconv", "", "QuoteToGraphic"}:                 LText,
	{"xdr", "", "MarshalBase64"}:                      LText,
	{"xdr", "", "MarshalHex"}:                         LText,
	// the account a muxed account belongs to
	{"xdr", "MuxedAccount", "ToAccountId"}: LMuxed,
}

// Calls whose true result proves the argument is valid UTF-8.
var utf8Guards = map[apiKey]bool{
	{"unicode/utf8", "", "ValidString"}: true, {"unicode/utf8", "", "Valid"}: true, {"unicode/utf8", "", "ValidRune"}: true,
}

// Calls whose true result proves the argument is a plain G account.
var accountGuards = map[apiKey]bool{
	{"strkey", "", "IsValidEd25519PublicKey"}: true,
}

// Named integer types whose comparison with a constant decides what kind of address a value is.
var addressKindTypes = map[string]bool{"CryptoKeyType": true, "ScAddressType": true}

// ---- sinks -------------------------------------------------------------------------------------------

// Attribution: methods that put an address into a set, list or builder of participants.
var attributionMethods = map[string]bool{"Add": true, "Append": true, "Union": true, "Insert": true, "Store": true, "Push": true, "Put": true}

// Builder methods count when they name the role the address plays (WithAccount, WithCreator, ...), not
// when they set a category, reason or amount.
var roleWords = []string{"Account", "Address", "Creator", "Spender", "Destination", "Participant", "Signer", "Owner",
	"Holder", "From", "To", "Sender", "Recipient", "Deployer", "Contract", "Token", "Pool", "Issuer", "Trustor", "Sponsor"}

func isAttributionMethod(name string) bool {
	if attributionMethods[name] {
		return true
	}
	if len(name) > 4 && strings.HasPrefix(name, "With") && name[4] >= 'A' && name[4] <= 'Z' {
		for _, w := range roleWords {
			if strings.Contains(name[4:], w) {
				return true
			}
		}
	}
	return false
}

// addressLike: an attribution sink only matters for values that can be an address.
func addressLike(t types.Type) bool {
	if t == nil {
		return false
	}
	switch xdrName(t) {
	case "AccountId", "MuxedAccount", "ScAddress", "SignerKey":
		return true
	}
	s := types.TypeString(types.Unalias(t), nil)
	if b, ok := types.Unalias(t).Underlying().(*types.Basic); ok && b.Kind() == types.String {
		// a plain string, or a named string type for addresses; not a category, reason or other enum
		n, named := types.Unalias(t).(*types.Named)
		return !named || strings.Contains(n.Obj().Name(), "Address") || strings.Contains(n.Obj().Name(), "Account")
	}
	return strings.HasSuffix(s, "Set[string]") || s == "[]string" || strings.HasSuffix(s, "[]string")
}

// Database writes: method names on database handles, statements, transactions, batches and COPY.
var dbMethods = map[string]bool{
	"Exec": true, "ExecContext": true, "Query": true, "QueryContext": true, "QueryRow": true, "QueryRowContext": true,
	"CopyFrom": true, "Queue": true, "NamedExec": true, "NamedExecContext": true, "Get": true, "Select": true,
}

func isDBReceiver(t types.Type) bool {
	if t == nil {
		return false
	}
	s := types.TypeString(types.Unalias(t), nil)
	for _, p := range []string{"database/sql", "jackc/pgx", "jackc/pgconn", "jmoiron/sqlx", "support/db"} {
		if strings.Contains(s, p) {
			return true
		}
	}
	return false
}

// Encoders that serialise a value as text.
var encodeCalls = map[apiKey]bool{
	{"encoding/json", "", "Marshal"}: true, {"encoding/json", "", "MarshalIndent"}: true, {"encoding/json", "Encoder", "Encode"}: true,
}

// Numeric sinks: an exponent, a repeat count.
var numberSinks = map[apiKey]bool{
	{"math/big", "Int", "Exp"}: true, {"math", "", "Pow"}: true, {"math", "", "Pow10"}: true,
	{"strings", "", "Repeat"}: true, {"bytes", "", "Repeat"}: true,
}

// storageTag: a struct field written to storage or encoded.
func storageTag(tag string) bool {
	return strings.Contains(tag, `db:"`) || strings.Contains(tag, `json:"`) || strings.Contains(tag, `parquet:"`) || strings.Contains(tag, `avro:"`)
}

// successMethods: a call whose true result means the transaction succeeded.
var successMethods = map[string]bool{"Successful": true, "IsSuccessful": true}
