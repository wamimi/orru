import { ImageResponse } from "next/og";
import { MARK_PATH } from "@/components/brand/markPath";

export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default function OpengraphImage() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          background: "#F4F2EC",
          padding: "72px 80px",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 20 }}>
          <svg width="56" height="56" viewBox="0 0 48 48" fill="#1F4A2C">
            <path d={MARK_PATH} />
          </svg>
          <div
            style={{
              fontSize: 44,
              fontWeight: 700,
              letterSpacing: "-0.04em",
              color: "#1F4A2C",
            }}
          >
            orru
          </div>
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
          <div
            style={{
              fontSize: 82,
              fontWeight: 700,
              lineHeight: 1.02,
              letterSpacing: "-0.045em",
              color: "#12302B",
              maxWidth: 900,
            }}
          >
            Proof of income for people paid in crypto.
          </div>
          <div style={{ fontSize: 30, color: "#566159", maxWidth: 760 }}>
            Verified stablecoin earnings, shared as a band — never as an amount.
          </div>
        </div>

        <div
          style={{
            display: "flex",
            gap: 14,
            fontSize: 22,
            color: "#8B948E",
            letterSpacing: "0.14em",
            textTransform: "uppercase",
          }}
        >
          orru.xyz
        </div>
      </div>
    ),
    size,
  );
}
