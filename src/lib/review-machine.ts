import type { EvidenceState } from "@/components/ui/EvidenceBadge";
import { demoPayments, unrecognisedPayments } from "./mock/payments";
import type { Payment, Recovery } from "./mock/types";

export type ReviewScenario =
  | "happy"
  | "empty"
  | "unrecognised"
  | "failed"
  | "gap"
  | "short"
  | "pending";

export type StageId = "find" | "confirm" | "pattern";

export type StageStatus = "waiting" | "running" | "done" | "failed" | "empty";

export type ReviewStage = {
  id: StageId;
  title: string;
  body: string;
  status: StageStatus;
};

export type ReviewSnapshot = {
  stages: ReviewStage[];
  payments: Payment[];
  canContinue: boolean;
  recovery?: Recovery;
};

const STAGE_COPY: Record<StageId, { title: string; body: string }> = {
  find: {
    title: "Looking at your payment history",
    body: "Reading incoming payments to this payout account.",
  },
  confirm: {
    title: "Confirming who paid you",
    body: "Checking whether each sender is a verified employer.",
  },
  pattern: {
    title: "Checking your income",
    body: "Counting consecutive periods and how recent the last payment was.",
  },
};

const FIND_DONE = 500;
const CONFIRM_START = 650;
const CONFIRM_STEP = 350;
const PATTERN_LEAD = 250;
const PATTERN_DONE = 500;

function clonePayments(source: Payment[], evidence: EvidenceState): Payment[] {
  return source.map((payment) => ({ ...payment, evidence }));
}

function settledEvidence(payment: Payment): EvidenceState {
  if (!payment.recognised) return "failed";
  if (payment.evidence === "attested" || payment.evidence === "verified") {
    return payment.evidence;
  }
  if (payment.verifiedTx) return "verified";
  if (payment.sourceTx) return "found";
  return "verified";
}

function stages(
  find: StageStatus,
  confirm: StageStatus,
  pattern: StageStatus,
): ReviewStage[] {
  return (["find", "confirm", "pattern"] as const).map((id) => ({
    id,
    ...STAGE_COPY[id],
    status: id === "find" ? find : id === "confirm" ? confirm : pattern,
  }));
}

function defaultSource(scenario: ReviewScenario): Payment[] {
  if (scenario === "unrecognised") return unrecognisedPayments;
  return demoPayments;
}

/**
 * Clock-driven review snapshot. Live lookups pass real rows; QA uses mocks.
 */
