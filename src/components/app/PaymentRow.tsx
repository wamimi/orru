import { CaretDown } from "@phosphor-icons/react";
import { EvidenceBadge } from "@/components/ui/EvidenceBadge";
import { evidenceLinks } from "@/lib/income-view";
import type { Payment } from "@/lib/mock/types";

export function PaymentRow({
  payment,
  open,
  onToggle,
}: {
  payment: Payment;
  open: boolean;
  onToggle: () => void;
}) {
  const links = evidenceLinks(payment);

  return (
    <li className="border-t border-rule py-5 first:border-t-0">
      <button
        type="button"
        className="flex w-full flex-wrap items-center justify-between gap-x-4 gap-y-2 text-left"
        onClick={onToggle}
        aria-expanded={open}
      >
        <div>
          <p className="meta text-ink">{payment.period}</p>
          <p className="mt-1 text-sm text-ink-soft">
            {payment.payer} · {payment.received}
          </p>
        </div>
        <span className="flex items-center gap-2">
          <EvidenceBadge state={payment.evidence} />
          <CaretDown
            size={16}
            className={`text-ink-faint transition-transform duration-200 ${open ? "rotate-180" : ""}`}
          />
        </span>
      </button>
      {open ? (
        <div className="mt-4 max-w-md text-sm leading-relaxed text-ink-soft">
          <p>
            {payment.sourceChain ?? "Payment record"}
            {payment.sourceTx ? " · incoming payment" : null}
          </p>
          {links.length > 0 ? (
            <div className="mt-2 flex flex-col items-start gap-1">
              {links.map((link) => (
                <a
                  key={link.href}
                  href={link.href}
                  target="_blank"
                  rel="noreferrer"
                  className="meta text-brand hover:text-brand-hover"
                >
                  {link.label}
                </a>
              ))}
            </div>
          ) : (
            <p className="meta mt-2 text-ink-faint">
              No public record is attached to this row.
            </p>
          )}
          {payment.sourceTx && !payment.verifiedTx ? (
            <p className="meta mt-2 text-ink-faint">
              Found on Sepolia, chain confirmation pending.
            </p>
          ) : null}
        </div>
      ) : null}
    </li>
  );
}
