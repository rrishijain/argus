"use client";

import { memo } from "react";
import type { Marketing, PaidChannel } from "@/lib/vault";
import { deltaGood, fmtAge, fmtDelta, fmtINR, fmtINRShort, fmtPct, fmtRoas } from "@/lib/format";
import { CountUp, SectionTitle, Sparkline, verdictCls } from "./shared";

// ---------------------------------------------------------------------------
// Paid Media — the money panel. Spend hero + four KPI tiles coloured against
// ops/targets.md. Every number comes pre-verdicted from marketing-latest.json;
// this component only renders. Meta first; Google rows appear once that
// channel reports.
// ---------------------------------------------------------------------------

function Tile({
  label,
  value,
  verdict,
  delta,
  invert,
  target,
  spark,
}: {
  label: string;
  value: string;
  verdict?: string;
  delta?: number | null;
  invert?: boolean;
  target?: string;
  spark?: (number | null)[];
}) {
  const good = deltaGood(delta, invert);
  return (
    <div className={`kpi ${verdictCls(verdict)}`}>
      <span className="kpi-label">{label}</span>
      <span className="kpi-value">{value}</span>
      <span className={`kpi-delta ${good === null ? "zero" : good ? "" : "neg"}`}>{fmtDelta(delta)}</span>
      {target && <span className="kpi-target">{target}</span>}
      {spark && spark.length > 1 && <Sparkline points={spark} className="kpi-spark" />}
    </div>
  );
}

function channelTick(ch: PaidChannel, name: string): { text: string; cls: string } {
  const age = fmtAge(ch.ts);
  if (ch.status === "skipped") return { text: `${name} · NOT WIRED`, cls: "dim" };
  if (ch.status === "error") return { text: `${name} · ERROR`, cls: "bad" };
  const accts =
    ch.accounts_total && ch.accounts_total > 1 ? ` · ${ch.accounts_ok}/${ch.accounts_total} ACCTS` : "";
  const st = ch.status === "partial" ? " · PARTIAL" : age.stale ? " · STALE" : "";
  return { text: `${name}${accts}${st} · ${age.label}`, cls: ch.status === "partial" || age.stale ? "warn" : "" };
}

const PaidMedia = memo(function PaidMedia({ m, hot }: { m: Marketing | null; hot?: boolean }) {
  const meta = m?.channels.meta;
  const google = m?.channels.google;
  const T = m?.targets;
  const t = meta?.totals;
  const tick = meta ? channelTick(meta, "META") : { text: "WAITING ON PULL", cls: "dim" };
  const leadGen = !!t && (t.leads ?? 0) > 0 && !(t.purchases ?? 0);
  const days = meta?.window?.days ?? 7;

  return (
    <section className={`block boot-stagger ${hot ? "voice-hot" : ""}`} style={{ animationDelay: "0.1s" }}>
      <SectionTitle title="Paid Media" tick={tick.text} tickCls={tick.cls} />
      {!m || !t ? (
        <div className="prio dim">
          {m?.channels.meta.status === "skipped"
            ? "Meta not wired — see docs/marketing-setup.md"
            : "no paid data yet — run Pull Data"}
        </div>
      ) : (
        <>
          <div className="vital spend-hero">
            <span className="label">
              <i className={`status-dot ${meta!.status !== "ok" ? (meta!.status === "partial" ? "stale" : meta!.status) : ""}`} />
              Spend · {days}d
            </span>
            <span className="value">
              <span className="currency">₹</span>
              <CountUp value={t.spend} />
            </span>
            <span className={`delta ${deltaGood(meta!.deltas.spend) === null ? "zero" : ""}`}>
              {fmtDelta(meta!.deltas.spend)} vs prior · rev {fmtINRShort(t.revenue)}
            </span>
            <div className="spark-row">
              <Sparkline points={meta!.spark.spend ?? []} />
            </div>
          </div>

          <div className="kpi-grid">
            <Tile
              label="ROAS"
              value={fmtRoas(t.roas)}
              verdict={meta!.verdicts.roas}
              delta={meta!.deltas.roas}
              target={T ? `BE ${T.breakeven_roas.toFixed(2)} · TGT ${T.target_roas.toFixed(1)}` : undefined}
              spark={meta!.spark.revenue}
            />
            {leadGen ? (
              <Tile
                label="CPL"
                value={t.cpl ? `₹${fmtINR(t.cpl)}` : "—"}
                verdict={meta!.verdicts.cpl}
                delta={meta!.deltas.cpl}
                invert
                target={T ? `TGT ₹${fmtINR(T.target_cpl)}` : undefined}
              />
            ) : (
              <Tile
                label="CPA"
                value={t.cpa ? `₹${fmtINR(t.cpa)}` : "—"}
                verdict={meta!.verdicts.cpa}
                delta={meta!.deltas.cpa}
                invert
                target={T ? `TGT ₹${fmtINR(T.target_cpa)} · MAX ₹${fmtINR(T.max_cpa)}` : undefined}
              />
            )}
            <Tile
              label="CTR"
              value={fmtPct(t.ctr, 2)}
              verdict={meta!.verdicts.ctr}
              delta={meta!.deltas.ctr}
              target={T ? `FLOOR ${T.min_ctr.toFixed(1)}%` : undefined}
              spark={meta!.spark.clicks}
            />
            <Tile
              label={leadGen ? "Leads" : "Sales"}
              value={fmtINR(t.results ?? 0)}
              delta={meta!.deltas.results}
              target={t.frequency ? `FREQ ${t.frequency.toFixed(2)}${T ? ` / ${T.max_frequency.toFixed(1)}` : ""}` : undefined}
              verdict={t.frequency && T && t.frequency > T.max_frequency ? "red" : undefined}
              spark={meta!.spark.purchases}
            />
          </div>

          {google && google.totals && (
            <div className="vital google-row">
              <span className="label">
                <i className={`status-dot ${google.status !== "ok" ? google.status : ""}`} />
                Google · {google.window?.days ?? days}d
              </span>
              <span className="value sm">
                <span className="currency">₹</span>
                {fmtINR(google.totals.spend)}
              </span>
              <span className="delta zero">
                CPA {google.totals.cpa ? `₹${fmtINR(google.totals.cpa)}` : "—"} · CTR {fmtPct(google.totals.ctr, 2)}
                {google.totals.impression_share != null ? ` · IS ${fmtPct(google.totals.impression_share * 100, 0)}` : ""}
              </span>
            </div>
          )}
          {google && google.status === "skipped" && (
            <div className="wire-note">Google Ads · waiting on OAuth — docs/marketing-setup.md §1</div>
          )}
        </>
      )}
    </section>
  );
});

export default PaidMedia;
