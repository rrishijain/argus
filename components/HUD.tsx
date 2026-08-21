"use client";

import { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
import dynamic from "next/dynamic";
import type { VaultState } from "@/lib/vault";
import { voice } from "@/lib/voiceClient";
import { scrubRunSummary, humanizeFailure } from "@/lib/spokenText";
import { fmtAgeSeconds } from "@/lib/format";
import { DEMO_MARKETING } from "@/lib/demo";
import { BG_MODES, type BgMode, type CoreMode } from "./coreTypes";
import ReportOverlay from "./ReportOverlay";
import PaidMedia from "./panels/PaidMedia";
import SearchAeo from "./panels/SearchAeo";
import Sources from "./panels/Sources";
import Shipped from "./panels/Shipped";
import Pacing from "./panels/Pacing";
import DecisionQueue from "./panels/DecisionQueue";
import CommandDeck from "./panels/CommandDeck";
import { SectionTitle } from "./panels/shared";

const Core = dynamic(() => import("./IrisCore"), { ssr: false });

// ---------------------------------------------------------------------------
// helpers
// ---------------------------------------------------------------------------

function useVaultState(intervalMs = 5000) {
  const [state, setState] = useState<VaultState | null>(null);
  const [error, setError] = useState(false);

  const pull = useCallback(async () => {
    try {
      const res = await fetch("/api/state", { cache: "no-store" });
      if (!res.ok) throw new Error(String(res.status));
      const j = (await res.json()) as VaultState;
      // ?demo=marketing — render every marketing panel populated without
      // touching the vault (layout checks, filming)
      setState(window.location.search.includes("demo=marketing") ? { ...j, ...DEMO_MARKETING } : j);
      setError(false);
    } catch {
      setError(true);
    }
  }, []);

  useEffect(() => {
    pull();
    const id = setInterval(pull, intervalMs);
    return () => clearInterval(id);
  }, [pull, intervalMs]);

  return { state, error, refresh: pull };
}

function useClock() {
  const [now, setNow] = useState<Date | null>(null);
  useEffect(() => {
    setNow(new Date());
    const id = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(id);
  }, []);
  return now;
}

function fmtClock(s: number): string {
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

function noteAgeDays(date: string): number {
  const ms = Date.now() - Date.parse(`${date}T12:00:00`);
  return Math.max(0, Math.round(ms / 86_400_000));
}

// spoken line for a finished run — short, no markdown, summary clamped.
// Summaries pass through scrubRunSummary so prompt-contract violations
// ("(headless)", SAVED-path tails) never reach the speakers.
function runAnnouncement(skill: string, status: string, summary: string, label?: string | null): string {
  const name = label ? `${label} ask` : skill.replace(/-/g, " ");
  if (status !== "ok") {
    const why = summary ? humanizeFailure(summary) : "";
    return `${name} hit a snag${why ? ` — ${why.slice(0, 120)}` : "."}`;
  }
  const clean = scrubRunSummary(summary);
  // voice-ask runs put the spoken answer in line 1 of output (= summary) —
  // speak it directly instead of "voice ask complete"
  if (skill === "voice-ask" && clean) {
    return clean.slice(0, 220);
  }
  // "plan today is done. Done." — a summary that only says done adds nothing
  const redundant = /^(done|complete|completed|finished|all done|ok)[.!]?$/i.test(clean);
  return `${name} is done.${clean && !redundant ? ` ${clean.slice(0, 160)}` : ""}`;
}

// ---------------------------------------------------------------------------
// panels (memoized — only re-render when their slice of state changes)
// ---------------------------------------------------------------------------

const AudioIO = memo(function AudioIO({ mode }: { mode: CoreMode }) {
  const live = mode === "speaking" || mode === "listening";
  return (
    <section className="block boot-stagger" style={{ animationDelay: "0.42s" }}>
      <SectionTitle title="Audio I/O" tick={live ? "TTS.LIVE" : "TTS.STANDBY"} />
      <div className={`wave ${live ? "live" : "idle"} ${mode === "listening" ? "cobalt" : ""}`}>
        {Array.from({ length: 36 }, (_, i) => (
          <i key={i} style={{ "--i": i } as React.CSSProperties} />
        ))}
      </div>
      <div className="audio-meta">
        <span>hold SPACE to talk · ESC to stop</span>
      </div>
    </section>
  );
});

const Priorities = memo(function Priorities({
  state,
  hot,
  onToggle,
}: {
  state: VaultState;
  hot?: boolean;
  onToggle: (index: number, done: boolean) => void;
}) {
  const d = state.daily;
  const ageDays = d && !d.isToday ? noteAgeDays(d.date) : 0;
  const veryStale = ageDays > 2;
  return (
    <section
      className={`block boot-stagger ${!d || d.isToday ? "" : "note-stale"} ${hot ? "voice-hot" : ""}`}
      style={{ animationDelay: "0.18s" }}
    >
      <SectionTitle title="Directives" tick="TOP.3" />
      {d ? (
        <>
          {!d.isToday && (
            <div className={`stale-banner ${veryStale ? "err" : ""}`}>
              ⚠ note is {ageDays}d old — run /today
            </div>
          )}
          {d.top3.map((p, i) => (
            <div
              className={`prio ${p.done ? "done" : ""} ${d.isToday ? "clickable" : ""}`}
              key={i}
              role={d.isToday ? "button" : undefined}
              title={d.isToday ? (p.done ? "mark open" : "mark done") : undefined}
              onClick={d.isToday ? () => onToggle(i, !p.done) : undefined}
            >
              <span className="box">{p.done ? "■" : "□"}</span>
              <span>{p.text}</span>
            </div>
          ))}
          <div className="prio-date">{d.isToday ? "today" : `carried · ${d.date}`}</div>
        </>
      ) : (
        <div className="prio dim">no daily note found</div>
      )}
    </section>
  );
});

// AI Wire — today's morning-report headlines, click → full report overlay
const Wire = memo(function Wire({
  state,
  onOpen,
}: {
  state: VaultState;
  onOpen: (path: string) => void;
}) {
  const m = state.morning;
  if (!m || m.heads.length === 0) return null;
  return (
    <section className="block boot-stagger" style={{ animationDelay: "0.5s" }}>
      <SectionTitle title="AI Wire" tick="MORNING.INTEL" />
      {/* two only — the right column is full; more would push the deck off-row */}
      {m.heads.slice(0, 2).map((h, i) => (
        <div className="wire-row" key={i} role="button" onClick={() => onOpen(m.rel)}>
          <span className="wire-bullet">▸</span>
          <span>{h}</span>
        </div>
      ))}
    </section>
  );
});

function parseHHMM(t: string): number {
  const m = t.match(/^(\d{1,2}):(\d{2})$/);
  return m ? parseInt(m[1], 10) * 60 + parseInt(m[2], 10) : -1;
}

const Schedule = memo(function Schedule({ state, hot }: { state: VaultState; hot?: boolean }) {
  const d = state.daily;
  const now = useClock();
  if (!d || d.schedule.length === 0) return null;
  const nowMin = now && d.isToday ? now.getHours() * 60 + now.getMinutes() : -1;
  const items = d.schedule.map((s) => ({ ...s, min: parseHHMM(s.time) }));
  // current block = latest item that has started
  let currentIdx = -1;
  if (nowMin >= 0) {
    for (let i = 0; i < items.length; i++) {
      if (items[i].min >= 0 && items[i].min <= nowMin) currentIdx = i;
    }
  }
  const ageDays = d.isToday ? 0 : noteAgeDays(d.date);
  return (
    <section
      className={`block boot-stagger ${d.isToday ? "" : "note-stale"} ${hot ? "voice-hot" : ""}`}
      style={{ animationDelay: "0.34s" }}
    >
      <SectionTitle
        title="Schedule"
        tick={d.isToday ? "TODAY" : `${ageDays}D OLD`}
        href="https://calendar.google.com/calendar/u/0/r/day"
      />
      <div className="sched">
        {items.map((s, i) => (
          <div
            key={`${s.time}-${i}`}
            className={`sched-row ${i === currentIdx ? "now" : ""} ${
              currentIdx >= 0 && i < currentIdx ? "past" : ""
            }`}
          >
            <span className="t">{s.time}</span>
            <span className="i">{s.item}</span>
            {i === currentIdx && <span className="now-tag">NOW</span>}
          </div>
        ))}
      </div>
      {d.focus && <div className="focus-line">focus · {d.focus}</div>}
    </section>
  );
});

function TopBar({
  state,
  online,
  mode,
}: {
  state: VaultState | null;
  online: boolean;
  mode: CoreMode;
}) {
  const now = useClock();
  const r = state?.runner;
  const pull = state?.marketing?.pull;
  const dataCls = !pull ? "dead" : pull.overall === "fresh" ? "on" : pull.overall === "partial" ? "warn" : "dead";
  return (
    <header className="topbar hud-top boot-stagger" style={{ animationDelay: "0.05s" }}>
      <div className="wordmark">
        <span className="name">ARGUS</span>
        <span className="expansion">Autonomous Reporting &amp; Growth Unified System</span>
      </div>
      <div className="status-line">
        <span className={`mode-chip mode-${mode}`}>
          <i className="status-dot" /> orb · {mode}
        </span>
        <span className={`chip ${online ? "on" : "dead"}`}>
          {online ? "api · online" : "api · LOST"}
        </span>
        <span className={`chip ${r?.alive ? "on" : "dead"}`}>
          runner · {r?.alive ? "alive" : "down"}
        </span>
        <span className={`chip ${dataCls}`} title={pull ? `${pull.sources.filter((x) => x.core).map((x) => `${x.source}: ${x.status}`).join(" · ")}` : "no pull yet"}>
          data · {pull ? `${pull.overall} · ${fmtAgeSeconds(pull.newest_age_s)}` : "none"}
        </span>
      </div>
      <div className="clock-wrap">
        <div className="clock" suppressHydrationWarning>
          {now
            ? `${String(now.getHours()).padStart(2, "0")}:${String(
                now.getMinutes()
              ).padStart(2, "0")}`
            : "--:--"}
          <span className="sec" suppressHydrationWarning>
            {now ? `:${String(now.getSeconds()).padStart(2, "0")}` : ""}
          </span>
        </div>
        <div className="clock-date" suppressHydrationWarning>
          {now
            ? `${["SUN", "MON", "TUE", "WED", "THU", "FRI", "SAT"][now.getDay()]} · ${
                ["JAN", "FEB", "MAR", "APR", "MAY", "JUN", "JUL", "AUG", "SEP", "OCT", "NOV", "DEC"][
                  now.getMonth()
                ]
              } ${now.getDate()}`
            : ""}
        </div>
      </div>
    </header>
  );
}

// ---------------------------------------------------------------------------
// root
// ---------------------------------------------------------------------------

const MODE_KEYS: Record<string, CoreMode> = {
  "1": "idle",
  "2": "working",
  "3": "listening",
  "4": "speaking",
  "5": "error",
};

export default function HUD() {
  const { state, error, refresh } = useVaultState(5000);
  const [modeOverride, setModeOverride] = useState<CoreMode | null>(null);
  const [bgMode, setBgMode] = useState<BgMode>("grid");
  const [voiceSpeaking, setVoiceSpeaking] = useState(false);
  const [ptt, setPtt] = useState(false);
  const [wakeListening, setWakeListening] = useState(false);
  const [hotPanels, setHotPanels] = useState<string[]>([]);
  // report reveal: callouts = cards branching off the core (max 4 anchor
  // slots around the orb — same hairline language). kind "doc" opens the
  // overlay, kind "link" opens the source in a new tab, kind "task" is a
  // live run (elapsed / ~eta progress) that morphs into its doc card on
  // completion — target stays `run:<id>` until the morph swaps it.
  const [callouts, setCallouts] = useState<
    {
      id: number;
      kind: "doc" | "link" | "task";
      target: string;
      label: string;
      slot: number;
      startedAt?: number;
      etaS?: number | null;
      phase?: "working" | "done" | "failed";
    }[]
  >([]);
  const calloutSeq = useRef(0);
  const addCallout = useCallback(
    (target: string, label: string, kind: "doc" | "link" = "doc") => {
      setCallouts((cur) => {
        if (cur.some((c) => c.target === target)) return cur; // already on screen
        const used = new Set(cur.map((c) => c.slot));
        const free = [0, 1, 2, 3].find((s) => !used.has(s));
        const entry = { id: ++calloutSeq.current, kind, target, label };
        // all four slots taken → oldest card yields its slot, but never a
        // live task (its run is still going — evicting it hides real work)
        if (free === undefined) {
          const victim = cur.find((c) => !(c.kind === "task" && c.phase === "working")) ?? cur[0];
          return [...cur.filter((c) => c !== victim), { ...entry, slot: victim.slot }];
        }
        return [...cur, { ...entry, slot: free }];
      });
    },
    []
  );
  const [report, setReport] = useState<{ path: string; content: string } | null>(null);
  const reportOpenRef = useRef(false);
  reportOpenRef.current = report !== null;
  const spokenRunsRef = useRef<Set<string>>(new Set());
  const seenAlertsRef = useRef<Set<string>>(new Set());
  const calloutsRef = useRef<typeof callouts>([]);
  calloutsRef.current = callouts;

  // the old telemetry feed is gone from the wall; keep a console trail so voice
  // + runner events are still debuggable from devtools
  const pushLine = useCallback((cls: string, text: string) => {
    if (cls === "err") console.warn(`[argus] ${text}`);
    else console.debug(`[argus:${cls}] ${text}`);
  }, []);

  const openReport = useCallback(
    async (path: string) => {
      try {
        const res = await fetch(`/api/report?path=${encodeURIComponent(path.split("#")[0])}`);
        if (!res.ok) throw new Error(String(res.status));
        const j = (await res.json()) as { path: string; content: string };
        setReport(j);
      } catch {
        pushLine("err", `couldn't open ${path}`);
      }
    },
    [pushLine]
  );

  // bottom-left TRANSCRIPT button — the voice conversation so far, rendered
  // in the same overlay as reports (memory.jsonl survives reloads, so this
  // shows exchanges from before the page opened too)
  const openTranscript = useCallback(async () => {
    try {
      const res = await fetch("/api/transcript", { cache: "no-store" });
      if (!res.ok) throw new Error(String(res.status));
      setReport((await res.json()) as { path: string; content: string });
    } catch {
      pushLine("err", "couldn't load transcript");
    }
  }, [pushLine]);

  const toggleDirective = useCallback(
    async (index: number, done: boolean) => {
      try {
        const res = await fetch("/api/daily", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ index, done }),
        });
        if (!res.ok) throw new Error(String(res.status));
        await refresh();
      } catch {
        pushLine("err", "directive update failed");
      }
    },
    [refresh, pushLine]
  );

  // ?demo=callouts — seed the doc callouts on demand (filming + layout checks)
  useEffect(() => {
    if (!window.location.search.includes("demo=callouts")) return;
    const seeds: [string, string][] = [
      ["inbox/reports/morning/demo-morning.md", "morning report"],
      ["inbox/voice/demo-voice-ask.md", "voice ask"],
      ["inbox/reports/trend-scan/demo-scan.md", "trend scan"],
      ["inbox/reports/inbox-briefs/demo-inbox.md", "inbox brief"],
    ];
    const timers = seeds.map(([p, l], i) => setTimeout(() => addCallout(p, l), 800 + i * 1400));
    return () => timers.forEach(clearTimeout);
  }, [addCallout]);

  // ?demo=taskwork — full task-callout lifecycle without queueing real runs:
  // two tasks spawn (one with eta, one indeterminate). First fills toward its
  // 10s median, runs OVERDUE at 10s (bar degrades to sweep), completes at 16s
  // and morphs into its doc card; the second fails at 22s
  useEffect(() => {
    if (!window.location.search.includes("demo=taskwork")) return;
    const seed = (label: string, etaS: number | null, slot: number) => ({
      id: ++calloutSeq.current,
      kind: "task" as const,
      target: `run:demo-${slot}`,
      label,
      startedAt: Date.now(),
      etaS,
      phase: "working" as const,
      slot,
    });
    const timers = [
      setTimeout(() => setCallouts((c) => [...c, seed("ai trend scan", 10, 0)]), 800),
      setTimeout(() => setCallouts((c) => [...c, seed("inbox brief", null, 1)]), 2600),
      setTimeout(
        () =>
          setCallouts((cur) =>
            cur.map((c) =>
              c.target === "run:demo-0"
                ? {
                    ...c,
                    kind: "doc" as const,
                    target: "inbox/reports/trend-scan/demo-scan.md",
                    phase: undefined,
                  }
                : c
            )
          ),
        16000
      ),
      setTimeout(
        () =>
          setCallouts((cur) =>
            cur.map((c) =>
              c.target === "run:demo-1" ? { ...c, phase: "failed" as const } : c
            )
          ),
        22000
      ),
    ];
    return () => timers.forEach(clearTimeout);
  }, []);

  // voice link — P1: ARGUS speaks, no mic
  useEffect(() => {
    voice.init();
    voice.onLog(pushLine);
    voice.onPanels(setHotPanels);
    voice.onDeliverable((path, label) => addCallout(path, label));
    voice.onReveal((r) => addCallout(r.target, r.label, r.kind)); // sequenced to speech
    voice.onOpenDoc((path) => void openReport(path)); // "bring up the html" → overlay now
    voice.onListening(setWakeListening); // P4: hands-free wake window
    return voice.onSpeaking(setVoiceSpeaking);
  }, [pushLine, openReport, addCallout]);

  // P3 choreography — highlights arrive with the reply and live for the
  // duration of speech; the grace window covers the response→playback gap
  // (and ends the glow if TTS never starts)
  useEffect(() => {
    if (voiceSpeaking || hotPanels.length === 0) return;
    const id = setTimeout(() => setHotPanels([]), 2000);
    return () => clearTimeout(id);
  }, [voiceSpeaking, hotPanels]);

  // P2 — push-to-talk: hold Space to record, release to send
  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      if (e.code !== "Space" || e.repeat) return;
      e.preventDefault();
      void voice.startCapture().then((ok) => {
        if (ok) setPtt(true);
      });
    };
    const up = (e: KeyboardEvent) => {
      if (e.code !== "Space") return;
      e.preventDefault();
      setPtt(false);
      void voice.finishCapture();
    };
    window.addEventListener("keydown", down);
    window.addEventListener("keyup", up);
    return () => {
      window.removeEventListener("keydown", down);
      window.removeEventListener("keyup", up);
    };
  }, []);

  // demo mode keys: 1 idle / 2 working / 3 listening / 4 speaking / 5 error, 0|Esc auto
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key in MODE_KEYS) {
        setModeOverride(MODE_KEYS[e.key]);
        pushLine("sys", `core mode override → ${MODE_KEYS[e.key].toUpperCase()}`);
      } else if (e.key === "Escape") {
        // overlay open → Esc closes it and does nothing else
        if (reportOpenRef.current) {
          setReport(null);
          return;
        }
        if (voice.stop()) pushLine("sys", "voice — stopped");
        setModeOverride(null);
      } else if (e.key === "0") {
        setModeOverride(null);
        pushLine("sys", "core mode → AUTO");
      } else if (e.key === "b" || e.key === "B") {
        setBgMode((cur) => {
          const next = BG_MODES[(BG_MODES.indexOf(cur) + 1) % BG_MODES.length];
          pushLine("sys", `background → ${next.toUpperCase()}`);
          return next;
        });
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [pushLine]);

  // marketing alerts → callouts. Ids are deterministic (flag codes) so a
  // flag that persists across polls shows once, not every 5s; at most two on
  // screen so the orb and live tasks keep their room.
  useEffect(() => {
    const flags = state?.marketing?.flags ?? [];
    const dash = state?.marketing?.latest_reports.dashboard ?? "ops/ads-dashboard.md";
    // alerts on screen right now (their targets carry a #code anchor)
    let onScreen = calloutsRef.current.filter((c) => c.kind === "doc" && c.target.includes("#")).length;
    for (const f of flags) {
      if (f.level === "info" || seenAlertsRef.current.has(f.code)) continue;
      if (onScreen >= 2) break;
      seenAlertsRef.current.add(f.code);
      onScreen++;
      addCallout(`${dash}#${f.code}`, f.text, "doc");
    }
  }, [state, addCallout]);

  // task callouts — active runs branch off the core like doc reveals: skill
  // name + elapsed / ~eta bar while the runner works. On completion the card
  // morphs IN PLACE into the deliverable card (same slot, no jump) — this
  // effect must stay ABOVE the speak-completions effect so the morph happens
  // before addCallout's target dedupe sees the deliverable path.
  useEffect(() => {
    if (!state) return;
    setCallouts((cur) => {
      let next = cur;
      for (const r of state.runs) {
        const existing = next.find((c) => c.kind === "task" && c.target === `run:${r.id}`);
        if (r.status === "running" && !existing) {
          const used = new Set(next.map((c) => c.slot));
          const free = [0, 1, 2, 3].find((s) => !used.has(s));
          const entry = {
            id: ++calloutSeq.current,
            kind: "task" as const,
            target: `run:${r.id}`,
            label: r.label ?? r.skill.replace(/-/g, " "),
            startedAt: r.ts_started ? Date.parse(r.ts_started) : Date.now(),
            etaS: state.etas[r.skill] ?? null,
            phase: "working" as const,
            slot: 0,
          };
          if (free === undefined) {
            // same eviction rule as addCallout: oldest non-working card yields
            const victim =
              next.find((c) => !(c.kind === "task" && c.phase === "working")) ?? next[0];
            next = [...next.filter((c) => c !== victim), { ...entry, slot: victim.slot }];
          } else {
            next = [...next, { ...entry, slot: free }];
          }
        } else if (existing && existing.phase === "working" && r.status !== "running") {
          next =
            r.status === "ok" && r.deliverable_path
              ? next.map((c) =>
                  c === existing
                    ? {
                        ...c,
                        kind: (r.link ? "link" : "doc") as "link" | "doc",
                        target: r.link ?? r.deliverable_path!,
                        phase: undefined,
                      }
                    : c
                )
              : next.map((c) =>
                  c === existing
                    ? { ...c, phase: r.status === "ok" ? ("done" as const) : ("failed" as const) }
                    : c
                );
        }
      }
      return next;
    });
  }, [state]);

  // ok-but-no-deliverable tasks flash COMPLETE, then clear themselves
  useEffect(() => {
    if (!callouts.some((c) => c.phase === "done")) return;
    const id = setTimeout(
      () => setCallouts((cur) => cur.filter((c) => c.phase !== "done")),
      6000
    );
    return () => clearTimeout(id);
  }, [callouts]);

  // 1s re-render while a task works — elapsed + bar width derive from Date.now()
  const taskWorking = callouts.some((c) => c.kind === "task" && c.phase === "working");
  const [, setTaskTick] = useState(0);
  useEffect(() => {
    if (!taskWorking) return;
    const id = setInterval(() => setTaskTick((t) => t + 1), 1000);
    return () => clearInterval(id);
  }, [taskWorking]);

  // speak completions — separate from the feed diff: a run can first appear
  // as "running" (id lands in seenRunsRef), so completion is tracked by id
  // here, only once it reaches a terminal status. First snapshot seeds
  // silently — no replaying history out loud on page load.
  const runsPrimedRef = useRef(false);
  useEffect(() => {
    if (!state) return;
    const done = state.runs.filter(
      (r) => (r.status === "ok" || r.status === "error") && !spokenRunsRef.current.has(r.id)
    );
    if (!runsPrimedRef.current) {
      runsPrimedRef.current = true;
      done.forEach((r) => spokenRunsRef.current.add(r.id));
      return;
    }
    done.forEach((r) => {
      spokenRunsRef.current.add(r.id);
      voice.speak(runAnnouncement(r.skill, r.status, r.summary ?? "", r.label));
      // finished run left a document → offer it via the reveal chip. When
      // the run's REAL output lives at a URL (Gmail draft, video), the
      // callout sends you THERE — the md stays in the Documents trail.
      if (r.status === "ok" && r.deliverable_path) {
        addCallout(
          r.link ?? r.deliverable_path,
          r.label ?? r.skill.replace(/-/g, " "),
          r.link ? "link" : "doc"
        );
      }
    });
  }, [state]);

  const onQueued = useCallback(
    (skill: string, ok: boolean) => {
      pushLine(ok ? "sys" : "err", ok ? `intent queued → ${skill}` : `queue write FAILED → ${skill}`);
    },
    [pushLine]
  );

  // auto mode: fetch error → error; PTT held or wake window open → listening;
  // voice playing → speaking (orb mouths it, even mid-work); runner busy →
  // working; else idle
  const autoMode: CoreMode = error
    ? "error"
    : ptt || wakeListening
      ? "listening"
      : voiceSpeaking
        ? "speaking"
        : state?.runner?.busy
          ? "working"
          : "idle";
  const mode = modeOverride ?? autoMode;
  const allowed = useMemo(() => new Set(state?.allowed_skills ?? []), [state?.allowed_skills]);

  return (
    <main className="stage">
      <Core mode={mode} bgMode={bgMode} getLevel={voice.getLevel} />

      <div className="scrim scrim-l" aria-hidden="true" />
      <div className="scrim scrim-r" aria-hidden="true" />
      <div className="scrim scrim-b" aria-hidden="true" />
      <div className="scrim scrim-t" aria-hidden="true" />

      <div className="hud">
        <TopBar state={state} online={!error} mode={mode} />

        <div className="hud-left">
          <PaidMedia m={state?.marketing ?? null} hot={hotPanels.includes("paid") || hotPanels.includes("vitals")} />
          <SearchAeo m={state?.marketing ?? null} hot={hotPanels.includes("search")} />
          {state && (
            <Priorities
              state={state}
              hot={hotPanels.includes("priorities")}
              onToggle={toggleDirective}
            />
          )}
          {state && <Schedule state={state} hot={hotPanels.includes("schedule")} />}
        </div>

        <div className="hud-center">
          {callouts.map((c) => {
            const isTask = c.kind === "task";
            const elapsed =
              isTask && c.startedAt ? Math.max(0, Math.floor((Date.now() - c.startedAt) / 1000)) : 0;
            // ETA is silent: bar fills toward the median (capped at 95 — never
            // claim done before the run lands), and once elapsed passes it the
            // bar degrades to the indeterminate sweep instead of parking at a
            // number it promised. Text never states the estimate.
            const overdue = c.etaS != null && elapsed >= c.etaS;
            const pct = isTask && c.etaS && !overdue ? Math.min(95, (elapsed / c.etaS) * 100) : null;
            return (
              <div key={c.id} className={`callout slot-${c.slot}`}>
                <i className="br br-a" aria-hidden="true" />
                <i className="br br-b" aria-hidden="true" />
                <div
                  className={`callout-box${isTask ? ` task ${c.phase ?? ""}` : ""}`}
                  {...(!isTask && {
                    role: "button",
                    tabIndex: 0,
                    onClick: () =>
                      c.kind === "link"
                        ? window.open(c.target, "_blank", "noopener")
                        : void openReport(c.target),
                  })}
                >
                  <span className="callout-dot" />
                  <span className="callout-text">
                    <span className="callout-label">{c.label}</span>
                    {isTask ? (
                      <span className="task-meta">
                        <span className={`task-bar${pct === null && c.phase === "working" ? " indet" : ""}`}>
                          <i
                            style={
                              c.phase !== "working"
                                ? { width: "100%" }
                                : pct !== null
                                  ? { width: `${pct}%` }
                                  : undefined
                            }
                          />
                        </span>
                        <span className="task-time">
                          {c.phase === "working"
                            ? `${fmtClock(elapsed)} · working`
                            : c.phase === "failed"
                              ? `failed · ${fmtClock(elapsed)}`
                              : `complete · ${fmtClock(elapsed)}`}
                        </span>
                      </span>
                    ) : (
                      <span className="callout-file">
                        {c.kind === "link"
                          ? c.target.replace(/^https?:\/\/(www\.)?/, "").split("/")[0] + " ↗"
                          : c.target.split("#")[0].split("/").pop()}
                      </span>
                    )}
                  </span>
                  <button
                    className="callout-x"
                    aria-label="dismiss"
                    onClick={(e) => {
                      e.stopPropagation();
                      setCallouts((cur) => cur.filter((x) => x.id !== c.id));
                    }}
                  >
                    ×
                  </button>
                </div>
              </div>
            );
          })}
          {callouts.length > 1 && (
            <button className="callout-clear" onClick={() => setCallouts([])}>
              clear all ×{callouts.length}
            </button>
          )}
        </div>

        <div className="hud-right">
          <CommandDeck
            state={state}
            allowed={allowed}
            hot={hotPanels.includes("deck") || hotPanels.includes("pipeline") || hotPanels.includes("diagnostics")}
            onQueued={onQueued}
          />
          <Sources m={state?.marketing ?? null} hot={hotPanels.includes("sources")} onOpen={openReport} />
          <Shipped items={state?.shipped ?? []} hot={hotPanels.includes("shipped") || hotPanels.includes("documents")} onOpen={openReport} />
          <AudioIO mode={mode} />
          {state && <Wire state={state} onOpen={openReport} />}
        </div>

        <div className="hud-bottom directive-bar">
          <Pacing m={state?.marketing ?? null} hot={hotPanels.includes("pacing") || hotPanels.includes("objective")} />
          <DecisionQueue m={state?.marketing ?? null} hot={hotPanels.includes("decisions")} onOpen={openReport} />
        </div>

        <button className="transcript-btn" onClick={() => void openTranscript()}>
          Transcript
        </button>
      </div>

      {report && (
        <ReportOverlay
          report={report}
          onClose={() => setReport(null)}
          action={
            report.path === "system/voice/transcript"
              ? {
                  label: "reset transcript ×",
                  onClick: () => {
                    void fetch("/api/transcript", { method: "DELETE" }).then(() => {
                      setReport(null);
                      pushLine("sys", "voice transcript cleared");
                    });
                  },
                }
              : undefined
          }
        />
      )}

      <div className="grain" aria-hidden="true" />
    </main>
  );
}
