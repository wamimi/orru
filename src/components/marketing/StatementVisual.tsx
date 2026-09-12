import { CheckCircle, EyeSlash } from "@phosphor-icons/react/dist/ssr";
import { Mark } from "@/components/brand/Mark";

export function StatementVisual({ compact = false }: { compact?: boolean }) {
  return (
    <div className={`mkt-statement ${compact ? "mkt-statement--compact" : ""}`}>
      <div className="mkt-statement__top">
        <div className="mkt-statement__brand">
          <Mark size={18} />
          <span>orru statement</span>
        </div>
        <span className="mkt-status">
          <CheckCircle size={14} weight="fill" />
          Valid
        </span>
      </div>

      <div className="mkt-statement__range">
        <span>Verified income range</span>
        <strong>$2,500 – $4,000</strong>
        <small>per pay cycle</small>
      </div>

      <dl className="mkt-statement__rows">
        <div>
          <dt>Periods</dt>
          <dd>3 consecutive</dd>
        </div>
        <div>
          <dt>Statement</dt>
          <dd>orru:cred:7b6a24eb</dd>
        </div>
      </dl>

      <div className="mkt-statement__privacy">
        <EyeSlash size={15} />
        <span>Exact pay excluded</span>
      </div>
    </div>
  );
}
