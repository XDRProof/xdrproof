// Ideas: work we would like to do that is not in the SCF #46 proposal (no budget, no dates), each with an open issue.
// Its picture is drawn by build.mjs in the roadmap's style, into .github/assets/ideas/<slug>.svg: gold is what would
// be built, plain is what XDRProof has today, dashed is someone else's code. Boxes and edges follow the rules at the
// top of deliverables.mjs.

export const IDEAS = [
  {
    slug: 'stellar-rpc',
    fig: {
      kicker: 'IDEA · REPLAY INTO STELLAR-RPC', title: 'How it would fit', name: 'Idea: replay the corpus into stellar-rpc',
      ships: 'would be built', there: 'in XDRProof today', cells: ['Idea', 'not in the SCF #46 proposal'],
    },
    diagram: {
      nodes: [
        { id: 'corpus', col: 0, kind: 'there', title: 'Corpus', sub: '635 ledger variants' },
        { id: 'harness', col: 0, kind: 'there', title: 'Replay harness', sub: 'one session per ledger' },
        { id: 'expected', col: 1, kind: 'ships', title: 'Expected answers', sub: 'worked out from the ledger' },
        { id: 'adapter', col: 1, kind: 'ships', title: 'stellar-rpc adapter', sub: 'feeds it one ledger, then asks' },
        { id: 'checks', col: 2, kind: 'ships', title: 'Answer checks', sub: 'getTransaction, getEvents…' },
        { id: 'rpc', col: 2, kind: 'outside', title: 'stellar-rpc', sub: 'the released binary, unchanged' },
      ],
      edges: [['corpus', 'expected'], ['corpus', 'adapter'], ['harness', 'adapter'], ['adapter', 'rpc'], ['rpc', 'checks'], ['expected', 'checks']],
    },
  },
];
