import type { Metadata } from "next";
import { FaqAccordion } from "@/components/marketing/FaqAccordion";
import { LandingButton } from "@/components/marketing/LandingButton";
import { PartnerMarquee } from "@/components/marketing/PartnerMarquee";
import { SectionTag } from "@/components/marketing/SectionTag";
import { ServicesAccordion } from "@/components/marketing/ServicesAccordion";
import { SignalTerrain } from "@/components/marketing/SignalTerrain";
import { StatementVisual } from "@/components/marketing/StatementVisual";
import { UseCases } from "@/components/marketing/UseCases";
import { howItWorks } from "@/lib/marketing";

export const metadata: Metadata = {
  title: "Onchain income, made legible to credit",
  description:
    "Turn confirmed stablecoin income into a portable, band-only statement without publishing exact pay.",
  alternates: { canonical: "/" },
};

export default function PreviewPage() {
  return (
    <>
      <section className="mkt-hero">
        <div className="mkt-terrain-wrap">
          <SignalTerrain variant="hero" />
        </div>
        <div className="mkt-container mkt-hero__content">
          <h1 className="mkt-display mkt-hero__wordmark">Orru</h1>
          <p className="mkt-hero__copy">
            Onchain income, made legible to credit. Confirm your stablecoin pay
            history and share the range—not the number.
          </p>
          <div className="mkt-hero__actions">
            <LandingButton href="/connect" arrow>Launch app</LandingButton>
            <LandingButton href="#how-it-works" tone="dark">See how it works</LandingButton>
          </div>
        </div>
        <PartnerMarquee />
      </section>

      <section id="about" className="mkt-section mkt-about">
        <div className="mkt-container">
          <div className="mkt-section-head">
            <SectionTag>About Orru</SectionTag>
            <h2 className="mkt-section-title">
              The missing layer between stablecoin income and credit.
            </h2>
          </div>

          <div className="mkt-about__grid">
            <div className="mkt-about__visual">
              <div className="mkt-terrain-wrap">
                <SignalTerrain variant="card" />
              </div>
              <div className="mkt-about__statement">
                <StatementVisual />
              </div>
            </div>

            <div className="mkt-about__story">
              <p>
                Millions of people earn across borders, but a wallet full of
                stablecoin payments still looks like a blank file to most lenders.
                Orru turns confirmed pay cycles into a compact, portable statement.
              </p>
              <dl className="mkt-about__stats">
                <div>
                  <dt>Live statement</dt>
                  <dd>01</dd>
                </div>
                <div>
                  <dt>Confirmed periods</dt>
                  <dd>03</dd>
                </div>
                <div>
                  <dt>Exact amount shown</dt>
                  <dd>No</dd>
                </div>
              </dl>
            </div>
          </div>
        </div>
      </section>

      <section id="services" className="mkt-section mkt-services-section">
        <div className="mkt-container">
          <div className="mkt-section-head">
            <SectionTag>What Orru does</SectionTag>
            <h2 className="mkt-section-title">
              From raw payments to a useful statement.
            </h2>
          </div>
          <ServicesAccordion />
        </div>
      </section>

      <section id="use-cases" className="mkt-section mkt-use-cases-section">
        <div className="mkt-container">
          <div className="mkt-section-head mkt-section-head--center">
            <SectionTag>Use cases</SectionTag>
            <h2 className="mkt-section-title mkt-section-title--two-lines">
              <span>One income history.</span>
              <span>Three ways to use it.</span>
            </h2>
          </div>
          <UseCases />
        </div>
      </section>

      <section id="how-it-works" className="mkt-section mkt-how">
        <div className="mkt-container">
          <div className="mkt-section-head">
            <SectionTag>How it works</SectionTag>
            <h2 className="mkt-section-title">
              Three steps. No paid transaction from you.
            </h2>
          </div>
          <div className="mkt-steps">
            {howItWorks.map((step) => (
              <article key={step.number} className="mkt-step">
                <span className="mkt-step__number">{step.number}</span>
                <div className="mkt-step__content">
                  <div>
                    <h3 className="mkt-step__title">{step.title}</h3>
                    <span className="mkt-step__meta">{step.meta}</span>
                  </div>
                  <p className="mkt-step__description">{step.description}</p>
                </div>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section id="faq" className="mkt-section mkt-faq-section">
        <div className="mkt-container mkt-faq-layout">
          <div>
            <SectionTag>Questions, answered</SectionTag>
            <h2 className="mkt-section-title mkt-section-title--two-lines">
              <span>Clear enough to check</span>
              <span>for yourself.</span>
            </h2>
            <p className="mkt-faq__aside">
              An Orru statement confirms a specific history. It does not make a
              credit decision or promise future income.
            </p>
          </div>
          <FaqAccordion />
        </div>
      </section>

      <section className="mkt-cta-wrap">
        <div className="mkt-cta">
          <div className="mkt-terrain-wrap">
            <SignalTerrain variant="cta" />
          </div>
          <div className="mkt-cta__content">
            <SectionTag>Income that can travel</SectionTag>
            <h2 className="mkt-cta__title">
              Make income legible without revealing the number.
            </h2>
            <p className="mkt-cta__copy">
              Start with the wallet where you get paid, or check an existing
              statement in public.
            </p>
            <div className="mkt-hero__actions">
              <LandingButton href="/connect" arrow>Launch app</LandingButton>
              <LandingButton href="/check" tone="dark">Check a statement</LandingButton>
            </div>
          </div>
        </div>
      </section>
    </>
  );
}
