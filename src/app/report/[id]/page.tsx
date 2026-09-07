import type { Metadata } from "next";
import { ScreenFrame } from "@/components/app/ScreenFrame";
import { PublicChrome } from "@/components/public/PublicChrome";
import { creditcoinTxUrl, sepoliaTxUrl, truncateHex } from "@/lib/chain";
import { buildReport } from "@/lib/report";

export const dynamic = "force-dynamic";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const { id } = await params;
  return { title: `Income check ${truncateHex(id)}` };
}

export default async function ReportPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const report = await buildReport(id);
  const passed = report.result === "pass";

  return (
    <PublicChrome>
      <ScreenFrame
        kicker="Lender check"
        title={passed ? "This statement passes." : "This statement does not pass."}
        lede="A range, a period count, and whether the employer is recognised. Exact pay is not in this page."
      >
        <p
          className={`meta ${
            passed ? "text-brand" : "text-[color:var(--ev-failed-fg)]"
          }`}
        >
          {passed ? "Pass" : "Fail"}
          <span className="mx-3 text-rule-strong">·</span>
          {truncateHex(id)}
        </p>

        {report.income?.incomeBand ? (
          <p className="display-md mt-6 text-ink">{report.income.incomeBand.label}</p>
        ) : null}

        <ul className="mt-10 max-w-xl">
          {report.reasonCodes.map((row) => (
            <li key={row.code} className="border-t border-rule py-4">
              <p className="meta text-ink">{row.pass ? "Met" : "Not met"}</p>
              <p className="mt-1 text-sm leading-relaxed text-ink-soft">{row.detail}</p>
            </li>
          ))}
        </ul>

        {report.evidence.length > 0 ? (
          <div className="mt-12 max-w-xl">
            <p className="eyebrow text-ink-faint">Evidence</p>
            <ul className="mt-4">
              {report.evidence.map((row) => (
                <li key={`${row.period}-${row.sourceTx}`} className="border-t border-rule py-4">
                  <p className="text-sm text-ink">Period {row.period}</p>
                  <p className="meta mt-1 text-ink-faint">{row.sourceChain}</p>
                  <div className="mt-2 flex flex-col items-start gap-1">
                    <a
                      href={sepoliaTxUrl(row.sourceTx)}
                      target="_blank"
                      rel="noreferrer"
                      className="meta text-brand hover:text-brand-hover"
                    >
                      Open the Sepolia record
                    </a>
                    {row.verifiedTx ? (
                      <a
                        href={creditcoinTxUrl(row.verifiedTx)}
                        target="_blank"
                        rel="noreferrer"
                        className="meta text-brand hover:text-brand-hover"
                      >
                        Open the chain confirmation
                      </a>
                    ) : null}
                  </div>
                </li>
              ))}
            </ul>
          </div>
        ) : null}

        {report.creditcoinTxs.length > 0 ? (
          <p className="meta mt-10 text-ink-faint">
            {report.creditcoinTxs.length} confirmation
            {report.creditcoinTxs.length === 1 ? "" : "s"} on Creditcoin
          </p>
        ) : null}
      </ScreenFrame>
    </PublicChrome>
  );
}
