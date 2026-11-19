# The hazard registry (/docs/hazards)

**What it is.** Every known way a program reading the Stellar ledger goes wrong, in 8 layers, each with its evidence.

**Why it matters.** It is the corpus's blueprint: each entry targets hazards from this list, and each hazard says which check exercises it.

[`caps/registry.json`](https://github.com/XDRProof/xdrproof/blob/main/caps/registry.json) is the blueprint for the corpus. Each **hazard** is a named way a reader of the Stellar ledger breaks. Some examples:

- a muxed account stored without its ID;
- a contract call that creates a trustline with no event;
- a failed transaction that still changes state;
- a valid ledger a decoder refuses.

Every hazard carries its **evidence**: an upstream issue, a protocol rule or a measurement. Every corpus entry names the hazards it targets.

| Layer | What breaks | Hazards | Covered |
|---|---|---|---|
| A | [Addresses and identities](https://xdrproof.dev/docs/hazards/layer-a) | 11 | H-A1, H-A2, H-A3, H-A4, H-A5, H-A6, H-A7, H-A8, H-A9, H-A10, H-A11 |
| B | [Values and encodings](https://xdrproof.dev/docs/hazards/layer-b) | 16 | H-B1, H-B2, H-B3, H-B4, H-B5, H-B6, H-B7, H-B9, H-B10, H-B11, H-B12, H-B13, H-B14, H-B15, H-B16 |
| C | [Transaction lifecycle and results](https://xdrproof.dev/docs/hazards/layer-c) | 19 | H-C1, H-C2, H-C3, H-C4, H-C5, H-C6, H-C7, H-C8, H-C9, H-C10, H-C11, H-C12, H-C13, H-C14, H-C15, H-C16, H-C17, H-C18, H-C19 |
| D | [State changes no operation explains](https://xdrproof.dev/docs/hazards/layer-d) | 12 | H-D1, H-D2, H-D3, H-D4, H-D5, H-D6, H-D7, H-D8, H-D9, H-D10, H-D11, H-D12 |
| E | [Events](https://xdrproof.dev/docs/hazards/layer-e) | 3 | H-E1, H-E2, H-E3 |
| F | [Ledger level](https://xdrproof.dev/docs/hazards/layer-f) | 10 | H-F1, H-F2, H-F3, H-F4, H-F5, H-F6, H-F7, H-F8, H-F9, H-F10 |
| G | [Protocol and network variants](https://xdrproof.dev/docs/hazards/layer-g) | 4 | H-G1, H-G2 |
| H | [Reader robustness (SDK-only)](https://xdrproof.dev/docs/hazards/layer-h) | 3 | – |

## How to read a hazard

| Field | What it says |
|---|---|
| `id` | `H-` + layer letter + number, e.g. `H-A3` |
| `title` | The failure, in one line |
| `evidence` | Where it was seen: issues, pull requests, protocol rules, measurements |
| `test` | What the corpus holds or will hold for it. `C5` and `S11` are classic and Soroban [recipe](/docs/corpus/recipes) ledgers; `c-base` and `s-base` name a recipe step; `M:` names a shape in the mined mainnet ledgers (`mined/index.json`); `todo` marks a placement not yet built |
| `checks` | Which check will exercise it: replay probe, conformance, linter, guide, verify facts (the guide is planned) |

The **covered** column lists the hazards an entry already targets. The rest are the corpus's to-do list, in the open.
