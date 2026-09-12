import type { Metadata } from "next";
import { Lockup } from "@/components/brand/Lockup";
import { Mark } from "@/components/brand/Mark";
import { Wordmark } from "@/components/brand/Wordmark";
import { CredentialCard } from "@/components/ui/CredentialCard";
import { EvidenceBadge } from "@/components/ui/EvidenceBadge";

export const metadata: Metadata = {
  title: "Brand sheet",
  robots: { index: false, follow: false },
};

const markSizes = [16, 20, 24, 32, 48, 96];
const wordmarkSizes = [14, 20, 28, 48];

const swatches = [
  { name: "canvas", value: "var(--canvas)" },
  { name: "canvas-raised", value: "var(--canvas-raised)" },
  { name: "paper", value: "var(--paper)" },
  { name: "ink", value: "var(--ink)" },
  { name: "ink-soft", value: "var(--ink-soft)" },
  { name: "ink-faint", value: "var(--ink-faint)" },
  { name: "brand", value: "var(--brand)" },
  { name: "brand-hover", value: "var(--brand-hover)" },
  { name: "signal", value: "var(--signal)" },
  { name: "night", value: "var(--night)" },
];

function Row({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="border-t border-rule py-12">
      <h2 className="eyebrow text-ink-faint">{title}</h2>
      <div className="mt-8">{children}</div>
    </section>
  );
}

export default function BrandPage() {
  return (
    <main className="mx-auto w-full max-w-5xl px-6 py-16 md:px-10">
      <h1 className="display-lg text-ink">Brand sheet</h1>
      <p className="mt-3 max-w-xl text-[0.9375rem] leading-relaxed text-ink-soft">
        Internal reference. Every asset here is the same code the site uses, so
        nothing can drift out of sync.
      </p>

      <Row title="Against the reference">
        <div className="grid max-w-xl grid-cols-2 items-start gap-10">
          <div>
            <p className="meta mb-4 text-ink-faint">Reference</p>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src="/brand/orru-mark-reference.png"
              alt="Supplied Orru mark"
              className="h-48 w-48 object-contain"
            />
          </div>
          <div className="text-brand">
            <p className="meta mb-4 text-ink-faint">Live mark</p>
            <Mark size={192} />
          </div>
        </div>
      </Row>

      <Row title="Mark at size">
        <div className="flex flex-wrap items-end gap-10 text-brand">
          {markSizes.map((size) => (
            <div key={size} className="flex flex-col items-center gap-3">
              <Mark size={size} />
              <span className="meta text-ink-faint">{size}px</span>
            </div>
          ))}
        </div>
      </Row>

      <Row title="Mark reversed">
        <div className="on-night flex flex-wrap items-end gap-10 rounded-card p-8">
          {markSizes.map((size) => (
            <div key={size} className="flex flex-col items-center gap-3">
              <Mark size={size} />
              <span className="meta text-on-night-soft">{size}px</span>
            </div>
          ))}
        </div>
      </Row>

      <Row title="Wordmark at size">
        <div className="flex flex-col gap-8 text-brand">
          {wordmarkSizes.map((height) => (
            <div key={height} className="flex items-center gap-6">
              <span className="meta w-12 text-ink-faint">{height}px</span>
              <Wordmark height={height} />
            </div>
          ))}
        </div>
      </Row>

      <Row title="Lockup">
        <div className="flex flex-col gap-8 text-brand">
          {[16, 20, 28, 40].map((height) => (
            <div key={height} className="flex items-center gap-6">
              <span className="meta w-12 text-ink-faint">{height}px</span>
              <Lockup height={height} />
            </div>
          ))}
        </div>
        <div className="on-night mt-8 rounded-card p-8">
          <Lockup height={28} />
        </div>
      </Row>

      <Row title="Type scale">
        <div className="space-y-6">
          <p className="display-xl text-ink">Display xl</p>
          <p className="display-lg text-ink">Display lg</p>
          <p className="display-md text-ink">Display md</p>
          <p className="display-sm text-ink">Display sm</p>
          <p className="text-base text-ink-soft">
            Body: Instrument Sans at 1rem, 1.6 line height.
          </p>
          <p className="meta text-ink">meta: JetBrains Mono 0.75rem</p>
          <p className="eyebrow text-ink-faint">Eyebrow: uppercase tracked</p>
        </div>
      </Row>

      <Row title="Color">
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-5">
          {swatches.map((swatch) => (
            <div key={swatch.name}>
              <div
                className="h-20 rounded-control border border-rule"
                style={{ background: swatch.value }}
              />
              <p className="meta mt-2 text-ink-soft">{swatch.name}</p>
            </div>
          ))}
        </div>
      </Row>

      <Row title="Evidence states">
        <div className="flex flex-wrap gap-3">
          <EvidenceBadge state="verified" />
          <EvidenceBadge state="attested" />
          <EvidenceBadge state="found" />
          <EvidenceBadge state="pending" />
          <EvidenceBadge state="failed" />
        </div>
      </Row>

      <Row title="Credential card">
        <div className="max-w-md">
          <CredentialCard />
        </div>
      </Row>
    </main>
  );
}
