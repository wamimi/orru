import {
  Bank,
  Fingerprint,
  MagnifyingGlass,
  ShareNetwork,
} from "@phosphor-icons/react/dist/ssr";

export const marketingServices = [
  {
    number: "01",
    title: "Find income",
    tags: ["Payout account", "Stablecoins", "Pay cycles"],
    description:
      "Orru finds incoming stablecoin payments tied to the payout account you control. Search helps locate the pattern; it never decides what counts.",
    detail:
      "Candidate payments stay separate by employer and pay cycle, so unrelated transfers are never folded into one income story.",
    icon: MagnifyingGlass,
  },
  {
    number: "02",
    title: "Confirm history",
    tags: ["Ethereum", "Trusted payer", "Creditcoin"],
    description:
      "Each payment is checked against attested Ethereum history, then matched to a recognised employer before it can count.",
    detail:
      "The result is a chain-backed record of who paid, when they paid, and whether the sequence is complete.",
    icon: Fingerprint,
  },
  {
    number: "03",
    title: "Issue a statement",
    tags: ["Income range", "On your device", "Wallet-bound"],
    description:
      "Your device turns confirmed pay cycles into a signed statement containing an income range—never the individual amounts.",
    detail:
      "The statement is bound to the payout account, dated to the underlying history, and written to Creditcoin for anyone to check.",
    icon: Bank,
  },
  {
    number: "04",
    title: "Share and use",
    tags: ["Explicit consent", "Public check", "Credit"],
    description:
      "Send a compact statement to a lender, fintech, or platform. They see the range, recency, period count, and current status.",
    detail:
      "Checking needs no Orru account. Sharing remains a separate action, and a withdrawn statement is visibly withdrawn.",
    icon: ShareNetwork,
  },
] as const;

export const howItWorks = [
  {
    number: "01",
    title: "Connect your payout account",
    meta: "One free signature",
    description:
      "Connect the wallet where you receive stablecoin pay and sign a short message to show the address is yours. Nothing moves.",
  },
  {
    number: "02",
    title: "Review confirmed payments",
    meta: "Already checked",
    description:
      "Orru reads the result of background verification, keeps employers separate, and shows which consecutive pay cycles can count.",
  },
  {
    number: "03",
    title: "Issue and share your range",
    meta: "Built on your device",
    description:
      "Create a band-only statement, authorise it with your wallet, and share its short id. Anyone can check the status without seeing exact pay.",
  },
] as const;

export const faqItems = [
  {
    question: "What appears in an Orru statement?",
    answer:
      "An income range, the number of consecutive pay cycles, how recent the evidence is, the recognised employer, and whether the statement is valid or withdrawn.",
  },
  {
    question: "Does Orru publish my exact pay?",
    answer:
      "No. Exact pay never goes into the statement. For payments already public on Ethereum, the original transfer remains public on that chain; Orru does not claim otherwise.",
  },
  {
    question: "Which payments can count?",
    answer:
      "For this version, Orru confirms Ethereum payments or employer records anchored on Ethereum. The payer must be recognised, and the pay cycles must form a valid consecutive window.",
  },
  {
    question: "Does checking require a wallet or account?",
    answer:
      "No. Anyone with the short statement id or long 0x id can check its current status, range, and date without connecting a wallet.",
  },
  {
    question: "Can I withdraw a statement?",
    answer:
      "Yes. A withdrawn statement keeps its public record but is shown unmistakably as no longer active, so a lender cannot mistake it for a current one.",
  },
  {
    question: "Does a valid statement guarantee credit?",
    answer:
      "No. It does not establish affordability, legal eligibility, identity, future income, or guaranteed repayment. A lender makes its own decision.",
  },
] as const;
