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
      "Orru finds the stablecoin payments coming into your wallet. Search finds the pattern. It never decides what counts.",
    detail:
      "Payments stay grouped by employer and pay cycle. Unrelated transfers never mix in.",
    icon: MagnifyingGlass,
  },
  {
    number: "02",
    title: "Confirm history",
    tags: ["Attestcoin", "Trusted payer", "Creditcoin"],
    description:
      "Every payment is checked against Ethereum's own history. Attestcoin brings that history to Creditcoin. Only a recognised employer counts.",
    detail:
      "The result is a record of who paid, when, and whether the sequence is complete. No screenshots. No PDFs. No data feeds.",
    icon: Fingerprint,
  },
  {
    number: "03",
    title: "Issue a statement",
    tags: ["Income range", "Zero-knowledge proof", "On your device"],
    description:
      "Your device turns confirmed pay cycles into a signed statement. It holds an income range, never the amounts.",
    detail:
      "A zero-knowledge proof, built in your browser with Noir, shows the range is right without revealing a single payment. The statement lives on Creditcoin for anyone to check.",
    icon: Bank,
  },
  {
    number: "04",
    title: "Share and use",
    tags: ["Explicit consent", "Public check", "Credit"],
    description:
      "Send the statement to a lender, fintech, or platform. They see the range, how recent it is, how many pay cycles, and whether it is still valid.",
    detail:
      "Checking needs no Orru account. Sharing is a separate step. A withdrawn statement shows as withdrawn.",
    icon: ShareNetwork,
  },
] as const;

export const howItWorks = [
  {
    number: "01",
    title: "Connect your payout account",
    meta: "One free signature",
    description:
      "Connect the wallet where you get paid. Sign a short message to show it is yours. Nothing moves.",
  },
  {
    number: "02",
    title: "Review confirmed payments",
    meta: "Verified by Attestcoin",
    description:
      "Attestcoin brings each Ethereum payment to Creditcoin, where it is checked against the chain itself. Orru shows which pay cycles count.",
  },
  {
    number: "03",
    title: "Issue and share your range",
    meta: "Built on your device",
    description:
      "Your browser proves your pay falls in a range, without revealing the amounts. Sign it and share the short id. Anyone can check it.",
  },
] as const;

export const faqItems = [
  {
    question: "What appears in an Orru statement?",
    answer:
      "An income range, the number of consecutive pay cycles, how recent the evidence is, the recognised employer, and whether the statement is valid or withdrawn.",
  },
  {
    question: "How does Orru know a payment is real?",
    answer:
      "It does not take anyone's word for it. Attestcoin proves each payment against Ethereum's own history on Creditcoin. Only payments that pass, from a recognised employer, can go into a statement. No screenshots. No PDFs. No bank feeds.",
  },
  {
    question: "What is a zero-knowledge proof, in plain words?",
    answer:
      "A way to show something is true without showing the data behind it. Orru builds one in your browser. Your statement proves your pay falls in a range without listing a single payment.",
  },
  {
    question: "Does Orru publish my exact pay?",
    answer:
      "No. Exact pay never goes into the statement. If a payment was already public on Ethereum, it stays public there. Orru does not claim otherwise.",
  },
  {
    question: "Which payments can count?",
    answer:
      "Ethereum payments, or employer records anchored on Ethereum. The payer must be recognised. The pay cycles must form a consecutive window.",
  },
  {
    question: "Does checking require a wallet or account?",
    answer:
      "No. Anyone with the statement id can check its status, range, and date. No wallet. No account.",
  },
  {
    question: "Can I withdraw a statement?",
    answer:
      "Yes. The record stays public but is clearly marked as no longer active. A lender cannot mistake it for a current one.",
  },
  {
    question: "Does a valid statement guarantee credit?",
    answer:
      "No. It does not prove affordability, eligibility, identity, or future income. The lender decides.",
  },
  {
    question: "Can I try it without stablecoin income?",
    answer:
      "Yes. The demo faucet gives any wallet a testnet income history. Your wallet only signs. Orru pays the network costs. Confirmation usually takes 10 to 15 minutes.",
  },
] as const;
