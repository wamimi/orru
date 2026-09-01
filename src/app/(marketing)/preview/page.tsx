import {
  ArrowRight,
  MagnifyingGlass,
  SealCheck,
  ShieldCheck,
} from "@phosphor-icons/react/dist/ssr";
import type { Metadata } from "next";
import { AudienceDoor } from "@/components/ui/AudienceDoor";
import { ButtonLink } from "@/components/ui/Button";
import { Contours } from "@/components/ui/Contours";
import { CredentialCard } from "@/components/ui/CredentialCard";
import { EvidenceBadge } from "@/components/ui/EvidenceBadge";
import { HiddenFields, SharedFields } from "@/components/ui/FieldDisclosure";
import { Intro, Reveal } from "@/components/ui/Reveal";
import { Section, SectionLabel } from "@/components/ui/Section";
import { StepRail } from "@/components/ui/StepRail";
import { primaryCta } from "@/lib/nav";

export const metadata: Metadata = {
  title: "Preview",
  description:
    "Orru turns stablecoin payments into a verifiable income credential. Workers prove they earn without disclosing exact amounts; lenders get an answer they can act on.",
  alternates: { canonical: "/preview" },
};

const asked = [
  "Three months of payslips",
  "A bank statement in your name",
  "A letter from your employer",
  "A tax record tied to that salary",
];

const have = [
  "0x9f2c…4a1b · 3,200 USDC",
  "A DAO payout, signed by a treasury",
  "An invoice settled in stablecoins",
  "A grant paid in four instalments",
];

const steps = [
  {
    title: "Connect the wallet you get paid into",
    body:
      "You sign a message to show the address is yours. Nothing is moved, and nothing is granted permission to touch your funds.",
    aside: (
      <p className="text-sm leading-relaxed text-ink-faint">
        Signing costs nothing and works from any wallet.
      </p>
    ),
  },
  {
    title: "Your payments get confirmed against the chain",
    body:
      "We look up incoming payments, then confirm each one independently. A payment only counts once it has been confirmed and the sender is a recognised payer.",
    aside: (
      <div className="flex flex-wrap gap-2">
        <EvidenceBadge state="found" />
        <EvidenceBadge state="attested" />
      </div>
    ),
  },
  {
    title: "You get a credential you control",
    body:
      "It states an income band, how many periods you have been paid, and how recent the last payment was. You choose who receives it, and for how long.",
    aside: (
      <div className="flex flex-wrap gap-2">
        <EvidenceBadge state="verified" />
      </div>
    ),
  },
];

const sharedFields = [
  { label: "Income band", value: "$2,500 – $5,000", state: "verified" as const },
  { label: "Consecutive periods", value: "4", state: "verified" as const },
  { label: "Most recent payment", value: "6 days ago", state: "attested" as const },
  { label: "Payer recognised", value: "yes", state: "attested" as const },
  { label: "Credential status", value: "valid", state: "verified" as const },
];

const hiddenFields = [
  "Exact amount of each payment",
  "Who your clients or employer are",
  "Your wallet's full transaction history",
  "Any other balance you hold",
];

const properties = [
  {
    title: "A band, not a number",
    body: "The credential says which range your income falls into. The individual payment amounts are never written into it.",
  },
  {
    title: "Confirmed, not asserted",
    body: "Every payment behind the band was checked against the chain it happened on. We are not vouching for it, and neither is an API.",
  },
  {
    title: "Checkable by anyone",
    body: "Status, period, and issuance record can be looked up without an account, so a lender never has to trust our word for it.",
  },
];

const trust = [
  {
    icon: MagnifyingGlass,
    title: "Search finds",
    body: "An indexer helps locate candidate payments quickly. Convenient, and trusted with nothing.",
  },
  {
    icon: SealCheck,
    title: "The chain proves",
    body: "Each payment is confirmed against the chain it settled on before it can count toward anything.",
  },
  {
    icon: ShieldCheck,
    title: "The credential shares",
    body: "What reaches a lender is a band and a status, derived from confirmed facts rather than raw history.",
  },
];

const limits = [
  {
    label: "Not a prediction",
    body: "Past payments are evidence of a pattern, not a promise of future income.",
  },
  {
    label: "Not affordability",
    body: "We do not assess your expenses, obligations, or ability to repay a loan.",
  },
  {
    label: "Not an identity check",
    body: "A credential proves control of a paid address, not who you legally are.",
  },
  {
    label: "Not a guarantee",
    body: "No lender is obliged to accept a credential, and repayment is never assured.",
  },
];

