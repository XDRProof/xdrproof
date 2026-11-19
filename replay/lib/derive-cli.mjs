#!/usr/bin/env node
// derive-cli.mjs <variant file> <network passphrase> <out.json>: what the harness needs from one ledger
// (probes, header, end state), written to <out.json>. The harness runs it as a child process, so reading a
// large ledger as JSON never inflates the harness's own memory; prints this process's peak RSS in bytes.
import { writeFileSync } from 'node:fs';
import { derive, variantBytes, headerXdr, ledgerEntries } from './derive.mjs';

const [path, passphrase, out] = process.argv.slice(2);
const bytes = variantBytes(path);
const d = { ...derive(bytes, passphrase), header_xdr: headerXdr(bytes).toString('base64'), state: ledgerEntries(bytes) };
writeFileSync(out, JSON.stringify(d));
process.stdout.write(String(process.resourceUsage().maxRSS * 1024));
