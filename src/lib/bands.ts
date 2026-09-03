import { usdcDecimals } from "@/lib/chain";

export type IncomeBand = {
  id: number;
  label: string;
};

const BANDS: { id: number; minExclusiveOfMax: number; label: string }[] = [
  { id: 0, minExclusiveOfMax: 1_000, label: "$0 – $1,000" },
  { id: 1, minExclusiveOfMax: 2_000, label: "$1,000 – $2,000" },
  { id: 2, minExclusiveOfMax: 3_000, label: "$2,000 – $3,000" },
  { id: 3, minExclusiveOfMax: 5_000, label: "$3,000 – $5,000" },
  { id: 4, minExclusiveOfMax: Number.POSITIVE_INFINITY, label: "$5,000+" },
];

const USDC_SCALE = 10 ** usdcDecimals;

/** Half-open monthly USDC bands: [0,1k) [1k,2k) [2k,3k) [3k,5k) [5k, inf). */
export function bandFromMonthlyUsdc(amountBaseUnits: bigint): IncomeBand {
  const dollars = Number(amountBaseUnits) / USDC_SCALE;
  const band = BANDS.find((entry) => dollars < entry.minExclusiveOfMax) ?? BANDS[4];
  return { id: band.id, label: band.label };
}

export function monthlyFromPeriodAmount(
  amountBaseUnits: bigint,
  periodSeconds: bigint,
): bigint {
  if (periodSeconds <= BigInt(0)) return BigInt(0);
  const monthSeconds = BigInt(30) * BigInt(24) * BigInt(3600);
  return (amountBaseUnits * monthSeconds) / periodSeconds;
}
