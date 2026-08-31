"use client";

import { memo, useEffect, useState } from "react";
import { SectionTitle } from "./shared";

// ---------------------------------------------------------------------------
// AI Newsdesk — live gen-AI headlines from the top players' own feeds
// (OpenAI, DeepMind, Google AI, Hugging Face, smol.ai + AI press). Fetches
// /api/ainews (server-cached, no keys) on mount and every 15 min; rows open
// the story in a new tab. Distinct from the right column's "AI Wire", which
// reads the morning-intel note's headlines.
// ---------------------------------------------------------------------------

interface NewsItem {
  title: string;
  link: string;
  source: string;
  ts: number;
}
interface NewsPayload {
  generated_at: string;
  items: NewsItem[];
  feeds_ok: number;
  feeds_total: number;
}

const REFRESH_MS = 15 * 60 * 1000;

function age(ts: number): string {
  if (!ts) return "";
  const s = Math.max(0, (Date.now() - ts) / 1000);
  if (s < 3600) return `${Math.max(1, Math.floor(s / 60))}m`;
  if (s < 86400) return `${Math.floor(s / 3600)}h`;
  return `${Math.floor(s / 86400)}d`;
}

export default memo(function AiNews({ hot }: { hot?: boolean }) {
  const [news, setNews] = useState<NewsPayload | null>(null);

  useEffect(() => {
    let dead = false;
    const pull = () =>
      fetch("/api/ainews", { cache: "no-store" })
        .then((r) => (r.ok ? r.json() : null))
        .then((j: NewsPayload | null) => {
          if (!dead && j) setNews(j);
        })
        .catch(() => {});
    void pull();
    const id = setInterval(pull, REFRESH_MS);
    return () => {
      dead = true;
      clearInterval(id);
    };
  }, []);

  if (!news || news.items.length === 0) return null; // feeds down → no dead panel

  return (
    <section
      className={`block boot-stagger ${hot ? "voice-hot" : ""}`}
      style={{ animationDelay: "0.34s" }}
    >
      <SectionTitle
        title="AI Newsdesk"
        tick={`LIVE · ${news.feeds_ok}/${news.feeds_total} FEEDS`}
        tickCls={news.feeds_ok === 0 ? "bad" : ""}
      />
      <div className="ainews-list">
        {news.items.map((n, i) => (
          <div
            className="wire-row"
            key={`${n.link}-${i}`}
            role="button"
            tabIndex={0}
            onClick={() => window.open(n.link, "_blank", "noopener")}
          >
            <span className="ainews-src">{n.source}</span>
            <span className="ainews-title">{n.title}</span>
            <span className="ainews-age">{age(n.ts)}</span>
          </div>
        ))}
      </div>
    </section>
  );
});
