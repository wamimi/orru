import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { ADDRESSES, SEPOLIA_ID } from "@/lib/chain";
import type { PaymentSlip } from "@/lib/prove/types";

/**
 * The payer-to-recipient channel. A book holds the preimages of one attested
 * window: the amounts and salts a proof is built from.
 *
 * These are the values the whole product exists to keep private. They are
 * served to the connected recipient and to nobody else, they are never logged,
 * and they are never cached.
 */
export type SlipBook = {
  payer: `0x${string}`;
  recipient: `0x${string}`;
  band: number;
  slips: PaymentSlip[];
};

type SlipFile = { version: number; books: SlipBook[] };

/**
 * Books whose salts are secret are held in the environment, never in the repo.
 * `worker/src/export-witness.ts --private` prints the value.
 */
function fromEnvironment(): SlipBook[] {
  const raw = process.env.ORRU_SLIP_BOOKS;
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw) as SlipFile;
    return parsed.books ?? [];
  } catch {
    // Never echo the value: a malformed book still holds real salts.
    console.error("ORRU_SLIP_BOOKS is not valid JSON — private payers unavailable");
    return [];
  }
}

/** Books whose salts DemoPayroll derives on-chain and publishes. */
function fromFixtures(): SlipBook[] {
  const path = join(process.cwd(), "fixtures", "slips.json");
  if (!existsSync(path)) return [];
  try {
    return (JSON.parse(readFileSync(path, "utf8")) as SlipFile).books ?? [];
  } catch {
    return [];
  }
}

const same = (a: string, b: string) => a.toLowerCase() === b.toLowerCase();

/**
 * The window for one recipient and payer. Stored books win; a payer whose salts
 * are public is rebuilt from the chain instead.
 */
export async function slipBookFor(
  recipient: string,
  payer: string,
): Promise<SlipBook | null> {
  const books = [...fromEnvironment(), ...fromFixtures()];
  const stored = books.find(
    (b) => same(b.recipient, recipient) && same(b.payer, payer),
  );
  if (stored) return stored;

  if (same(payer, ADDRESSES[SEPOLIA_ID].demoPayroll)) {
    const { derivePayrollSlips } = await import("@/lib/payroll-slips");
    return derivePayrollSlips(recipient);
  }

  const { faucetConfigured, faucetPayer, faucetSlips, faucetBand, faucetStatus } =
    await import("@/lib/faucet");
  if (faucetConfigured() && same(payer, faucetPayer())) {
    const status = await faucetStatus(recipient);
    if (!status.attested) return null;
    return {
      payer: faucetPayer(),
      recipient: recipient as `0x${string}`,
      band: faucetBand(),
      slips: faucetSlips(recipient),
    };
  }

  return null;
}

/** Every payer this recipient can prove against, for the picker on review. */
export function payersWithSlips(recipient: string): `0x${string}`[] {
  return [...fromEnvironment(), ...fromFixtures()]
    .filter((b) => same(b.recipient, recipient))
    .map((b) => b.payer);
}
