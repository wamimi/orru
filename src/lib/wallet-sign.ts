import type { ConnectedWallet } from "@privy-io/react-auth";
import { getTypesForEIP712Domain, stringToHex, type TypedDataDomain } from "viem";

const TIMEOUT_MS = 120_000;

/** The wallet never answered the request. */
export class SignatureTimeout extends Error {
  constructor() {
    super("No signature came back from the wallet.");
    this.name = "SignatureTimeout";
  }
}

function withTimeout<T>(task: Promise<T>): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const expiry = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new SignatureTimeout()), TIMEOUT_MS);
  });
  return Promise.race([task, expiry]).finally(() => clearTimeout(timer));
}

/** EIP-191 signature from the wallet's own provider. */
export async function signMessageWith(
  wallet: ConnectedWallet,
  message: string,
): Promise<`0x${string}`> {
  const provider = await wallet.getEthereumProvider();
  const signature: unknown = await withTimeout(
    provider.request({
      method: "personal_sign",
      params: [stringToHex(message), wallet.address],
    }),
  );
  return signature as `0x${string}`;
}

export type TypedData = {
  domain: TypedDataDomain;
  types: Record<string, { name: string; type: string }[]>;
  primaryType: string;
  message: Record<string, unknown>;
};

/** EIP-712 signature from the wallet's own provider. */
export async function signTypedDataWith(
  wallet: ConnectedWallet,
  typedData: TypedData,
): Promise<`0x${string}`> {
  const provider = await wallet.getEthereumProvider();
  const payload = {
    ...typedData,
    types: {
      EIP712Domain: getTypesForEIP712Domain({ domain: typedData.domain }),
      ...typedData.types,
    },
  };
  const signature: unknown = await withTimeout(
    provider.request({
      method: "eth_signTypedData_v4",
      params: [wallet.address, JSON.stringify(payload)],
    }),
  );
  return signature as `0x${string}`;
}

/** Resolves to `fallback` if the task has not settled in time. */
export function withLimit<T>(task: Promise<T>, ms: number, fallback: T): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const expiry = new Promise<T>((resolve) => {
    timer = setTimeout(() => resolve(fallback), ms);
  });
  return Promise.race([task, expiry]).finally(() => clearTimeout(timer));
}

/**
 * Makes the wallet forget this site, so the next connection asks which
 * account to use. Best effort: a wallet that does not answer is not waited on.
 */
export async function forgetSite(wallet: ConnectedWallet): Promise<void> {
  try {
    await withLimit(
      wallet.getEthereumProvider().then((provider) =>
        provider.request({
          method: "wallet_revokePermissions",
          params: [{ eth_accounts: {} }],
        }),
      ),
      1_500,
      undefined,
    );
  } catch {
    /* not every wallet supports it */
  }
}

/** A wallet's own rejection reads badly; say it plainly. */
export function signingProblem(cause: unknown, fallback = "The signature did not complete."): string {
  if (cause instanceof SignatureTimeout) {
    return "No signature came back. Open your wallet, look for a pending request, and try again.";
  }
  const code = (cause as { code?: number } | null)?.code;
  if (code === 4001) return "You declined the signature. Nothing was changed.";
  return cause instanceof Error && cause.message ? cause.message : fallback;
}
