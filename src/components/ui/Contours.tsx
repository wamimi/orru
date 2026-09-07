export function Contours({ className }: { className?: string }) {
  return (
    <svg
      className={`contour-drift pointer-events-none absolute ${className ?? ""}`}
      viewBox="0 0 800 700"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.1"
      aria-hidden="true"
    >
      <path d="M120 80c90 40 150 110 210 190s140 150 230 170c90 20 180-20 250-80" />
      <path d="M40 160c110 30 180 100 250 180s150 140 240 150c95 12 190-30 270-95" />
      <path d="M20 260c120 20 200 90 280 170s160 130 250 130c110 0 210-55 300-130" />
      <path d="M70 360c100 10 180 70 250 140s150 110 240 100c105-12 200-80 280-160" />
      <path d="M150 470c90 0 160 50 220 110s140 90 220 70c100-24 180-100 250-180" />
      <path d="M260 560c80-10 140 30 190 80s120 70 190 40" />
    </svg>
  );
}
