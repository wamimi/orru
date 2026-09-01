import { ImageResponse } from "next/og";
import { MARK_PATH } from "@/components/brand/markPath";

export const size = { width: 180, height: 180 };
export const contentType = "image/png";

export default function AppleIcon() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: "#1F4A2C",
        }}
      >
        <svg width="120" height="120" viewBox="0 0 48 48" fill="#F4F2EC">
          <path d={MARK_PATH} />
        </svg>
      </div>
    ),
    size,
  );
}
