"use client";

import { useEffect, useRef } from "react";

type TerrainVariant = "hero" | "cta" | "card";

function ridge(x: number, z: number, time: number): number {
  const broad = Math.sin(x * 2.1 + z * 1.4 + time) * 0.22;
  const folded = Math.sin(x * 5.4 - z * 2.2 - time * 0.55) * 0.1;
  const fine = Math.cos(x * 10.7 + z * 4.3) * 0.035;
  const peakA = Math.exp(-Math.pow(x + 0.34 + Math.sin(z * 1.8) * 0.12, 2) * 7) * 0.55;
  const peakB = Math.exp(-Math.pow(x - 0.38 + Math.cos(z * 1.2) * 0.1, 2) * 12) * 0.38;
  return broad + folded + fine + peakA + peakB;
}

export function SignalTerrain({
  variant = "hero",
  className,
}: {
  variant?: TerrainVariant;
  className?: string;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const pointer = useRef({ x: 0, y: 0 });

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const context = canvas.getContext("2d");
    if (!context) return;

    const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
    let width = 0;
    let height = 0;
    let frame = 0;
    let visible = true;
    let last = 0;

    const resize = () => {
      const rect = canvas.getBoundingClientRect();
      const dpr = Math.min(window.devicePixelRatio || 1, 1.6);
      width = Math.max(1, rect.width);
      height = Math.max(1, rect.height);
      canvas.width = Math.round(width * dpr);
      canvas.height = Math.round(height * dpr);
      context.setTransform(dpr, 0, 0, dpr, 0, 0);
    };

    const draw = (now = 0) => {
      if (!width || !height) return;
      context.clearRect(0, 0, width, height);

      const motion = reduceMotion.matches ? 0 : now * 0.000045;
      const px = pointer.current.x * width * 0.018;
      const py = pointer.current.y * height * 0.012;
      const horizon =
        variant === "hero" ? height * 0.38 : variant === "cta" ? height * 0.2 : height * 0.32;
      const lineCount = variant === "card" ? 44 : 72;
      const samples = Math.max(90, Math.floor(width / 7));

      const glow = context.createRadialGradient(
        width * 0.5 + px,
        height * 0.58 + py,
        0,
        width * 0.5,
        height * 0.58,
        width * 0.7,
      );
      glow.addColorStop(0, "rgba(185, 211, 74, 0.16)");
      glow.addColorStop(0.42, "rgba(111, 144, 44, 0.08)");
      glow.addColorStop(1, "rgba(6, 6, 6, 0)");
      context.fillStyle = glow;
      context.fillRect(0, 0, width, height);

      for (let row = lineCount - 1; row >= 0; row -= 1) {
        const z = row / Math.max(1, lineCount - 1);
        const perspective = 0.14 + z * z * 0.94;
        const baseY = horizon + perspective * height * 0.66;
        const amplitude = height * (0.05 + perspective * 0.2);
        const alpha = 0.045 + z * 0.22;

        context.beginPath();
        for (let i = 0; i <= samples; i += 1) {
          const u = i / samples;
          const xNorm = u * 2 - 1;
          const spread = width * (0.22 + perspective * 0.82);
          const x = width / 2 + xNorm * spread + px * z;
          const elevation = ridge(xNorm * 1.25, z * 2.6, motion);
          const y = baseY - elevation * amplitude + py * z;
          if (i === 0) context.moveTo(x, y);
          else context.lineTo(x, y);
        }

        context.strokeStyle =
          row % 6 === 0
            ? `rgba(194, 213, 78, ${Math.min(0.48, alpha * 1.55)})`
            : `rgba(153, 181, 67, ${alpha})`;
        context.lineWidth = row % 6 === 0 ? 0.9 : 0.45;
        context.stroke();
      }

      const veil = context.createLinearGradient(0, 0, 0, height);
      veil.addColorStop(0, "rgba(6, 6, 6, 0.98)");
      veil.addColorStop(0.22, "rgba(6, 6, 6, 0.52)");
      veil.addColorStop(0.65, "rgba(6, 6, 6, 0.02)");
      veil.addColorStop(1, "rgba(6, 6, 6, 0.82)");
      context.fillStyle = veil;
      context.fillRect(0, 0, width, height);
    };

    const tick = (now: number) => {
      if (visible && (reduceMotion.matches || now - last > 32)) {
        draw(now);
        last = now;
      }
      if (!reduceMotion.matches) frame = requestAnimationFrame(tick);
    };

    const observer = new ResizeObserver(() => {
      resize();
      draw();
    });
    const visibility = new IntersectionObserver(([entry]) => {
      visible = Boolean(entry?.isIntersecting);
    });
    const onPointerMove = (event: PointerEvent) => {
      const rect = canvas.getBoundingClientRect();
      pointer.current = {
        x: (event.clientX - rect.left) / rect.width - 0.5,
        y: (event.clientY - rect.top) / rect.height - 0.5,
      };
    };

    resize();
    draw();
    observer.observe(canvas);
    visibility.observe(canvas);
    canvas.addEventListener("pointermove", onPointerMove, { passive: true });
    if (!reduceMotion.matches) frame = requestAnimationFrame(tick);

    return () => {
      cancelAnimationFrame(frame);
      observer.disconnect();
      visibility.disconnect();
      canvas.removeEventListener("pointermove", onPointerMove);
    };
  }, [variant]);

  return (
    <canvas
      ref={canvasRef}
      className={`mkt-terrain ${className ?? ""}`}
      aria-hidden="true"
    />
  );
}
