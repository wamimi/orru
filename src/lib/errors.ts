import { BaseError, ContractFunctionRevertedError, formatUnits } from "viem";
import { TOKEN_DECIMALS } from "@/lib/chain";

const COPY: Record<string, string | ((args?: readonly unknown[]) => string)> = {
  CommitmentNotAttestedToPayer:
    "We're still confirming your payments. Try again in a few minutes.",
  InvalidSubjectAuthorization: "That signature didn't match this wallet.",
  AuthorizationExpired: "That took too long. Let's try again.",
  CredentialExists: "You already have a statement for these pay cycles.",
  InvalidProof: "Something went wrong checking your income.",
  SumcheckFailed: "Something went wrong checking your income.",
  WrongPublicInputCount: "Something went wrong checking your income.",
  CredentialNotValid: "This statement is no longer active.",
  EvidenceTooOld: "This statement is based on older payments.",
  InsufficientLiquidity: "We can't complete this right now.",
  ExceedsLimit: (args) =>
    `The most available right now is ${formatRemaining(args?.[1])}.`,
};

function formatRemaining(value: unknown): string {
  try {
    const amount = typeof value === "bigint" ? value : BigInt(String(value ?? 0));
    return `${formatUnits(amount, TOKEN_DECIMALS)} mUSDC`;
  } catch {
    return "the current headroom";
  }
}

function copyFor(name: string, args?: readonly unknown[]): string | null {
  const entry = COPY[name];
  if (!entry) return null;
  return typeof entry === "function" ? entry(args) : entry;
}

/**
 * Map a Creditcoin revert to user-facing copy. Vocabulary from §0 / §8d.
 */
export function friendlyError(err: unknown): string {
  if (err instanceof BaseError) {
    const revert = err.walk((inner) => inner instanceof ContractFunctionRevertedError);
    if (revert instanceof ContractFunctionRevertedError) {
      const named = copyFor(revert.data?.errorName ?? "", revert.data?.args);
      if (named) return named;
      if (revert.data?.errorName) {
        return "Something went wrong checking your income.";
      }
    }
  }
  if (err instanceof Error) {
    const match = err.message.match(
      /\b(CommitmentNotAttestedToPayer|InvalidSubjectAuthorization|AuthorizationExpired|CredentialExists|InvalidProof|SumcheckFailed|WrongPublicInputCount|CredentialNotValid|ExceedsLimit|EvidenceTooOld|InsufficientLiquidity)\b/,
    );
    const named = match?.[1] ? copyFor(match[1]) : null;
    if (named) return named;
  }
  return "Something went wrong. Please try again.";
}