export default function Home() {
  return (
    <>
      {/* Hero */}
      <section className="relative isolate overflow-hidden border-b border-rule">
        <Contours className="-right-[14%] -top-[18%] h-[85%] w-[78%] text-brand opacity-[0.13]" />

        <div className="relative mx-auto w-full max-w-6xl px-6 pb-20 pt-16 md:px-10 md:pb-28 md:pt-24">
          <Intro>
            <p className="eyebrow flex items-center gap-2 text-brand">
              <span className="signal-dot inline-block h-1.5 w-1.5 rounded-full bg-brand" />
              Proof of income
            </p>
          </Intro>

          <div className="mt-8 grid gap-14 lg:grid-cols-[1.15fr_0.85fr] lg:items-end lg:gap-10">
            <div>
              <Intro delay={90}>
                <h1 className="display-xl max-w-[16ch] text-ink">
                  Paid in crypto.
                  <span className="block text-ink-faint">Invisible to credit.</span>
                </h1>
              </Intro>

              <Intro delay={210} className="mt-10 lg:mt-16">
                <div className="max-w-md">
                  <p className="text-base leading-relaxed text-ink-soft md:text-lg">
                    Orru turns the payments you already receive into a credential
                    a lender can act on — proving what you earn in a band,
                    without printing the amounts.
                  </p>
                  <div className="mt-7 flex flex-wrap items-center gap-4">
                    <ButtonLink href={primaryCta.href}>
                      {primaryCta.label}
                      <ArrowRight size={18} />
                    </ButtonLink>
                    <a
                      href="#how"
                      className="text-sm text-ink-soft underline decoration-rule-strong underline-offset-4 transition-tone hover:text-ink"
                    >
                      See how it works
                    </a>
                  </div>
                </div>
              </Intro>
            </div>

            <Intro delay={330} className="lg:pb-2">
              <CredentialCard />
            </Intro>
          </div>
        </div>
      </section>

      {/* The gap */}
      <Section tone="raised" divide={false}>
        <Reveal>
          <h2 className="display-lg max-w-3xl text-ink">
            Your income is real.
            <span className="text-ink-faint">
              {" "}
              It just does not look like income to anyone who lends.
            </span>
          </h2>
        </Reveal>

        <div className="mt-16 grid gap-12 md:grid-cols-2 md:gap-16">
          <Reveal>
            <h3 className="eyebrow text-ink-faint">What a lender asks for</h3>
            <ul className="mt-6 divide-y divide-rule">
              {asked.map((item) => (
                <li
                  key={item}
                  className="flex min-h-14 items-center text-[0.9375rem] text-ink-soft"
                >
                  {item}
                </li>
              ))}
            </ul>
          </Reveal>

          <Reveal order={1}>
            <h3 className="eyebrow text-brand">What you actually have</h3>
            <ul className="mt-6 divide-y divide-rule">
              {have.map((item) => (
                <li
                  key={item}
                  className="meta flex min-h-14 items-center text-ink"
                >
                  {item}
                </li>
              ))}
            </ul>
          </Reveal>
        </div>

        <Reveal>
          <p className="mt-14 max-w-2xl text-base leading-relaxed text-ink-soft md:text-lg">
            Someone earning steadily for two years can be turned down for a small
            advance, because the evidence they hold is not in a format anyone
            accepts. That is a formatting problem, not a creditworthiness
            problem.
          </p>
        </Reveal>
      </Section>

      {/* The credential */}
      <Section>
        <Reveal>
          <SectionLabel>The artifact</SectionLabel>
          <h2 className="display-lg mt-5 max-w-2xl text-ink">
            This is the whole product.
          </h2>
        </Reveal>

        <div className="mt-14 grid items-start gap-12 lg:grid-cols-2 lg:gap-16">
          <Reveal>
            <div className="max-w-md">
              <CredentialCard />
            </div>
          </Reveal>

          <Reveal order={1} className="flex flex-col gap-8 lg:pt-4">
            {properties.map((item) => (
              <div key={item.title}>
                <h3 className="display-sm text-ink">{item.title}</h3>
                <p className="mt-2 max-w-md text-[0.9375rem] leading-relaxed text-ink-soft">
                  {item.body}
                </p>
              </div>
            ))}
          </Reveal>
        </div>
      </Section>

      {/* How it works */}
      <Section id="how" tone="raised">
        <Reveal>
          <SectionLabel>How it works</SectionLabel>
          <h2 className="display-lg mt-5 max-w-2xl text-ink">
            Three steps, and one of them is just signing in.
          </h2>
        </Reveal>
        <StepRail steps={steps} />
      </Section>

      {/* Trust model */}
      <Section tone="night">
        <Reveal>
          <p className="eyebrow flex items-center gap-2 text-signal">
            <span className="signal-dot inline-block h-1.5 w-1.5 rounded-full bg-signal" />
            Trust model
          </p>
          <h2 className="display-lg mt-5 max-w-3xl text-on-night">
            Looking something up and proving it are not the same thing.
          </h2>
        </Reveal>

        <div className="mt-16 grid gap-10 md:grid-cols-3">
          {trust.map((item, index) => (
            <Reveal key={item.title} order={index}>
              <item.icon size={24} className="text-signal" />
              <h3 className="display-sm mt-5 text-on-night">{item.title}</h3>
              <p className="mt-2 text-[0.9375rem] leading-relaxed text-on-night-soft">
                {item.body}
              </p>
            </Reveal>
          ))}
        </div>

        <Reveal>
          <p className="mt-16 max-w-2xl border-t border-rule-night pt-8 text-[0.9375rem] leading-relaxed text-on-night-soft">
            Most income products place a data provider in the middle and ask you
            to trust it. Removing that middle is the entire reason this exists.
          </p>
        </Reveal>
      </Section>

      {/* Disclosure */}
      <Section>
        <Reveal>
          <SectionLabel>Disclosure</SectionLabel>
          <h2 className="display-lg mt-5 max-w-2xl text-ink">
            You see exactly what leaves.
          </h2>
        </Reveal>

        <div className="mt-14 grid gap-12 md:grid-cols-2 md:gap-16">
          <Reveal>
            <h3 className="eyebrow text-brand">Shared with the lender</h3>
            <div className="mt-6">
              <SharedFields fields={sharedFields} />
            </div>
          </Reveal>

          <Reveal order={1}>
            <h3 className="eyebrow text-ink-faint">Never included</h3>
            <div className="mt-6">
              <HiddenFields fields={hiddenFields} />
            </div>
          </Reveal>
        </div>

        <Reveal>
          <p className="mt-14 max-w-2xl text-sm leading-relaxed text-ink-faint">
            To be precise: the credential contains no exact amounts. The
            underlying transfers stay as public as they already were on their own
            chain — we do not claim otherwise.
          </p>
        </Reveal>
      </Section>

      {/* Audience doors */}
      <Section id="doors" tone="raised">
        <Reveal>
          <SectionLabel>Where you fit</SectionLabel>
        </Reveal>
        <div className="mt-12 grid gap-12 md:grid-cols-2 md:gap-10">
          <Reveal id="individuals">
            <AudienceDoor
              href="/connect"
              eyebrow="For individuals"
              title="I get paid in crypto"
              body="Turn the payments you already receive into something a lender will read, without handing over your full history."
            />
          </Reveal>
          <Reveal order={1} id="lenders">
            <AudienceDoor
              href="#"
              eyebrow="For lenders and platforms"
              title="I lend or underwrite"
              body="Set a policy once, send a link, and get a decision with the evidence behind it attached."
            />
          </Reveal>
        </div>
      </Section>

      {/* Limits */}
      <Section tone="night">
        <Reveal>
          <p className="eyebrow text-signal">Limits</p>
          <h2 className="display-lg mt-5 max-w-2xl text-on-night">
            What a credential does not prove.
          </h2>
        </Reveal>

        <dl className="mt-14 border-t border-rule-night">
          {limits.map((item, index) => (
            <Reveal
              key={item.label}
              order={index}
              className="grid gap-2 border-b border-rule-night py-6 md:grid-cols-[16rem_minmax(0,1fr)] md:gap-10"
            >
              <dt className="meta text-signal">{item.label}</dt>
              <dd className="text-[0.9375rem] leading-relaxed text-on-night-soft">
                {item.body}
              </dd>
            </Reveal>
          ))}
        </dl>

        <Reveal>
          <p className="mt-12 max-w-2xl text-[0.9375rem] leading-relaxed text-on-night-soft">
            Stating this plainly is deliberate. A verification product that
            oversells what it verifies is not worth verifying with.
          </p>
        </Reveal>
      </Section>
    </>
  );
}
