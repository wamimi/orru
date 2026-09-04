type Level = "info" | "warn" | "error" | "step"

const PREFIX: Record<Level, string> = {
  step: "==>",
  info: "   ",
  warn: " ! ",
  error: " x ",
}

function emit(level: Level, message: string, fields?: Record<string, unknown>): void {
  const stamp = new Date().toISOString().slice(11, 19)
  const tail = fields
    ? " " +
      Object.entries(fields)
        .map(([k, v]) => `${k}=${format(v)}`)
        .join(" ")
    : ""
  const line = `${stamp} ${PREFIX[level]} ${message}${tail}`
  if (level === "error" || level === "warn") console.error(line)
  else console.log(line)
}

function format(value: unknown): string {
  if (typeof value === "bigint") return value.toString()
  if (typeof value === "string") return value
  return JSON.stringify(value)
}

export const log = {
  step: (m: string, f?: Record<string, unknown>) => emit("step", m, f),
  info: (m: string, f?: Record<string, unknown>) => emit("info", m, f),
  warn: (m: string, f?: Record<string, unknown>) => emit("warn", m, f),
  error: (m: string, f?: Record<string, unknown>) => emit("error", m, f),
}

export function short(hex: string): string {
  return hex.length > 14 ? `${hex.slice(0, 10)}..${hex.slice(-6)}` : hex
}
