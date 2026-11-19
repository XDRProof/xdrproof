// Package xplint finds three ingestion mistakes in Go code that reads the Stellar ledger (SCF #46 RFP 2):
//
//	XP001  trusting a field stellar-core does not validate
//	XP002  walking or decoding a recursive structure with no depth or size limit
//	XP003  deriving participants from the envelope instead of the meta
//
// Each rule has sub-rules with stable IDs (XP001/text-bytes, ...), used as SARIF ruleId.
package xplint

// Rule describes one sub-rule.
type Rule struct {
	ID       string // XP001/text-bytes
	Name     string // short name for SARIF
	Level    string // error | warning | note (SARIF)
	Short    string // one line
	Help     string // what to do instead
	Evidence string // the upstream issue or source line that motivates it
	Default  bool   // on unless disabled
}

// Rules is every sub-rule, in report order.
var Rules = []Rule{
	{ID: "XP001/text-bytes", Name: "TextBytesUnvalidated", Level: "warning", Default: true,
		Short:    "Memo text, ScString and ScSymbol are raw bytes stellar-core does not check; this value reaches storage or a JSON encoder unchecked",
		Help:     "Check utf8.ValidString (and reject NUL) before storing or encoding, or store the bytes as hex or base64.",
		Evidence: "stellar-core accepts any 28 bytes as MEMO_TEXT; stellar-etl#504; wallet-backend #803 (Blend pool names)"},
	{ID: "XP001/muxed-as-account", Name: "MuxedAsAccount", Level: "error", Default: true,
		Short:    "A muxed address (M..., or any ScAddress kind) is used where an account is expected",
		Help:     "Use ToAccountId().Address() for the account and keep the muxed ID in its own field; switch on ScAddress.Type before treating it as an account.",
		Evidence: "wallet-backend #716, #693, #753 (a muxed Soroban source added as M... beside its G..., a duplicate key that halts ingestion)"},
	{ID: "XP001/mux-id-as-identity", Name: "MuxIdAsIdentity", Level: "warning", Default: true,
		Short:    "A muxed ID is read with its error ignored, or narrowed to a signed or floating type",
		Help:     "Check the error from GetId (a plain G account has no ID) and keep the ID as uint64 or a decimal string; core does not validate it.",
		Evidence: "SEP-0023; the ID is 64 unsigned bits chosen by the sender"},
	{ID: "XP001/contract-number", Name: "ContractNumberUnbounded", Level: "warning", Default: true,
		Short:    "An integer chosen by a contract (an ScVal) sizes an allocation, an exponent or a shift without a bound",
		Help:     "Compare it against a constant limit before using it as an exponent, size or shift count.",
		Evidence: "wallet-backend #802 (Blend decimals capped at 70)"},
	{ID: "XP001/declared-footprint", Name: "DeclaredFootprint", Level: "warning", Default: true,
		Short:    "The Soroban footprint is what the submitter declared; it is used here as the contract or entries the transaction touched",
		Help:     "Read the contract from the operation's ledger entry changes or events, or confirm the declared one against them.",
		Evidence: "stellar-etl#462"},
	{ID: "XP002/walk-unbudgeted", Name: "RecursiveWalkUnbudgeted", Level: "warning", Default: true,
		Short:    "A recursive walk over a self-referential XDR type has no depth or node budget; nesting is chosen by the submitter",
		Help:     "Carry a depth counter and a node count; when a limit is reached, stop descending and continue (log or count it). Never fail the ledger.",
		Evidence: "wallet-backend #820; 245-deep authorization trees apply on protocol 30 (corpus auth.deploy-with-tree-depth-245)"},
	{ID: "XP002/budget-fails", Name: "RecursiveWalkFailsOnBudget", Level: "error", Default: true,
		Short:    "A recursive walk returns an error when its depth or node budget is exceeded; the error repeats on every retry and halts ingestion",
		Help:     "Stop descending and continue (log or count it). Core can close a ledger with a larger tree than any limit the indexer picks.",
		Evidence: "corpus auth.deploy-with-tree-depth-245: a depth-64 error fails a ledger stellar-core v30.0.0 closed"},
	{ID: "XP002/decode-unlimited", Name: "DecodeUnlimited", Level: "error", Default: true,
		Short:    "XDR is decoded with no depth limit, or a limit above the SDK default",
		Help:     "Decode with the default limit (xdr.SafeUnmarshal, MaxDepth 1500) or lower.",
		Evidence: "rs-stellar-xdr#581; go-xdr DecodeDefaultMaxDepth"},
	{ID: "XP002/alloc-from-wire", Name: "AllocFromWire", Level: "warning", Default: true,
		Short:    "An allocation is sized from an integer read off the wire, with no bound",
		Help:     "Bound the size against a constant before allocating.",
		Evidence: "rs-stellar-xdr#581 (a huge length with no data)"},
	{ID: "XP002/implicit-walk", Name: "ImplicitRecursiveWalk", Level: "note", Default: false,
		Short:    "An SDK helper (String, Equals, fmt %v) recurses over a submitter-nested value with no budget of its own",
		Help:     "It is bounded only by the decoder's depth limit; avoid it on hot paths or on values whose depth you have not bounded.",
		Evidence: "go-stellar-sdk xdr/scval.go ScVal.Equals, ScVal.String"},
	{ID: "XP003/declared-auth", Name: "DeclaredAuthParticipant", Level: "error", Default: true,
		Short:    "An address from the declared Soroban authorization tree is attributed without confirmation from the meta",
		Help:     "An auth entry says what was permitted, not what ran. Take the address from nonce entries, ledger entry changes or events, or confirm it against them.",
		Evidence: "wallet-backend #739, #746 (contract-creation state changes from auth entries whether or not the deploy executed)"},
	{ID: "XP003/op-body-ungated", Name: "OpBodyParticipantUngated", Level: "warning", Default: true,
		Short:    "An account from an operation body is attributed with no check that the transaction succeeded",
		Help:     "A failed transaction changes nothing but its fee. Attribute operation-body accounts only when the transaction succeeded.",
		Evidence: "wallet-backend GetOperationParticipants (failed transactions attribute only the payers); stellar-etl participants"},
	{ID: "XP003/events-ungated", Name: "DiagnosticEventsUngated", Level: "warning", Default: true,
		Short:    "Diagnostic events are used for attribution with no check that the transaction succeeded",
		Help:     "Diagnostic events exist for failed transactions; InSuccessfulContractCall is per call, not per transaction.",
		Evidence: "stellar-etl#488"},
}

// RuleByID returns the rule with that ID.
func RuleByID(id string) (Rule, bool) {
	for _, r := range Rules {
		if r.ID == id {
			return r, true
		}
	}
	return Rule{}, false
}
