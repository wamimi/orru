#!/usr/bin/env node
/**
 * Fails if banned jargon appears in consumer-flow copy.
 * See docs/COPY-RULES.md.
 */

import fs from "node:fs";
import path from "node:path";

const roots = [
  path.join("src", "app", "(app)"),
  path.join("src", "components", "app"),
];

const banned = [
  { id: "contract", re: /\bcontracts?\b/i },
  { id: "deploy", re: /\bdeploy(ed|ing|ment)?\b/i },
  { id: "gas", re: /\bgas\b/i },
  { id: "approve", re: /\bapprov(e|ed|al|ing)\b/i },
  { id: "proof", re: /\bproofs?\b/i },
  { id: "circuit", re: /\bcircuits?\b/i },
  { id: "attestation", re: /\battestations?\b/i },
  { id: "zero-knowledge", re: /\bzero[-\s]?knowledge\b/i },
  { id: "zk", re: /\bzk\b/i },
  { id: "zktls", re: /\bzktls\b/i },
  { id: "eip-712", re: /\beip[-\s]?712\b/i },
  { id: "noir", re: /\bnoir\b/i },
];

function walk(dir, acc = []) {
  if (!fs.existsSync(dir)) return acc;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const next = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(next, acc);
    else if (/\.(tsx|ts|jsx|js|md)$/.test(entry.name)) acc.push(next);
  }
  return acc;
}

const files = roots.flatMap((root) => walk(root));
const hits = [];

for (const file of files) {
  const lines = fs.readFileSync(file, "utf8").split(/\r?\n/);
  lines.forEach((line, i) => {
    const trimmed = line.trim();
    if (trimmed.startsWith("//") || trimmed.startsWith("*") || trimmed.startsWith("/*")) {
      return;
    }
    for (const rule of banned) {
      if (rule.re.test(line)) {
        hits.push(`${file}:${i + 1}  [${rule.id}]  ${trimmed}`);
      }
    }
  });
}

if (hits.length) {
  console.error("Banned jargon in app copy:\n");
  for (const hit of hits) console.error(`  ${hit}`);
  console.error(`\nSee docs/COPY-RULES.md (${hits.length} hit${hits.length === 1 ? "" : "s"}).`);
  process.exit(1);
}

console.log(`check-copy: ${files.length} files clean`);
