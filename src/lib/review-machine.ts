import type { EvidenceState } from "@/components/ui/EvidenceBadge";
import { demoPayments, unrecognisedPayments } from "./mock/payments";
import type { Payment, Recovery } from "./mock/types";

export type ReviewScenario = "happy" | "empty" | "unrecognised" | "failed";

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
    title: "Finding payments",
    body: "Looking up incoming payments to this address.",
  },
  confirm: {
    title: "Confirming each payment",
    body: "Checking each one against the chain it settled on, and whether the sender is recognised.",
  },
  pattern: {
    title: "Checking the income pattern",
    body: "Counting consecutive periods and how recent the last payment was.",
  },
};

const FIND_DONE = 700;
const CONFIRM_START = 900;
const CONFIRM_STEP = 650;
const PATTERN_LEAD = 400;
const PATTERN_DONE = 800;

function clonePayments(source: Payment[], evidence: EvidenceState): Payment[] {
  return source.map((payment) => ({ ...payment, evidence }));
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

/**
 * Clock-driven review snapshot. Phase 2 feeds elapsed milliseconds from a
 * client ticker; live jobs later feed the same shape from worker status.
 */
export function reviewAt(elapsedMs: number, scenario: ReviewScenario): ReviewSnapshot {
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
        title: "No qualifying payments found",
        body: "Nothing incoming to this address met the bar: recognised sender, recent enough, and on a network we check.",
        actionLabel: "Use a different address",
        actionHref: "/connect",
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

  const source = scenario === "unrecognised" ? unrecognisedPayments : demoPayments;
  const confirmWindow = source.length * CONFIRM_STEP;

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
      ? { ...payment, evidence: "attested" as const }
      : { ...payment, evidence: "failed" as const },
  );

  if (scenario === "unrecognised") {
    return {
      stages: stages("done", "failed", "waiting"),
      payments: confirmedPayments,
      canContinue: false,
      recovery: {
        title: "A sender is not recognised",
        body: "A payment arrived from an address we do not treat as a payer. It cannot count toward the band.",
        actionLabel: "Review the payments",
        actionHref: "/review",
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
      evidence: "verified",
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
  if (state === "error") return "unrecognised";
  return "happy";
}