export function reviewAt(
  elapsedMs: number,
  scenario: ReviewScenario,
  source: Payment[] = defaultSource(scenario),
): ReviewSnapshot {
  if (scenario === "empty") {
    if (elapsedMs < FIND_DONE) {
      return {
        stages: stages("running", "waiting", "waiting"),
        payments: [],
        canContinue: false,
      };
    }
    return {
      stages: stages("empty", "waiting", "waiting"),
      payments: [],
      canContinue: false,
      recovery: {
        title: "No confirmed payments yet",
        body: "Nothing incoming to this payout account has been confirmed: recognised sender, recent enough, on a network we check. If you claimed a demo history, the faucet page shows how far along it is. No stablecoin pay yet? Get a demo history there.",
        actionLabel: "Open the demo faucet",
        actionHref: "/try",
      },
    };
  }

  if (scenario === "pending") {
    if (elapsedMs < FIND_DONE) {
      return {
        stages: stages("running", "waiting", "waiting"),
        payments: [],
        canContinue: false,
      };
    }
    return {
      stages: stages("done", "running", "waiting"),
      payments: clonePayments(source, "found"),
      canContinue: false,
      recovery: {
        title: "Still confirming your most recent payments",
        body: "We're still confirming your most recent payments. This usually clears on its own in a few minutes.",
        actionLabel: "Check again",
        actionHref: "/review",
      },
    };
  }

  if (scenario === "failed") {
    if (elapsedMs < FIND_DONE) {
      return {
        stages: stages("running", "waiting", "waiting"),
        payments: [],
        canContinue: false,
      };
    }
    return {
      stages: stages("failed", "waiting", "waiting"),
      payments: [],
      canContinue: false,
      recovery: {
        title: "Payments could not be confirmed",
        body: "The lookup finished, but confirmation against the chain did not. Try again in a moment.",
        actionLabel: "Try again",
        actionHref: "/review",
      },
    };
  }

  const confirmWindow = Math.max(source.length, 1) * CONFIRM_STEP;

  if (elapsedMs < FIND_DONE) {
    return {
      stages: stages("running", "waiting", "waiting"),
      payments: [],
      canContinue: false,
    };
  }

  if (elapsedMs < CONFIRM_START) {
    return {
      stages: stages("done", "waiting", "waiting"),
      payments: clonePayments(source, "found"),
      canContinue: false,
    };
  }

  const confirmElapsed = elapsedMs - CONFIRM_START;
  if (confirmElapsed < confirmWindow) {
    const confirmed = Math.min(
      source.length,
      Math.floor(confirmElapsed / CONFIRM_STEP) + 1,
    );
    const payments = source.map((payment, index) => {
      if (index >= confirmed) return { ...payment, evidence: "found" as const };
      if (!payment.recognised) return { ...payment, evidence: "failed" as const };
      if (payment.evidence === "attested" || payment.evidence === "verified") {
        return { ...payment, evidence: "attested" as const };
      }
      if (payment.sourceTx && !payment.verifiedTx) {
        return { ...payment, evidence: "found" as const };
      }
      return { ...payment, evidence: "attested" as const };
    });
    return {
      stages: stages("done", "running", "waiting"),
      payments,
      canContinue: false,
    };
  }

  const confirmedPayments = source.map((payment) =>
    payment.recognised
      ? {
          ...payment,
          evidence:
            payment.evidence === "attested" || payment.evidence === "verified"
              ? ("attested" as const)
              : payment.sourceTx && !payment.verifiedTx
              ? ("found" as const)
              : ("attested" as const),
        }
      : { ...payment, evidence: "failed" as const },
  );

  if (scenario === "unrecognised") {
    return {
      stages: stages("done", "failed", "waiting"),
      payments: confirmedPayments,
      canContinue: false,
      recovery: {
        title: "We couldn't recognise who paid you",
        body: "Orru only counts payments from employers, platforms and grant programmes.",
        actionLabel: "Use a different address",
        actionHref: "/connect",
      },
    };
  }

  if (scenario === "gap") {
    return {
      stages: stages("done", "done", "failed"),
      payments: confirmedPayments,
      canContinue: false,
      recovery: {
        title: "Your payments look irregular",
        body: "Orru needs three pay cycles in a row before a statement can be issued.",
        actionLabel: "Back to connect",
        actionHref: "/connect",
      },
    };
  }

  if (scenario === "short") {
    return {
      stages: stages("done", "done", "failed"),
      payments: confirmedPayments,
      canContinue: false,
      recovery: {
        title: "Not enough periods yet",
        body: "Fewer than three periods of pay have been confirmed. Come back after more payments land.",
        actionLabel: "Back to connect",
        actionHref: "/connect",
      },
    };
  }

  const patternElapsed = elapsedMs - CONFIRM_START - confirmWindow;
  if (patternElapsed < PATTERN_LEAD) {
    return {
      stages: stages("done", "done", "waiting"),
      payments: confirmedPayments,
      canContinue: false,
    };
  }
  if (patternElapsed < PATTERN_LEAD + PATTERN_DONE) {
    return {
      stages: stages("done", "done", "running"),
      payments: confirmedPayments,
      canContinue: false,
    };
  }

  return {
    stages: stages("done", "done", "done"),
    payments: confirmedPayments.map((payment) => ({
      ...payment,
      evidence: settledEvidence(payment),
    })),
    canContinue: true,
  };
}

export function scenarioFromState(
  state: string | null,
  error: string | null,
): ReviewScenario {
  if (state === "empty") return "empty";
  if (state === "error" && error === "failed") return "failed";
  if (state === "error" && error === "gap") return "gap";
  if (state === "error" && error === "short") return "short";
  if (state === "error" && error === "pending") return "pending";
  if (state === "error") return "unrecognised";
  return "happy";
}
