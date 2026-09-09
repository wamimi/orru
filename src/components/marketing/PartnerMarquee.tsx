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

function CreditcoinMark() {
  return (
    <svg viewBox="0 0 48 48" aria-hidden="true">
      <circle
        cx="24"
        cy="24"
        r="21"
        fill="none"
        stroke="currentColor"
        strokeWidth="3.5"
      />
      <path
        fill="currentColor"
        d="M28.8 14.2c-1.2-.7-2.7-1.1-4.5-1.1-5.4 0-9.2 3.5-9.2 8.9s3.8 8.9 9.2 8.9c1.8 0 3.3-.4 4.5-1.1v3.7c-1.4.6-3.1.9-5 .9-7.4 0-12.8-4.8-12.8-12.4S16.4 9.6 23.8 9.6c1.9 0 3.6.3 5 .9v3.7Z"
      />
      <circle cx="33.8" cy="24" r="2.6" fill="currentColor" />
    </svg>
  );
}

function NoirMark() {
  return (
    <svg viewBox="0 0 54 54" aria-hidden="true">
      <path
        fill="none"
        stroke="currentColor"
        strokeWidth="4"
        d="M7 44V10l20 34V10l20 34V10"
      />
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
      <div className="mkt-partner-logo">
        <CreditcoinMark />
        <span>creditcoin</span>
      </div>
      <div className="mkt-partner-logo mkt-partner-logo--word">
        <span>attestcoin</span>
      </div>
      <div className="mkt-partner-logo">
        <NoirMark />
        <span>NOIR</span>
      </div>
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
