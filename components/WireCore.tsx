"use client";

import { useEffect, useRef } from "react";
import type { CoreProps } from "./coreTypes";

// ---------------------------------------------------------------------------
// WireCore — the DAYBREAK centerpiece: a woven bundle of colored wires that
// converge at two ports and fan out through the middle, endlessly flowing.
// Canvas 2D, no WebGL. The wires react to the room:
//   idle      — slow, graceful weave
//   working   — fast, tight weave
//   listening — calm, drawn-in
//   speaking  — amplitude rides the REAL speech envelope (getLevel)
//   error     — colors drain, flow nearly stops
// Celebrations flare the whole bundle; a record showers confetti particles.
// ---------------------------------------------------------------------------

const PALETTE = [
  "#ff6b5e", // coral
  "#ffaf1f", // sun
  "#f45b9f", // pink
  "#7c5cff", // violet
  "#2e9bef", // sky
  "#12b886", // mint
  "#ff8f3e", // tangerine
  "#a78bfa", // lavender
];
const ERROR_PALETTE = [
  "#e57373", "#d9a0a0", "#cbb8c9", "#b9b3c9", "#d0c4d8", "#c9a9a9", "#e0b1a6", "#c4b6d6",
];

interface Particle {
  x: number; y: number; vx: number; vy: number;
  life: number; ttl: number; size: number; color: string;
}

// per-wire harmonic recipe — fixed seeds so the weave is stable across mounts
function harmonics(k: number) {
  return [0, 1, 2].map((h) => ({
    amp: 0.5 / (h + 1) + 0.22 * (((k * 7 + h * 5) % 8) / 8),
    freq: 1.4 + h * 1.1 + ((k * 13 + h * 3) % 5) * 0.23,
    speed: (0.35 + 0.27 * h + ((k * 11 + h) % 4) * 0.1) * (h % 2 === 0 ? 1 : -1),
    phase: (k * 2.39996 + h * 1.7) % (Math.PI * 2), // golden-angle spread
  }));
}

