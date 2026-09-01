type WordmarkProps = {
  height?: number;
  className?: string;
  title?: string;
};

/**
 * Monoline geometric logotype: one circle, two arches, one bowl.
 * Paired with the filled mark; not a second drawing of it.
 */
export function Wordmark({ height = 20, className, title }: WordmarkProps) {
  const width = (height * 121) / 40;

  return (
    <svg
      width={width}
      height={height}
      viewBox="0 0 121 40"
      fill="none"
      stroke="currentColor"
      strokeWidth={5}
      strokeLinecap="round"
      className={className}
      role="img"
      aria-label={title ?? "orru"}
    >
      <title>{title ?? "orru"}</title>
      {/* o */}
      <circle cx="20" cy="20" r="11" />
      {/* r */}
      <path d="M45 9v22" />
      <path d="M45 18a9 9 0 0 1 9-9" />
      {/* r */}
      <path d="M70 9v22" />
      <path d="M70 18a9 9 0 0 1 9-9" />
      {/* u */}
      <path d="M94 9v13a9 9 0 0 0 18 0V9" />
      <path d="M112 22v9" />
    </svg>
  );
}
