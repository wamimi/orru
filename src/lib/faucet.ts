import {
  createWalletClient,
  encodeAbiParameters,
  getAddress,
  http,
  keccak256,
  type Hex,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { sepolia } from "viem/chains";
import { commitmentFor } from "../../shared/commitment";
import { attestationRegistryAbi, payerAnchorAbi } from "@/lib/abi";
import { bandFor } from "@/lib/bands";
import { ADDRESSES, CREDITCOIN_ID, SEPOLIA_ID } from "@/lib/chain";
import { creditcoinClient, sepoliaClient } from "@/lib/clients";
import type { PaymentSlip } from "@/lib/prove/types";

/** Matches the circuit's PERIODS. */
const PERIODS = [1n, 2n, 3n];

/** Band 6. */
const AMOUNT = 7_500_000_000n;

/** The signing key does not match ORRU_FAUCET_PAYER. */
export class FaucetMisconfigured extends Error {
  constructor(
    readonly keyAddress: `0x${string}`,
    readonly configured: `0x${string}`,
  ) {
    super(`ORRU_FAUCET_PAYER_KEY is ${keyAddress}, but ORRU_FAUCET_PAYER is ${configured}`);
    this.name = "FaucetMisconfigured";
  }
}

/** The payer has no Sepolia ETH. */
export class FaucetUnfunded extends Error {
  constructor(readonly payer: `0x${string}`) {
    super(`faucet payer ${payer} has no Sepolia ETH`);
    this.name = "FaucetUnfunded";
  }
}

export type FaucetStatus = {
  address: `0x${string}`;
  payer: `0x${string}`;
  band: number;
  anchored: boolean;
  attested: boolean;
  /** True once the whole window is usable. */
  ready: boolean;
};

export function faucetConfigured(): boolean {
  return Boolean(process.env.ORRU_FAUCET_SECRET && process.env.ORRU_FAUCET_PAYER_KEY);
}

export function faucetPayer(): `0x${string}` {
  return getAddress(
    process.env.ORRU_FAUCET_PAYER ?? "0x0531203274075Ff79A07000BBDa2B0272C647d01",
  );
}

/** Derived, not stored, so a claim needs no persistence. */
function saltFor(recipient: `0x${string}`, period: bigint): Hex {
  const secret = process.env.ORRU_FAUCET_SECRET;
  if (!secret) throw new Error("ORRU_FAUCET_SECRET is not set");

  return keccak256(
    encodeAbiParameters(
      [{ type: "bytes32" }, { type: "address" }, { type: "uint256" }],
      [keccak256(`0x${Buffer.from(secret, "utf8").toString("hex")}` as Hex), recipient, period],
    ),
  );
}

export function faucetSlips(recipient: string): PaymentSlip[] {
  const subject = getAddress(recipient);
  return PERIODS.map((period) => {
    const salt = saltFor(subject, period);
    return {
      amount: AMOUNT.toString(),
      period: period.toString(),
      salt,
      commitment: commitmentFor({ recipient: subject, amount: AMOUNT, period, salt }),
    };
  });
}

export function faucetBand(): number {
  return bandFor(AMOUNT).id;
}

export async function faucetStatus(recipient: string): Promise<FaucetStatus> {
  const subject = getAddress(recipient);
  const payer = faucetPayer();
  const slips = faucetSlips(subject);

  const [anchors, attestations] = await Promise.all([
    Promise.all(
      slips.map((slip) =>
        sepoliaClient.readContract({
          address: ADDRESSES[SEPOLIA_ID].payerAnchor,
          abi: payerAnchorAbi,
          functionName: "anchoredBy",
          args: [payer, slip.commitment],
        }),
      ),
    ),
    Promise.all(
      slips.map((slip) =>
        creditcoinClient.readContract({
          address: ADDRESSES[CREDITCOIN_ID].attestationRegistry,
          abi: attestationRegistryAbi,
          functionName: "acceptedByPayer",
          args: [slip.commitment, payer],
        }),
      ),
    ),
  ]);

  const anchored = anchors.every(Boolean);
  const attested = attestations.every(Boolean);

  return { address: subject, payer, band: faucetBand(), anchored, attested, ready: attested };
}

/** Anchors a claim on Ethereum as the payer. Idempotent. */
export async function anchorClaim(recipient: string): Promise<`0x${string}` | null> {
  const key = process.env.ORRU_FAUCET_PAYER_KEY as Hex | undefined;
  if (!key) throw new Error("ORRU_FAUCET_PAYER_KEY is not set");

  const status = await faucetStatus(recipient);
  if (status.anchored) return null;

  const account = privateKeyToAccount(key);

  if (getAddress(account.address) !== faucetPayer()) {
    throw new FaucetMisconfigured(account.address, faucetPayer());
  }

  const funds = await sepoliaClient.getBalance({ address: account.address });
  if (funds === 0n) {
    throw new FaucetUnfunded(account.address);
  }

  const wallet = createWalletClient({
    account,
    chain: sepolia,
    transport: http(process.env.SEPOLIA_RPC_URL || "https://ethereum-sepolia-rpc.publicnode.com"),
  });

  return wallet.writeContract({
    address: ADDRESSES[SEPOLIA_ID].payerAnchor,
    abi: payerAnchorAbi,
    functionName: "anchorBatch",
    args: [faucetSlips(recipient).map((slip) => slip.commitment)],
  });
}
