import {
  createWalletClient,
  decodeEventLog,
  encodeAbiParameters,
  getAddress,
  http,
  isHash,
  keccak256,
  parseAbi,
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

/** Attestcoin needs a later covered block to build the continuity proof. */
const ATTEST_LOOKAHEAD = 10n;
const SOURCE_CHAIN_KEY = 1n;
const CHAIN_INFO_PRECOMPILE = "0x0000000000000000000000000000000000000fd3";
const chainInfoAbi = parseAbi([
  "function get_latest_attestation_height_and_hash(uint64 chainKey) view returns ((uint64 height, bytes32 hash, bool isAttestation, bool exists) result)",
]);

export type FaucetProgress = {
  phase: "ethereum" | "attestcoin" | "relayer" | "ready";
  sourceBlock: string | null;
  targetBlock: string | null;
  latestAttestedBlock: string | null;
  blocksRemaining: string | null;
};

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
  progress: FaucetProgress;
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

export async function faucetStatus(
  recipient: string,
  sourceTx?: Hex,
): Promise<FaucetStatus> {
  const subject = getAddress(recipient);
  const payer = faucetPayer();
  const slips = faucetSlips(subject);

  const [anchors, attested] = await Promise.all([
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
    faucetAttested(subject),
  ]);

  const anchored = anchors.every(Boolean);

  const progress: FaucetProgress = {
    phase: attested ? "ready" : anchored ? "attestcoin" : "ethereum",
    sourceBlock: null,
    targetBlock: null,
    latestAttestedBlock: null,
    blocksRemaining: null,
  };

  if (anchored && !attested && sourceTx && isHash(sourceTx)) {
    const sourceBlock = await claimSourceBlock(subject, sourceTx);
    if (sourceBlock !== null) {
      const targetBlock = sourceBlock + ATTEST_LOOKAHEAD;
      const latestAttestedBlock = await latestUsableAttestedBlock();
      const blocksRemaining =
        latestAttestedBlock === null || latestAttestedBlock >= targetBlock
          ? 0n
          : targetBlock - latestAttestedBlock;

      progress.sourceBlock = sourceBlock.toString();
      progress.targetBlock = targetBlock.toString();
      progress.latestAttestedBlock = latestAttestedBlock?.toString() ?? null;
      progress.blocksRemaining =
        latestAttestedBlock === null ? null : blocksRemaining.toString();
      if (latestAttestedBlock !== null && blocksRemaining === 0n) {
        progress.phase = "relayer";
      }
    }
  }

  return {
    address: subject,
    payer,
    band: faucetBand(),
    anchored,
    attested,
    ready: attested,
    progress,
  };
}

/**
 * Whether Creditcoin accepted this exact recipient window for the configured
 * payer. A rejected parallel read is retried once on its own so one throttled
 * public RPC request does not hide an otherwise usable history.
 */
export async function faucetAttested(recipient: string): Promise<boolean> {
  const subject = getAddress(recipient);
  const payer = faucetPayer();
  const slips = faucetSlips(subject);
  const read = (commitment: Hex) =>
    creditcoinClient.readContract({
      address: ADDRESSES[CREDITCOIN_ID].attestationRegistry,
      abi: attestationRegistryAbi,
      functionName: "acceptedByPayer",
      args: [commitment, payer],
    });

  const first = await Promise.allSettled(
    slips.map((slip) => read(slip.commitment)),
  );
  const accepted = await Promise.all(
    first.map((result, index) =>
      result.status === "fulfilled"
        ? Promise.resolve(result.value)
        : read(slips[index].commitment),
    ),
  );
  return accepted.every(Boolean);
}

async function claimSourceBlock(
  recipient: `0x${string}`,
  txHash: Hex,
): Promise<bigint | null> {
  try {
    const receipt = await sepoliaClient.getTransactionReceipt({ hash: txHash });
    if (
      receipt.status !== "success" ||
      receipt.to?.toLowerCase() !== ADDRESSES[SEPOLIA_ID].payerAnchor.toLowerCase()
    ) {
      return null;
    }

    const expected = new Set(
      faucetSlips(recipient).map((slip) => slip.commitment.toLowerCase()),
    );
    for (const log of receipt.logs) {
      if (log.address.toLowerCase() !== ADDRESSES[SEPOLIA_ID].payerAnchor.toLowerCase()) {
        continue;
      }
      try {
        const decoded = decodeEventLog({
          abi: payerAnchorAbi,
          eventName: "PaymentAnchored",
          data: log.data,
          topics: log.topics,
        });
        if (decoded.args.payer.toLowerCase() === faucetPayer().toLowerCase()) {
          expected.delete(decoded.args.commitment.toLowerCase());
        }
      } catch {
        /* Ignore unrelated logs from the transaction. */
      }
    }

    return expected.size === 0 ? receipt.blockNumber : null;
  } catch {
    return null;
  }
}

/**
 * The worker requires both Creditcoin's chain-info precompile and the prover
 * service to cover the target. The lower height is therefore the usable one.
 */
async function latestUsableAttestedBlock(): Promise<bigint | null> {
  const proofBuilderUrl = (
    process.env.PROOF_BUILDER_URL ??
    "https://prover.cc3-testnet.creditcoin.network"
  ).replace(/\/$/, "");

  const [onChainResult, proverResult] = await Promise.allSettled([
    creditcoinClient.readContract({
      address: CHAIN_INFO_PRECOMPILE,
      abi: chainInfoAbi,
      functionName: "get_latest_attestation_height_and_hash",
      args: [SOURCE_CHAIN_KEY],
    }),
    fetch(`${proofBuilderUrl}/api/v1/attested-height/${SOURCE_CHAIN_KEY}`, {
      cache: "no-store",
      signal: AbortSignal.timeout(5_000),
    }).then(async (response) => {
      if (!response.ok) throw new Error("Attestcoin status read failed");
      const body = (await response.json()) as {
        attestedHeight?: number | string;
      };
      if (body.attestedHeight === undefined) {
        throw new Error("Attestcoin status did not include a height");
      }
      return BigInt(body.attestedHeight);
    }),
  ]);

  if (onChainResult.status !== "fulfilled" || proverResult.status !== "fulfilled") {
    return null;
  }
  if (!onChainResult.value.exists) return null;

  const onChainHeight = onChainResult.value.height;
  return onChainHeight < proverResult.value ? onChainHeight : proverResult.value;
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
