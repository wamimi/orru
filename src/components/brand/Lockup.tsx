import { Mark } from "./Mark";
import { Wordmark } from "./Wordmark";

type LockupProps = {
  height?: number;
  className?: string;
};

export function Lockup({ height = 24, className }: LockupProps) {
  return (
    <span
      className={`inline-flex items-center ${className ?? ""}`}
      style={{ gap: height * 0.42 }}
    >
      <Mark size={height * 1.05} />
      <Wordmark height={height} title="orru" />
    </span>
  );
}
