"use client";

// ---------------------------------------------------------------------------
// IRIS CORE — the ARGUS centerpiece.
//
// Argus Panoptes was the hundred-eyed watcher, so the centerpiece is an eye:
// a mechanical aperture of twelve overlapping blades inside a knurled bezel.
// It holds still and breathes when idle, opens and locks on when listening,
// mouths the speech envelope when talking, ratchets in discrete steps while
// working, and slams shut when something breaks.
//
// One fullscreen quad, one fragment shader, no three.js. An iris is a radial
// field — blade edges, pupil, ripple and glow are all closed-form functions of
// (r, theta), so the whole thing is cheaper than the bloom pass alone would be.
//
// It also owns the HUD's accent: --accent-h and --accent-s are written onto
// documentElement, and ~20 rules in globals.css derive from them. That is how
// the chrome cools when listening and floods red on error.
// ---------------------------------------------------------------------------

import { useEffect, useRef } from "react";
import { BG_MODES, type BgMode, type CoreMode, type CoreProps } from "./coreTypes";

export { BG_MODES };
export type { BgMode, CoreMode };

const TAU = Math.PI * 2;

const VERT = `#version 300 es
in vec2 a_pos;
void main() { gl_Position = vec4(a_pos, 0.0, 1.0); }`;

const FRAG = `#version 300 es
precision highp float;
out vec4 outColor;

uniform vec2  u_res;
uniform vec2  u_center;
uniform float u_time;
uniform float u_hue;      // 0..1
uniform float u_sat;      // 0..1
uniform float u_rotA, u_rotB, u_rotC;
uniform float u_pupil, u_curl, u_bow;
uniform float u_level, u_glow, u_grain;
uniform float u_ripAmp, u_ripFreq, u_ripPhase;
uniform float u_shutter, u_flash, u_scan, u_light, u_aberr;
uniform float u_reduced, u_gridScroll;
uniform int   u_bg;

const float PI  = 3.14159265;
const float TAU = 6.28318531;
const float R_OUT = 0.300;
const float R_BEZ = 0.324;

float hash21(vec2 p) {
  p = fract(p * vec2(123.34, 456.21));
  p += dot(p, p + 45.32);
  return fract(p.x * p.y);
}

vec3 hsl2rgb(vec3 c) {
  vec3 k = mod(vec3(0.0, 8.0, 4.0) + c.x * 12.0, 12.0);
  float a = c.y * min(c.z, 1.0 - c.z);
  return c.z - a * clamp(min(k - 3.0, 9.0 - k), -1.0, 1.0);
}

float vnoise(vec2 p) {
  vec2 i = floor(p), f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  float a = hash21(i), b = hash21(i + vec2(1.0, 0.0));
  float c = hash21(i + vec2(0.0, 1.0)), d = hash21(i + vec2(1.0, 1.0));
  return mix(mix(a, b, u.x), mix(c, d, u.x), u.y);
}

float fbm(vec2 p) {
  float v = 0.0, amp = 0.5;
  for (int i = 0; i < 4; i++) { v += amp * vnoise(p); p *= 2.07; amp *= 0.5; }
  return v;
}

// An N-gon aperture is the intersection of N half-planes; the max over all N
// is reached at the normal nearest in direction to p, so the angular fold
// evaluates it exactly — no loop over blades.
//   x = signed pseudo-distance to the edge (>0 = blade metal)
//   y = along-edge coordinate   z = per-blade hash   w = blade axis angle
vec4 bladeField(vec2 p, float n, float rot, float hole, float curl, float bow) {
  float s = TAU / n;
  float r = length(p);
  float a = atan(p.y, p.x) - rot;
  float k = floor(a / s + 0.5);
  float af = a - k * s;
  float edge = hole + curl * (r * sin(af)) + bow * (r * sin(af)) * (r * sin(af));
  return vec4(r * cos(af) - edge, r * sin(af), fract(sin(k * 12.9898) * 43758.5453), rot + k * s);
}

// Kaliset fold. Twelve iterations of an inversion turn a smooth disc into
// dense filigree — hundreds of cells, no geometry, fixed cost.
float filigree(vec2 z, float warp, float bright) {
  float acc = 0.0, mag = 1.0;
  for (int i = 0; i < 12; i++) {
    z = abs(z) / max(dot(z, z), 0.06) - vec2(0.92 + 0.05 * warp, 0.58 + 0.06 * warp);
    acc += exp(-length(z) * 2.4) * mag;
    mag *= 0.87;
  }
  return acc * bright;
}

void main() {
  float mn = min(u_res.x, u_res.y);
  vec2 p = (gl_FragCoord.xy - u_center) / mn;
  float r = length(p);
  float ang = atan(p.y, p.x);
  float t = u_time;

  // The core carries more colour than the chrome does — the wall is meant to
  // be quiet, the eye is not.
  float cs = min(1.0, u_sat * 2.6 + 0.30);
  vec3 DEEP  = hsl2rgb(vec3(u_hue, cs * 0.9, 0.22));
  vec3 METAL = hsl2rgb(vec3(u_hue, cs * 0.6, 0.62));
  vec3 HOT   = hsl2rgb(vec3(u_hue, cs * 0.8, 0.86));
  vec3 SIGNAL = hsl2rgb(vec3(0.2, 0.85, 0.62));
  vec3 col = vec3(0.0);

  float lvl = u_level;
  float breathe = 1.0 + 0.06 * sin(t * 0.7);

  // --- nebula: domain-warped fbm, the soft mass everything else sits in ----
  vec2 wq = p * 2.6;
  float w1 = fbm(wq * 1.7 + vec2(t * 0.045, -t * 0.03));
  float w2 = fbm(wq * 1.7 + vec2(-t * 0.035, t * 0.05) + 3.7);
  float neb = fbm(wq + vec2(w1, w2) * 1.6);
  float shell = exp(-pow(max(r - 0.10, 0.0) * 5.4, 1.6));
  col += DEEP * pow(neb, 1.6) * shell * (0.55 + 0.8 * lvl) * breathe;
  col += HOT * pow(neb, 4.0) * shell * (0.16 + 0.45 * lvl);

  // --- filigree: folded into twelve sectors so it reads as an iris ---------
  float sect = TAU / 12.0;
  float af = mod(ang - u_rotB + 0.5 * sect, sect) - 0.5 * sect;
  vec2 q = vec2(cos(af), sin(af)) * r;
  float fil = filigree(q * 3.4 + vec2(0.0, sin(t * 0.11) * 0.06), sin(t * 0.23) + lvl * 1.2, 1.0);
  float annulus = smoothstep(u_pupil * 0.92, u_pupil * 1.5, r)
                * (1.0 - smoothstep(R_OUT * 0.82, R_OUT + 0.01, r));
  float filRip = 1.0 + u_ripAmp * sin(r * u_ripFreq - u_ripPhase);
  float filC = max(fil - 0.55, 0.0);
  col += METAL * filC * annulus * 0.42 * filRip * (1.0 + 0.9 * lvl);
  col += HOT * pow(filC, 1.8) * annulus * 0.30 * (1.0 + 1.8 * lvl);

  // --- spark field: hundreds of small lights on polar cells ----------------
  // Argus Panoptes had a hundred eyes; this is them.
  vec2 cell = vec2((ang - u_rotC) * (44.0 / TAU), r * 62.0);
  vec2 ci = floor(cell), cf = fract(cell) - 0.5;
  float h = hash21(ci);
  float tw = 0.35 + 0.65 * sin(t * (1.2 + h * 5.0) + h * 40.0);
  float spark = exp(-dot(cf, cf) * 46.0) * step(0.66, h) * tw;
  float sparkMask = annulus * 0.85 + exp(-max(r - R_OUT, 0.0) * 5.0) * 0.25;
  col += HOT * spark * sparkMask * (0.5 + 1.0 * lvl);
  // a scarce few burn acid — the SIGNAL colour, rationed
  col += SIGNAL * spark * sparkMask * step(0.965, h) * 1.5;

  // --- filaments: energy thrown outward from the pupil ---------------------
  float fs = 0.5 + 0.5 * sin(ang * 60.0 + fbm(vec2(ang * 6.0, t * 0.25)) * 9.0 - t * 0.4);
  float fila = pow(fs, 6.0) * annulus * (0.35 + 0.9 * lvl);
  col += HOT * fila * 0.16;
  col += SIGNAL * fila * 0.05;

  // --- aperture: the skeleton under all of it ------------------------------
  vec4 bf = bladeField(p, 12.0, u_rotB, u_pupil, u_curl, u_bow);
  float disc = 1.0 - smoothstep(R_OUT - 0.01, R_OUT + 0.02, r);
  float dEdge = abs(bf.x);
  float nearPupil = exp(-max(r - u_pupil, 0.0) * 4.5);
  float rimR = exp(-abs(dEdge - u_aberr * 0.0018) * 70.0);
  float rimG = exp(-dEdge * 70.0);
  float rimB = exp(-abs(dEdge + u_aberr * 0.0018) * 70.0);
  float rimGain = (0.85 + 1.1 * lvl + u_shutter * 1.3 + u_flash * 1.6) * u_glow;
  col += HOT * vec3(rimR, rimG, rimB) * disc * (0.25 + 0.75 * nearPupil) * rimGain;
  col += METAL * exp(-dEdge * 9.0) * disc * 0.16 * u_glow;

  // blade plates darken the field they sit on, which is what makes the
  // aperture legible through the storm instead of pasted on top
  float plate = smoothstep(-0.004, 0.004, bf.x) * disc;
  col *= 1.0 - 0.20 * plate * smoothstep(u_pupil, R_OUT, r);

  // --- pupil: the dark centre, with a hot ring at its edge ------------------
  float pupilMask = 1.0 - smoothstep(u_pupil * 0.35, u_pupil * 0.92, r);
  col *= 1.0 - 0.78 * pupilMask;
  col += HOT * exp(-abs(r - u_pupil) * 130.0) * (1.1 + 1.4 * lvl) * u_glow;
  col += DEEP * pupilMask * (0.05 + 0.05 * sin(ang * 90.0 + u_rotC * 6.0));

  // --- bezel: knurled ring, carries the listening sweep --------------------
  float bez = smoothstep(R_OUT, R_OUT + 0.004, r) * (1.0 - smoothstep(R_BEZ - 0.004, R_BEZ, r));
  float teeth = 0.5 + 0.5 * sin((ang - u_rotA) * 24.0);
  col += METAL * bez * (0.06 + 0.16 * pow(teeth, 2.0));
  float sd = abs(mod(ang - u_scan + PI, TAU) - PI);
  col += HOT * bez * exp(-sd * sd * 40.0) * u_glow * 0.7 * step(0.001, u_scan);

  // --- outer atmosphere ----------------------------------------------------
  col += DEEP * exp(-max(r - R_BEZ, 0.0) * 5.0) * smoothstep(R_OUT, R_BEZ, r) * 0.5 * u_glow;

  if (u_bg == 2) {
    float y = 0.30 - p.y;
    if (y > 0.0) {
      vec2 g = vec2(p.x / y, 1.0 / y) * 1.6 + vec2(0.0, u_gridScroll);
      vec2 gw = fwidth(g);
      vec2 l = smoothstep(gw * 1.5, vec2(0.0), abs(fract(g) - 0.5) - 0.5 + gw);
      col += METAL * max(l.x, l.y) * exp(-1.0 / (y * 6.0)) * 0.11;
    }
  } else if (u_bg == 3) {
    float far = fbm(p * 1.9 + vec2(t * 0.01, -t * 0.008));
    col += DEEP * smoothstep(0.5, 0.95, far) * 0.3 * smoothstep(R_OUT, 1.0, r);
  }

  // --- finish --------------------------------------------------------------
  float gt = floor(t * 12.0 * (1.0 - u_reduced)) * 17.3;
  col += (hash21(gl_FragCoord.xy + gt) - 0.5) * u_grain;
  col *= 1.0 - 0.24 * smoothstep(0.36, 1.05, r);
  col = col / (1.0 + col * 0.28);          // gentle shoulder — keep the blacks black
  outColor = vec4(max(col, 0.0), 1.0);
}`;

