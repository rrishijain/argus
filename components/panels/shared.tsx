"use client";

import { useEffect, useRef, useState } from "react";
import { fmtINR } from "@/lib/format";

// ---------------------------------------------------------------------------
// Primitives shared by every HUD panel — typographic heading, sparkline,
// count-up. No chrome, no boxes: the panels are text on the scrims.
// ---------------------------------------------------------------------------

export function SectionTitle({ title, tick, href, tickCls }: { title: string; tick?: string; href?: string; tickCls?: string }) {
  return (
    <div className="sec-title">
      {href ? (
        <a className="sec-link" href={href} target="_blank" rel="noreferrer">
          {title} ↗
        </a>
      ) : (
        <span>{title}</span>
      )}
      {tick && <span className={`tick ${tickCls ?? ""}`}>{tick}</span>}
    </div>
  );
}

/** Inline sparkline. `null` gaps are skipped; <2 points renders a flat rule. */
export function Sparkline({ points, className = "" }: { points: (number | null)[]; className?: string }) {
  const idx = points.map((v, i) => [v, i] as const).filter((p): p is readonly [number, number] => p[0] !== null);
  if (idx.length < 2) return <div className={`spark spark-flat ${className}`} />;
  const vals = idx.map((p) => p[0]);
  const min = Math.min(...vals);
  const max = Math.max(...vals);
  const range = max - min || 1;
  const W = 100;
  const H = 16;
  const n = points.length - 1 || 1;
  const path = idx
    .map(([v, i], k) => {
      const x = (i / n) * W;
      const y = H - 2 - ((v - min) / range) * (H - 4);
      return `${k === 0 ? "M" : "L"}${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(" ");
  const [lastV, lastI] = idx[idx.length - 1];
  const lastY = H - 2 - ((lastV - min) / range) * (H - 4);
  return (
    <svg className={`spark ${className}`} viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none">
      <path d={path} fill="none" stroke="currentColor" strokeWidth="1.2" vectorEffect="non-scaling-stroke" />
      <circle cx={(lastI / n) * W} cy={lastY} r="1.8" fill="currentColor" />
    </svg>
  );
}

/** Animated count-up. `format` defaults to Indian grouping. */
export function CountUp({ value, format = fmtINR }: { value: number; format?: (n: number) => string }) {
  const [display, setDisplay] = useState(0);
  const fromRef = useRef(0);
  useEffect(() => {
    const from = fromRef.current;
    if (from === value) {
      setDisplay(value);
      return;
    }
    const start = performance.now();
    const dur = 1400;
    let raf = 0;
    const step = (t: number) => {
      const p = Math.min((t - start) / dur, 1);
      const eased = 1 - Math.pow(1 - p, 4);
      setDisplay(from + (value - from) * eased);
      if (p < 1) raf = requestAnimationFrame(step);
      else fromRef.current = value;
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [value]);
  return <>{format(display)}</>;
}

/** Map a verdict colour to the CSS status class used across panels. */
export function verdictCls(v: string | undefined | null): string {
  return v === "green" ? "ok" : v === "amber" ? "warn" : v === "red" ? "bad" : "na";
}
