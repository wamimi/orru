"use client";

import Link from "next/link";
import {
  ArrowRight,
  CheckCircle,
  Eye,
  Files,
  Fingerprint,
  ShareNetwork,
  TrendUp,
  Wallet,
} from "@phosphor-icons/react";
import { useFlowSession } from "@/components/app/useFlowSession";
import { ButtonLink } from "@/components/ui/Button";
import { appSteps } from "@/lib/app";

export function DashboardScreen() {
  const { session } = useFlowSession();
  const hasIncome = Boolean(session.income?.provableWindow);
  const hasStatement = Boolean(session.credentialId);

  const next = !session.connected || !session.signed
    ? { href: "/connect", label: "Connect payout account" }
    : !hasIncome
      ? { href: "/review", label: "Review income" }
      : !hasStatement
        ? { href: "/credential", label: "Issue statement" }
        : { href: "/consent", label: "Share statement" };

  const taskState = (id: string) => {
    if (id === "connect") return session.connected && session.signed;
    if (id === "review" || id === "profile") return hasIncome;
    if (id === "credential") return hasStatement;
    return false;
  };

  const taskCopy: Record<string, string> = {
    connect: "Prove control of the wallet where you are paid.",
    review: "Inspect the confirmed payment history that can count.",
    profile: "See the income range created from confirmed periods.",
    credential: "Create a portable, band-only statement.",
    consent: "Choose what to share and who can see it.",
  };

  return (
    <div className="dashboard">
      <header className="dashboard__header">
        <div>
          <p className="dashboard__eyebrow">Income workspace</p>
          <h1 className="dashboard__title">
            Your income, ready to travel.
          </h1>
          <p className="dashboard__intro">
            Confirm your pay history, issue a statement, and share it without
            putting exact pay into the credential.
          </p>
          <div className="mt-7">
            <ButtonLink href={next.href}>
              {next.label}
              <ArrowRight size={17} />
            </ButtonLink>
          </div>
        </div>
      </header>

      <section className="dashboard__grid" aria-label="Workspace summary">
        <Link href="/profile" className="dashboard-card dashboard-card--accent">
          <div className="dashboard-card__top">
            <span>Income range</span>
            <span className="dashboard-card__icon"><TrendUp size={18} /></span>
          </div>
          <div>
            <p className="dashboard-card__value">
              {session.income?.incomeBand?.label ?? "Not ready"}
            </p>
            <p className="dashboard-card__caption">
              {hasIncome
                ? `${session.income?.periodsAttested ?? 0} confirmed pay cycles`
                : "Review payments to create your range"}
            </p>
          </div>
        </Link>

        <Link href="/credential" className="dashboard-card">
          <div className="dashboard-card__top">
            <span>Statement</span>
            <span className="dashboard-card__icon"><Fingerprint size={18} /></span>
          </div>
          <div>
            <p className="dashboard-card__value">
              {hasStatement ? "Issued" : "Not issued"}
            </p>
            <p className="dashboard-card__caption">
              {hasStatement
                ? "Publicly checkable on Creditcoin"
                : "Exact payment amounts stay excluded"}
            </p>
          </div>
        </Link>

        <Link href="/consent" className="dashboard-card">
          <div className="dashboard-card__top">
            <span>Sharing</span>
            <span className="dashboard-card__icon"><ShareNetwork size={18} /></span>
          </div>
          <div>
            <p className="dashboard-card__value">
              {hasStatement ? "Ready" : "Locked"}
            </p>
            <p className="dashboard-card__caption">
              Sharing remains a separate, explicit action.
            </p>
          </div>
        </Link>
      </section>

      <section className="dashboard__section">
        <div className="dashboard__section-head">
          <h2>Your workflow</h2>
          <Link href="/check" className="meta text-ink-faint hover:text-ink">
            Open public checker
          </Link>
        </div>
        <div className="dashboard-tasks">
          {appSteps.map((step) => {
            const done = taskState(step.id);
            const icons = {
              connect: Wallet,
              review: Eye,
              profile: TrendUp,
              credential: Files,
              consent: ShareNetwork,
            };
            const Icon = icons[step.id];
            return (
              <Link key={step.id} href={step.href} className="dashboard-task">
                <span className="dashboard-task__number">
                  <Icon size={16} />
                  <span>{step.number}</span>
                </span>
                <div>
                  <h3>{step.label}</h3>
                  <p>{taskCopy[step.id]}</p>
                </div>
                <span className={`dashboard-task__state ${done ? "is-done" : ""}`}>
                  {done ? (
                    <span className="inline-flex items-center gap-1">
                      <CheckCircle size={12} weight="fill" />
                      Done
                    </span>
                  ) : "Open"}
                </span>
              </Link>
            );
          })}
        </div>
      </section>
    </div>
  );
}