export default function WireCore({ mode = "idle", getLevel, celebrate }: CoreProps) {
  const wrapRef = useRef<HTMLDivElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const modeRef = useRef(mode);
  const levelRef = useRef(getLevel);
  const celebrateRef = useRef(celebrate ?? null);
  modeRef.current = mode;
  levelRef.current = getLevel;
  celebrateRef.current = celebrate ?? null;

  useEffect(() => {
    const wrap = wrapRef.current;
    const canvas = canvasRef.current;
    if (!wrap || !canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    let W = 0;
    let H = 0;
    let dpr = 1;
    const fit = () => {
      const rect = wrap.getBoundingClientRect();
      dpr = Math.min(window.devicePixelRatio || 1, 2);
      W = Math.max(1, Math.round(rect.width * dpr));
      H = Math.max(1, Math.round(rect.height * dpr));
      canvas.width = W;
      canvas.height = H;
    };
    fit();
    const ro = new ResizeObserver(fit);
    ro.observe(wrap);

    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");

    const WIRES = PALETTE.map((_, k) => harmonics(k));
    const ease = (cur: number, target: number, tau: number, dt: number) =>
      cur + (target - cur) * (1 - Math.exp(-dt / tau));

    let t = 0;
    let last = performance.now();
    let energy = 1; // eased flow speed
    let amp = 1; // eased amplitude multiplier
    let flare = 0; // celebration impulse
    let lastSeq = celebrateRef.current?.seq ?? 0;
    let particles: Particle[] = [];
    let raf = 0;

    const spawnConfetti = (n: number) => {
      for (let i = 0; i < n; i++) {
        const a = Math.random() * Math.PI * 2;
        const sp = (2 + Math.random() * 4) * dpr;
        particles.push({
          x: W / 2,
          y: H / 2,
          vx: Math.cos(a) * sp,
          vy: Math.sin(a) * sp - 1.5 * dpr,
          life: 0,
          ttl: 1 + Math.random() * 0.8,
          size: (2.5 + Math.random() * 3) * dpr,
          color: PALETTE[i % PALETTE.length],
        });
      }
    };

    const frame = (now: number) => {
      raf = requestAnimationFrame(frame);
      const dt = Math.min((now - last) / 1000, 0.1);
      last = now;

      const m = modeRef.current;
      const level = m === "speaking" ? (levelRef.current?.() ?? 0.5) : 0;

      // celebration impulse — one-shot per seq; minor never reaches the core
      const cs = celebrateRef.current;
      if (cs && cs.seq !== lastSeq) {
        lastSeq = cs.seq;
        if (cs.tier !== "minor") {
          flare = 1;
          if (cs.tier === "record") spawnConfetti(44);
        }
      }
      flare *= Math.exp(-dt / (particles.length ? 1.1 : 0.6));

      const reduced = mq.matches;
      const targetEnergy =
        m === "error" ? 0.1 : m === "working" ? 2.3 : m === "listening" ? 0.7 : m === "speaking" ? 1.25 : 1;
      const targetAmp =
        m === "speaking" ? 0.55 + 1.15 * level : m === "listening" ? 0.8 : m === "error" ? 0.6 : 1;
      energy = ease(energy, reduced ? 0 : targetEnergy, 0.5, dt);
      amp = ease(amp, targetAmp, m === "speaking" ? 0.06 : 0.4, dt);
      t += dt * energy;

      ctx.clearRect(0, 0, W, H);

      const pal = m === "error" ? ERROR_PALETTE : PALETTE;
      const cy = H / 2;
      const pad = W * 0.06;
      const span = W - pad * 2;
      const R = H * 0.2 * amp;
      const STEPS = 90;

      // two passes: soft wide halo (colors visibly mix where wires cross),
      // then the thin bright core of each wire
      for (let pass = 0; pass < 2; pass++) {
        for (let k = 0; k < WIRES.length; k++) {
          const hs = WIRES[k];
          const spread = (k - (WIRES.length - 1) / 2) * H * 0.016;
          ctx.beginPath();
          for (let s = 0; s <= STEPS; s++) {
            const u = s / STEPS;
            const x = pad + u * span;
            const env = Math.pow(Math.sin(Math.PI * u), 0.85); // pinch at ports
            let y = cy + spread * env;
            for (const h of hs) {
              y += env * R * h.amp * Math.sin(u * Math.PI * 2 * h.freq + t * h.speed * 2.2 + h.phase);
            }
            if (s === 0) ctx.moveTo(x, y);
            else ctx.lineTo(x, y);
          }
          ctx.strokeStyle = pal[k];
          ctx.lineCap = "round";
          ctx.lineJoin = "round";
          if (pass === 0) {
            ctx.globalAlpha = 0.16 + 0.3 * flare;
            ctx.lineWidth = (9 + 7 * flare) * dpr;
          } else {
            ctx.globalAlpha = 0.9;
            ctx.lineWidth = 2.4 * dpr;
          }
          ctx.stroke();
        }
      }

      // glowing ports where the bundle converges
      ctx.globalAlpha = 0.9;
      for (const px of [pad, W - pad]) {
        const g = ctx.createRadialGradient(px, cy, 0, px, cy, 14 * dpr);
        g.addColorStop(0, "rgba(255,255,255,0.95)");
        g.addColorStop(1, "rgba(255,175,31,0)");
        ctx.fillStyle = g;
        ctx.beginPath();
        ctx.arc(px, cy, 14 * dpr, 0, Math.PI * 2);
        ctx.fill();
      }

      // record confetti
      if (particles.length) {
        for (const p of particles) {
          p.life += dt;
          p.x += p.vx * dt * 60;
          p.y += p.vy * dt * 60;
          p.vy += 2.2 * dpr * dt;
          const a = Math.max(0, 1 - p.life / p.ttl);
          if (a <= 0) continue;
          ctx.globalAlpha = a;
          ctx.fillStyle = p.color;
          ctx.beginPath();
          ctx.arc(p.x, p.y, p.size * (0.6 + 0.4 * a), 0, Math.PI * 2);
          ctx.fill();
        }
        particles = particles.filter((p) => p.life < p.ttl);
      }
      ctx.globalAlpha = 1;
    };
    raf = requestAnimationFrame(frame);

    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
    };
  }, []);

  return (
    <div ref={wrapRef} className={`wire-core mode-${mode}`} aria-hidden="true">
      <div className="wire-glow" />
      <canvas ref={canvasRef} style={{ position: "absolute", inset: 0, width: "100%", height: "100%" }} />
    </div>
  );
}
