import { MARK_PATH } from "./markPath";

type MarkProps = {
  size?: number;
  className?: string;
  title?: string;
};

/** Filled calligraphic swirl, traced from the supplied brand reference. */
export function Mark({ size = 32, className, title }: MarkProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 48 48"
      fill="currentColor"
      className={className}
      role={title ? "img" : undefined}
      aria-label={title}
      aria-hidden={title ? undefined : true}
    >
      {title ? <title>{title}</title> : null}
      <path d={MARK_PATH} />
    </svg>
  );
}
