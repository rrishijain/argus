"use client";

import { useState } from "react";
import type { VaultState } from "@/lib/vault";
import { SectionTitle } from "./shared";

// ---------------------------------------------------------------------------
// Command Deck — buttons drop REAL intents into system/queue/. Grouped by
// what a marketing operator is trying to do. Every skill here must exist in
// ALLOWED_SKILLS (lib/skills.ts) ⟷ runner.js buildPrompt() ⟷ router aliases;
// `enabled` lets a button ship before its runner case does (greyed, no 400s).
// ---------------------------------------------------------------------------

export interface DeckItem {
  skill: string;
  label: string;
  /** default intent args sent with the button (voice can override) */
  args?: Record<string, unknown>;
  enabled?: boolean;
}

export const DECK_GROUPS: { group: string; items: DeckItem[] }[] = [
  {
    group: "Pull",
    items: [
      { skill: "metrics-pull", label: "Pull Data" },
      { skill: "ads-dashboard", label: "Rebuild Board" },
    ],
  },
  {
    group: "Audit",
    items: [
      { skill: "meta-ads-audit", label: "Meta Audit" },
      { skill: "google-ads-audit", label: "Google Audit" },
      { skill: "seo-audit", label: "SEO Audit" },
      { skill: "aeo-audit", label: "AEO Audit" },
    ],
  },
  {
    group: "Report",
    items: [
      { skill: "perf-report", label: "Perf Report", args: { scope: "blended", range: 7 } },
      { skill: "report-deck", label: "Weekly Deck", args: { scope: "blended", range: 7 } },
      { skill: "morning-intel", label: "AI Intel" },
    ],
  },
  {
    group: "Publish",
    items: [
      { skill: "ds-blog-publish", label: "Publish Blog" },
      { skill: "news-carousel", label: "News Carousel" },
    ],
  },
  {
    group: "Day",
    items: [
      { skill: "today", label: "Today" },
      { skill: "close-day", label: "Close Day" },
    ],
  },
];

/** Flat list — handy for the router and tests. */
export const DECK_SKILLS = DECK_GROUPS.flatMap((g) => g.items);

export default function CommandDeck({
  state,
  hot,
  allowed,
  onQueued,
}: {
  state: VaultState | null;
  hot?: boolean;
  /** skills the API will accept right now (from /api/queue's ALLOWED_SKILLS) */
  allowed: Set<string>;
  onQueued: (skill: string, ok: boolean) => void;
}) {
  const [cooldown, setCooldown] = useState<Record<string, boolean>>({});

  const fire = async (item: DeckItem) => {
    if (cooldown[item.skill]) return;
    setCooldown((c) => ({ ...c, [item.skill]: true }));
    try {
      const res = await fetch("/api/queue", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ skill: item.skill, args: item.args ?? {} }),
      });
      onQueued(item.skill, res.ok);
    } catch {
      onQueued(item.skill, false);
    }
    setTimeout(() => setCooldown((c) => ({ ...c, [item.skill]: false })), 15000);
  };

  const r = state?.runner;
  return (
    <section className={`block boot-stagger ${hot ? "voice-hot" : ""}`} style={{ animationDelay: "0.26s" }}>
      <SectionTitle
        title="Command Deck"
        tick={r ? `${r.busy ? "ENGAGED" : "IDLE"} · ${r.active}/${r.max_concurrent} ACTIVE · ${r.pending} QUEUED` : "RUNNER OFFLINE"}
        tickCls={r?.alive ? "" : "bad"}
      />
      {state && state.queue.length > 0 && (
        <div className="queue-list">
          {state.queue.slice(0, 3).map((q) => (
            <span key={q.id}>▸ {q.label ?? q.skill}</span>
          ))}
          {state.queue.length > 3 && <span className="dim">+{state.queue.length - 3} more</span>}
        </div>
      )}
      <div className="deck">
        {DECK_GROUPS.map((g) => (
          <div className="deck-group" key={g.group}>
            <div className="deck-group-label">{g.group}</div>
            {g.items.map((d) => {
              const on = allowed.has(d.skill) && d.enabled !== false;
              return (
                <button
                  key={d.skill}
                  className={`deck-btn ${cooldown[d.skill] ? "fired" : ""} ${on ? "" : "soon"}`}
                  onClick={() => fire(d)}
                  disabled={!on || cooldown[d.skill]}
                  title={on ? d.skill : `${d.skill} — not wired yet`}
                >
                  <span className="deck-dot" />
                  <span className="deck-label">{cooldown[d.skill] ? "QUEUED" : d.label}</span>
                  <span className="deck-arrow">→</span>
                </button>
              );
            })}
          </div>
        ))}
      </div>
      <div className="deck-hint">intents write to system/queue — runner executes</div>
    </section>
  );
}