interface ModeSpec {
  pupil: number;
  wA: number;
  wB: number;
  wC: number;
  curlBase: number;
  glow: number;
  ripAmp: number;
  ripFreq: number;
  ripRate: number;
  grain: number;
  aberr: number;
  hue: number;
  sat: number;
  stiff: number;
  damp: number;
}

// Hue 210 / saturation 0.16 is the resting palette — it matches --accent-h and
// --accent-s in globals.css exactly, so the core and the chrome are literally
// the same colour. Offsets stay small; only error is allowed to be loud.
const MODE: Record<CoreMode, ModeSpec> = {
  idle:      { pupil: 0.115, wA: 0.012, wB: -0.020, wC: 0.050, curlBase: 0.30, glow: 1.0,  ripAmp: 0,    ripFreq: 26, ripRate: 0,    grain: 0.035, aberr: 0,   hue: 210, sat: 0.16, stiff: 40,  damp: 9 },
  listening: { pupil: 0.132, wA: 0.030, wB: -0.008, wC: 0.070, curlBase: 0.28, glow: 1.05, ripAmp: 0,    ripFreq: 26, ripRate: 0,    grain: 0.035, aberr: 0,   hue: 222, sat: 0.24, stiff: 70,  damp: 11 },
  speaking:  { pupil: 0.100, wA: 0.020, wB: -0.022, wC: 0.060, curlBase: 0.30, glow: 1.15, ripAmp: 0.28, ripFreq: 26, ripRate: 5.5,  grain: 0.035, aberr: 0,   hue: 200, sat: 0.22, stiff: 110, damp: 12 },
  working:   { pupil: 0.095, wA: 0.250, wB: -0.020, wC: -0.300, curlBase: 0.34, glow: 1.10, ripAmp: 0,   ripFreq: 26, ripRate: 0,    grain: 0.05,  aberr: 0,   hue: 210, sat: 0.14, stiff: 180, damp: 13 },
  error:     { pupil: 0.012, wA: 0.004, wB: 0.0,   wC: 0.010, curlBase: 0.55, glow: 1.0,  ripAmp: 0.15, ripFreq: 26, ripRate: -4.0, grain: 0.05,  aberr: 0.5, hue: 12,  sat: 0.62, stiff: 300, damp: 14 },
};

