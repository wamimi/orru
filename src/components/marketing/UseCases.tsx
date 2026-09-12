import {
  ArrowRight,
  Bank,
  Buildings,
  CheckCircle,
  FileText,
  ShieldCheck,
} from "@phosphor-icons/react/dist/ssr";

const useCases = [
  {
    product: "Statements",
    title: "Proof of income, ready to send",
    description:
      "For visa, rental, and financial reviews. A verified range, recency, and pay cycles. Never the exact pay.",
    visual: "statement",
  },
  {
    product: "Credit access",
    title: "Borrow against proven income",
    description:
      "Show a lender confirmed income history. They check the statement themselves and set their own terms.",
    visual: "credit",
  },
  {
    product: "Credentials",
    title: "Credit rails for fintechs",
    description:
      "Fintechs and neobanks verify wallet-bound income credentials for users paid in stablecoins. No uploaded PDFs. No trust in Orru.",
    visual: "credential",
  },
] as const;

function UseCaseVisual({
  kind,
}: {
  kind: (typeof useCases)[number]["visual"];
}) {
  if (kind === "statement") {
    return (
      <div className="mkt-use-case-ui mkt-use-case-ui--statement" aria-hidden="true">
        <div className="mkt-use-case-ui__bar">
          <span><FileText size={14} /> Income statement</span>
          <strong><CheckCircle size={13} weight="fill" /> Valid</strong>
        </div>
        <div className="mkt-use-case-ui__range">
          <span>Confirmed income range</span>
          <strong>$2.5k – $4k</strong>
          <small>per pay cycle</small>
        </div>
        <div className="mkt-use-case-ui__facts">
          <span>3 pay cycles</span>
          <span>Exact pay hidden</span>
        </div>
      </div>
    );
  }

  if (kind === "credit") {
    return (
      <div className="mkt-use-case-ui mkt-use-case-ui--credit" aria-hidden="true">
        <div className="mkt-credit-node">
          <span><Bank size={15} /></span>
          <div>
            <small>Income proof</small>
            <strong>Ready</strong>
          </div>
        </div>
        <div className="mkt-credit-route">
          <span />
          <ArrowRight size={16} />
        </div>
        <div className="mkt-credit-node">
          <span><Buildings size={15} /></span>
          <div>
            <small>Lender review</small>
            <strong>Independent</strong>
          </div>
        </div>
        <p><ShieldCheck size={14} /> Evidence checked onchain</p>
      </div>
    );
  }

  return (
    <div className="mkt-use-case-ui mkt-use-case-ui--credential" aria-hidden="true">
      <div className="mkt-credential-request">
        <span>GET</span>
        <code>/verify/orru:cred:7b6a</code>
      </div>
      <div className="mkt-credential-response">
        <div>
          <span>credential.status</span>
          <strong>valid</strong>
        </div>
        <div>
          <span>income.band</span>
          <strong>$2.5k–$4k</strong>
        </div>
        <div>
          <span>periods</span>
          <strong>3 confirmed</strong>
        </div>
      </div>
    </div>
  );
}

export function UseCases() {
  return (
    <div className="mkt-use-cases">
      {useCases.map((useCase) => (
        <article className="mkt-use-case" key={useCase.title}>
          <div className="mkt-use-case-visual">
            <UseCaseVisual kind={useCase.visual} />
          </div>
          <div className="mkt-use-case__copy">
            <span>{useCase.product}</span>
            <h3>{useCase.title}</h3>
            <p>{useCase.description}</p>
          </div>
        </article>
      ))}
    </div>
  );
}
