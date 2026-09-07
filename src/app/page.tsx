import { Lockup } from "@/components/brand/Lockup";
import { WaitlistForm } from "@/components/WaitlistForm";

function ContourField() {
  return (
    <svg
      className="contour-drift pointer-events-none absolute inset-0 m-auto h-[85%] w-[90%] max-w-5xl opacity-[0.18]"
      viewBox="0 0 800 700"
      fill="none"
      aria-hidden="true"
    >
      <path
        d="M120 80c90 40 150 110 210 190s140 150 230 170c90 20 180-20 250-80"
        stroke="currentColor"
        strokeWidth="1.2"
        className="text-mist"
      />
      <path
        d="M40 160c110 30 180 100 250 180s150 140 240 150c95 12 190-30 270-95"
        stroke="currentColor"
        strokeWidth="1.2"
        className="text-mist"
      />
      <path
        d="M20 260c120 20 200 90 280 170s160 130 250 130c110 0 210-55 300-130"
        stroke="currentColor"
        strokeWidth="1.2"
        className="text-mist"
      />
      <path
        d="M70 360c100 10 180 70 250 140s150 110 240 100c105-12 200-80 280-160"
        stroke="currentColor"
        strokeWidth="1.2"
        className="text-mist"
      />
      <path
        d="M150 470c90 0 160 50 220 110s140 90 220 70c100-24 180-100 250-180"
        stroke="currentColor"
        strokeWidth="1.2"
        className="text-mist"
      />
      <path
        d="M260 560c80-10 140 30 190 80s120 70 190 40"
        stroke="currentColor"
        strokeWidth="1.2"
        className="text-mist"
      />
    </svg>
  );
}

export default function Home() {
  return (
    <main className="waitlist-shell hero-wash relative isolate min-h-svh overflow-hidden text-paper">
      <ContourField />
      <div className="relative z-10 mx-auto flex min-h-svh w-full max-w-3xl flex-col items-center justify-center px-6 py-16 text-center">
        <div className="animate-rise text-paper">
          <Lockup height={80} />
        </div>

        <h1 className="animate-rise-delay-1 mt-8 max-w-2xl font-display text-[clamp(1.75rem,4.5vw,2.75rem)] font-bold leading-[1.1] tracking-[-0.03em]">
          Use your on-chain income
          <span className="block text-fog">as a credential.</span>
        </h1>

        <p className="animate-rise-delay-2 mt-5 max-w-lg text-base leading-relaxed text-mist md:text-lg">
          Orru turns stablecoin payments into a private income credential. Share
          a band with a fintech, a neobank, or anywhere proof of income is
          required.
        </p>

        <div className="animate-rise-delay-3 mt-10 w-full max-w-xl">
          <WaitlistForm source="hero" />
        </div>
      </div>
    </main>
  );
}
