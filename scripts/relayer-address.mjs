import { writeFileSync, readFileSync, existsSync } from "node:fs";
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";

const envPath = ".env.local";
const existing = existsSync(envPath) ? readFileSync(envPath, "utf8") : "";
const match = existing.match(/^RELAYER_PRIVATE_KEY=(.+)$/m);

let key;
if (match?.[1]?.trim()) {
  key = match[1].trim();
} else {
  key = generatePrivateKey();
  const next = `${existing}${existing && !existing.endsWith("\n") ? "\n" : ""}RELAYER_PRIVATE_KEY=${key}\n`;
  writeFileSync(envPath, next);
}

const account = privateKeyToAccount(key);
process.stdout.write(`${account.address}\n`);
