import Link from "next/link";
import { Lockup } from "@/components/brand/Lockup";

export function SiteFooter() {
  return (
    <footer className="mkt-footer">
      <div className="mkt-container mkt-footer__top">
        <div className="mkt-footer__intro">
          <Link href="/" aria-label="Orru home">
            <Lockup height={27} />
          </Link>
          <p>
            Portable income statements for people paid in stablecoins. Confirmed
            from chain history, issued with consent, and useful anywhere.
          </p>
        </div>

        <nav className="mkt-footer__group" aria-label="Product">
          <p>Product</p>
          <ul>
            <li><Link href="#about">About</Link></li>
            <li><Link href="#services">Services</Link></li>
            <li><Link href="#how-it-works">How it works</Link></li>
            <li><Link href="#faq">FAQ</Link></li>
          </ul>
        </nav>

        <nav className="mkt-footer__group" aria-label="Actions">
          <p>Actions</p>
          <ul>
            <li><Link href="/connect">Launch app</Link></li>
            <li><Link href="/check">Check a statement</Link></li>
            <li><Link href="/waitlist">Join the waitlist</Link></li>
          </ul>
        </nav>

        <div className="mkt-footer__group">
          <p>Network</p>
          <ul>
            <li><span className="mkt-footer__status">Creditcoin testnet</span></li>
            <li><Link href="/check">Public checker</Link></li>
          </ul>
        </div>
      </div>

      <div className="mkt-container mkt-footer__bottom">
        <p>© {new Date().getFullYear()} Orru. All rights reserved.</p>
        <p>Built for portable, user-controlled credit history.</p>
      </div>
      <div className="mkt-footer__wordmark" aria-hidden="true">Orru</div>
    </footer>
  );
}
