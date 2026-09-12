import Image from "next/image";

function EthereumMark() {
  return (
    <svg viewBox="0 0 32 52" aria-hidden="true">
      <path fill="currentColor" opacity=".58" d="M16 0 0 27l16-7.3L32 27 16 0Z" />
      <path fill="currentColor" d="m16 19.7-16 7.3 16 9.5L32 27l-16-7.3Z" />
      <path fill="currentColor" opacity=".72" d="M0 30.1 16 52V39.6L0 30.1Z" />
      <path fill="currentColor" opacity=".9" d="M16 39.6V52l16-21.9-16 9.5Z" />
    </svg>
  );
}

function AttestcoinMark() {
  return (
    <svg viewBox="0 0 48 48" aria-hidden="true">
      <circle
        cx="24"
        cy="24"
        r="21.25"
        fill="none"
        stroke="currentColor"
        strokeWidth="2.35"
      />
      <path fill="currentColor" d="M14.2 35.8 22.6 11.6h4.4L18.6 35.8z" />
      <path fill="currentColor" d="M27 11.6h4.35l1.95 5.8-3.45 1.15z" />
      <path fill="currentColor" d="M31.15 24.9 33.9 33.2h-4.3l-1.7-5.05z" />
      <path fill="currentColor" d="M17.9 24.35 38.6 17.2l.95 2.75-20.7 7.15z" />
    </svg>
  );
}

function LogoGroup({ hidden = false }: { hidden?: boolean }) {
  return (
    <div className="mkt-marquee__group" aria-hidden={hidden || undefined}>
      <div className="mkt-partner-logo">
        <EthereumMark />
        <span>ethereum</span>
      </div>
      <Image
        className="mkt-partner-mark mkt-partner-mark--creditcoin"
        src="/brand/partners/creditcoin.svg"
        alt="Creditcoin"
        width={1321}
        height={250}
      />
      <div className="mkt-partner-logo">
        <AttestcoinMark />
        <span>attestcoin</span>
      </div>
      <Image
        className="mkt-partner-mark mkt-partner-mark--noir"
        src="/brand/partners/noir.png"
        alt="Noir"
        width={1800}
        height={700}
        sizes="6rem"
      />
    </div>
  );
}

export function PartnerMarquee() {
  return (
    <div className="mkt-marquee" aria-label="Built with Ethereum, Creditcoin, Attestcoin, and Noir">
      <div className="mkt-marquee__track">
        <LogoGroup />
        <LogoGroup hidden />
      </div>
    </div>
  );
}