const PUPIL_OPEN = 0.18;

/** demo fallback when nothing is actually playing (key 4 with no audio) */
function fakeLevel(t: number): number {
  const s = Math.sin(t * 7.3) * 0.5 + Math.sin(t * 11.7) * 0.3 + Math.sin(t * 3.1) * 0.2;
  return Math.min(1, Math.max(0, 0.45 + s * 0.4));
}

export default function IrisCore({ mode = "idle", bgMode = "depth", getLevel }: CoreProps) {
  const wrapRef = useRef<HTMLDivElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const modeRef = useRef<CoreMode>(mode);
  const bgRef = useRef<BgMode>(bgMode);
  const levelRef = useRef<typeof getLevel>(getLevel);
  modeRef.current = mode;
  bgRef.current = bgMode;
  levelRef.current = getLevel;

  useEffect(() => {
    const wrap = wrapRef.current;
    const canvas = canvasRef.current;
    if (!wrap || !canvas) return;

    const gl = canvas.getContext("webgl2", { antialias: false, alpha: false, powerPreference: "high-performance" });
    if (!gl) return;

    const compile = (type: number, src: string) => {
      const sh = gl.createShader(type)!;
      gl.shaderSource(sh, src);
      gl.compileShader(sh);
      if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) {
        console.error("IrisCore shader:", gl.getShaderInfoLog(sh));
        gl.deleteShader(sh);
        return null;
      }
      return sh;
    };

    const vs = compile(gl.VERTEX_SHADER, VERT);
    const fs = compile(gl.FRAGMENT_SHADER, FRAG);
    if (!vs || !fs) return;
    const prog = gl.createProgram()!;
    gl.attachShader(prog, vs);
    gl.attachShader(prog, fs);
    gl.bindAttribLocation(prog, 0, "a_pos");
    gl.linkProgram(prog);
    if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) {
      console.error("IrisCore link:", gl.getProgramInfoLog(prog));
      return;
    }
    gl.useProgram(prog);

    const buf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);

    const U: Record<string, WebGLUniformLocation | null> = {};
    for (const n of [
      "u_res", "u_center", "u_time", "u_hue", "u_sat", "u_rotA", "u_rotB", "u_rotC",
      "u_pupil", "u_curl", "u_bow", "u_level", "u_glow", "u_grain", "u_ripAmp",
      "u_ripFreq", "u_ripPhase", "u_shutter", "u_flash", "u_scan", "u_light",
      "u_aberr", "u_reduced", "u_gridScroll", "u_bg",
    ]) {
      U[n] = gl.getUniformLocation(prog, n);
    }

    // --- eased state (all in closure; props arrive through refs) ------------
    const start = performance.now();
    let last = start;
    let W = 0, H = 0, dpr = 1;
    let pupil = MODE.idle.pupil, pupilVel = 0;
    let rotA = 0, rotB = 0, rotC = 0, wA = MODE.idle.wA, wB = MODE.idle.wB, wC = MODE.idle.wC;
    let level = 0, glow = 1, grain = 0.035, aberr = 0, ripAmp = 0, ripRate = 0, ripPhase = 0;
    let hue = MODE.idle.hue, sat = MODE.idle.sat;
    let shutter = 0, flash = 0, scan = 0, light = 0, gridScroll = 0;
    let ratchet = 0, ratchetTarget = 0, ratchetVel = 0, tickAcc = 0;
    let breathT = 0;
    let mx = 0, my = 0, px = 0, py = 0;
    let prevMode: CoreMode = mode;
    let lastDeg = -1, lastSat = -1;
    let reduced = 0;
    let raf = 0;

    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    reduced = mq.matches ? 1 : 0;
    const onMq = () => { reduced = mq.matches ? 1 : 0; };
    mq.addEventListener("change", onMq);

    const fit = () => {
      const rect = wrap.getBoundingClientRect();
      dpr = Math.min(window.devicePixelRatio || 1, 1.5);
      W = Math.max(1, Math.round(rect.width * dpr));
      H = Math.max(1, Math.round(rect.height * dpr));
      canvas.width = W;
      canvas.height = H;
      gl.viewport(0, 0, W, H);
    };
    fit();
    const ro = new ResizeObserver(fit);
    ro.observe(wrap);

    const onMove = (e: MouseEvent) => {
      mx = (e.clientX / window.innerWidth) * 2 - 1;
      my = (e.clientY / window.innerHeight) * 2 - 1;
    };
    window.addEventListener("mousemove", onMove);

    const onLost = (e: Event) => { e.preventDefault(); cancelAnimationFrame(raf); };
    canvas.addEventListener("webglcontextlost", onLost);

    // frame-rate independent easing: same feel at 60 and 120 Hz
    const ease = (cur: number, target: number, tau: number, dt: number) =>
      cur + (target - cur) * (1 - Math.exp(-dt / tau));

    const frame = (now: number) => {
      raf = requestAnimationFrame(frame);
      const rawDt = (now - last) / 1000;
      last = now;
      // returning from a throttled tab would otherwise detonate the spring
      if (rawDt > 0.25) return;
      const dt = Math.min(rawDt, 0.1);
      const t = ((now - start) / 1000) % 3600;

      const m = modeRef.current;
      const spec = MODE[m];
      const slow = reduced ? 0 : 1;

      if (m !== prevMode) {
        flash = 1;
        if (m === "working") { ratchetTarget = ratchet; tickAcc = 0; }
        prevMode = m;
      }

      // level: only real while ARGUS is speaking; listening has no mic analyser
      // yet, so it stays 0 until voiceClient grows one — then this tracks it.
      let target = 0;
      if (m === "speaking") target = levelRef.current?.() ?? fakeLevel(t);
      else if (m === "listening") target = levelRef.current?.() ?? 0;
      level = ease(level, Math.min(1, Math.max(0, target)), target > level ? 0.035 : 0.16, dt);

      // pupil — a critically damped spring is what makes it read as mechanism
      breathT += dt;
      let pTarget = spec.pupil;
      if (m === "idle") pTarget += 0.008 * Math.sin((breathT / 7) * TAU);
      if (m === "listening") pTarget += 0.075 * level + 0.004 * Math.sin(breathT * 6);
      if (m === "speaking") pTarget = Math.min(0.175, Math.max(0.09, 0.1 + 0.075 * level));
      if (m === "working") {
        tickAcc += dt * slow;
        while (tickAcc >= 1 / 6) {
          tickAcc -= 1 / 6;
          ratchetTarget += TAU / 12 / 8;
          shutter = 1;
        }
        pTarget = ratchetTarget % (TAU / 6) > TAU / 12 ? 0.085 : 0.105;
      }
      const acc = (pTarget - pupil) * spec.stiff - pupilVel * spec.damp;
      pupilVel += acc * dt;
      pupil += pupilVel * dt;

      const rAcc = (ratchetTarget - ratchet) * 180 - ratchetVel * 13;
      ratchetVel += rAcc * dt;
      ratchet += ratchetVel * dt;

      // rotation: integrate, then wrap on the exact blade period so a display
      // left running for a week keeps full float precision
      wA = ease(wA, spec.wA * slow, 0.5, dt);
      wB = ease(wB, spec.wB * slow, 0.5, dt);
      wC = ease(wC, spec.wC * slow, 0.5, dt);
      rotA = (rotA + dt * wA) % (TAU / 24);
      rotB = (rotB + dt * wB) % (TAU / 12);
      rotC = (rotC + dt * wC) % (TAU / 6);

      glow = ease(glow, spec.glow * (1 + level * 0.5), 0.25, dt);
      grain = ease(grain, spec.grain, 0.4, dt);
      aberr = ease(aberr, spec.aberr, 0.2, dt);
      ripAmp = ease(ripAmp, (spec.ripAmp + (m === "speaking" ? 0.5 * level : 0)) * slow, 0.3, dt);
      ripRate = ease(ripRate, spec.ripRate * (m === "speaking" ? 0.6 + level : 1), 0.4, dt);
      ripPhase = (ripPhase + dt * ripRate) % TAU;
      shutter *= Math.exp(-dt / 0.05);
      flash *= Math.exp(-dt / 0.18);
      scan = m === "listening" ? (scan + dt * 2.2 * slow) % TAU : 0;
      light = (light + dt * 0.22 * slow) % TAU;
      gridScroll = (gridScroll + dt * 0.05 * slow) % 1;

      // hue takes the SHORT arc: 210 -> 12 must climb through violet, not
      // descend through green, or it reads as the hue voyage we removed
      const dh = (((spec.hue - hue + 540) % 360) - 180);
      const hTau = m === "error" ? 0.06 : prevMode === "error" ? 0.5 : 0.35;
      hue = (hue + dh * (1 - Math.exp(-dt / hTau)) + 360) % 360;
      sat = ease(sat, spec.sat, hTau, dt);

      const deg = Math.round(hue);
      const satPct = Math.round(sat * 100);
      if (deg !== lastDeg) {
        lastDeg = deg;
        document.documentElement.style.setProperty("--accent-h", String(deg));
      }
      if (satPct !== lastSat) {
        lastSat = satPct;
        document.documentElement.style.setProperty("--accent-s", `${satPct}%`);
      }

      px = ease(px, mx, 0.25, dt);
      py = ease(py, my, 0.25, dt);

      const curl = spec.curlBase + 0.45 * (1 - Math.min(1, pupil / PUPIL_OPEN));
      const bgIdx = Math.max(0, BG_MODES.indexOf(bgRef.current));

      gl.uniform2f(U.u_res, W, H);
      gl.uniform2f(U.u_center, W * 0.5 + px * 6 * dpr, H * 0.568 - py * 6 * dpr);
      gl.uniform1f(U.u_time, t);
      gl.uniform1f(U.u_hue, hue / 360);
      gl.uniform1f(U.u_sat, sat);
      gl.uniform1f(U.u_rotA, rotA);
      gl.uniform1f(U.u_rotB, rotB + ratchet);
      gl.uniform1f(U.u_rotC, rotC);
      gl.uniform1f(U.u_pupil, Math.max(0.004, pupil));
      gl.uniform1f(U.u_curl, curl);
      gl.uniform1f(U.u_bow, 0.9);
      gl.uniform1f(U.u_level, level);
      gl.uniform1f(U.u_glow, glow);
      gl.uniform1f(U.u_grain, Math.max(0.02, grain));
      gl.uniform1f(U.u_ripAmp, ripAmp);
      gl.uniform1f(U.u_ripFreq, spec.ripFreq);
      gl.uniform1f(U.u_ripPhase, ripPhase);
      gl.uniform1f(U.u_shutter, shutter);
      gl.uniform1f(U.u_flash, flash);
      gl.uniform1f(U.u_scan, scan);
      gl.uniform1f(U.u_light, light + px * 0.25);
      gl.uniform1f(U.u_aberr, aberr);
      gl.uniform1f(U.u_reduced, reduced);
      gl.uniform1f(U.u_gridScroll, gridScroll);
      gl.uniform1i(U.u_bg, bgIdx);

      gl.drawArrays(gl.TRIANGLES, 0, 3);
    };
    raf = requestAnimationFrame(frame);

    return () => {
      cancelAnimationFrame(raf);
      mq.removeEventListener("change", onMq);
      window.removeEventListener("mousemove", onMove);
      canvas.removeEventListener("webglcontextlost", onLost);
      ro.disconnect();
      gl.deleteBuffer(buf);
      gl.deleteProgram(prog);
      gl.deleteShader(vs);
      gl.deleteShader(fs);
      // hand the chrome back its resting palette
      document.documentElement.style.setProperty("--accent-h", "210");
      document.documentElement.style.setProperty("--accent-s", "16%");
      gl.getExtension("WEBGL_lose_context")?.loseContext();
    };
  }, []);

  return (
    <div ref={wrapRef} className="graph-core" aria-hidden="true">
      <div className="graph-canvas">
        <canvas ref={canvasRef} style={{ display: "block", width: "100%", height: "100%" }} />
      </div>
      {bgMode !== "flat" && <div className="bg-vignette" />}
    </div>
  );
}
