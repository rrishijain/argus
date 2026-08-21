"use client";

import { memo } from "react";
import type { Marketing } from "@/lib/vault";
import { deltaGood, fmtAge, fmtCount, fmtDelta, fmtPct } from "@/lib/format";
import { SectionTitle, Sparkline, verdictCls } from "./shared";

// ---------------------------------------------------------------------------
// Search & AEO — organic truth. AEO readiness (exists today) on top; GSC rows
// once Search Console is wired. Never returns null while either exists, and
// says plainly what is missing instead of hiding the row.
// ---------------------------------------------------------------------------

function Row({
  label,
  value,
  delta,
  invert,
  verdict,
  sub,
}: {
  label: string;
  value: string;
  delta?: number | null;
  invert?: boolean;
  verdict?: string;
  sub?: string;
}) {
  const good = deltaGood(delta, invert);
  return (
    <div className={`kv-row ${verdictCls(verdict)}`}>
      <span className="kv-label">{label}</span>
      <span className="kv-value">{value}</span>
      <span className={`kv-delta ${good === null ? "zero" : good ? "" : "neg"}`}>{delta === undefined ? sub ?? "" : fmtDelta(delta)}</span>
    </div>
  );
}

const SearchAeo = memo(function SearchAeo({ m, hot }: { m: Marketing | null; hot?: boolean }) {
  const seo = m?.channels.seo;
  const aeo = m?.aeo;
  const T = m?.targets;
  if (!m || (!seo?.totals && (aeo?.score === null || aeo?.score === undefined))) {
    return (
      <section className={`block boot-stagger ${hot ? "voice-hot" : ""}`} style={{ animationDelay: "0.18s" }}>
        <SectionTitle title="Search & AEO" tick="WAITING ON PULL" tickCls="dim" />
        <div className="prio dim">no organic data yet</div>
      </section>
    );
  }
  const st = seo?.totals;
  const age = fmtAge(seo?.ts ?? aeo?.ts ?? null);
  const tick = st
    ? `GSC · ${seo!.window?.days ?? 7}D · ${age.label}`
    : `AEO · ${fmtAge(aeo?.ts ?? null).label}`;

  return (
    <section className={`block boot-stagger ${hot ? "voice-hot" : ""}`} style={{ animationDelay: "0.18s" }}>
      <SectionTitle title="Search & AEO" tick={tick} tickCls={age.stale ? "warn" : ""} />

      {st ? (
        <>
          <Row label="Clicks" value={fmtCount(st.clicks)} delta={seo!.deltas.clicks} />
          <Row label="Impressions" value={fmtCount(st.impressions)} delta={seo!.deltas.impressions} />
          <Row label="CTR" value={fmtPct(st.ctr, 2)} delta={seo!.deltas.ctr} />
          <Row
            label="Avg position"
            value={st.position != null ? st.position.toFixed(1) : "—"}
            delta={seo!.deltas.position}
            invert
          />
          {seo!.spark.clicks && seo!.spark.clicks.length > 1 && (
            <div className="spark-row">
              <Sparkline points={seo!.spark.clicks} />
            </div>
          )}
          {seo!.striking_distance.length > 0 && (
            <div className="wire-note">
              {seo!.striking_distance.length} queries in striking distance (pos 8–20)
            </div>
          )}
        </>
      ) : (
        <div className="wire-note">
          GSC · {seo?.status === "skipped" ? "waiting on Google OAuth — docs/marketing-setup.md §2" : seo?.error || "no data"}
        </div>
      )}

      {aeo && aeo.score !== null && aeo.score !== undefined && (
        <Row
          label="AEO readiness"
          value={`${Math.round(aeo.score)}/100`}
          verdict={aeo.verdict}
          sub={`FLOOR ${T ? Math.round(T.aeo_min_score) : 70} · ${aeo.ai_bots_allowed ?? "?"}/${aeo.ai_bots_total ?? "?"} BOTS${
            aeo.faq_schema === false ? " · NO FAQ SCHEMA" : ""
          }`}
        />
      )}
    </section>
  );
});

export default SearchAeo;
