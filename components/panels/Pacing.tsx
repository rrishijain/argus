"use client";

import { memo } from "react";
import type { Marketing } from "@/lib/vault";
import { fmtINR, fmtINRShort, fmtRoas } from "@/lib/format";
import { CountUp } from "./shared";

// ---------------------------------------------------------------------------
// Primary Directive · Budget Pacing — the one number a founder asks every
// morning. Month-to-date spend against the pro-rated monthly budget, with a
// "should-be-here" marker and the projected month-end. EST badge while the
// daily history is still filling (run-rate estimate).
// ---------------------------------------------------------------------------

const Pacing = memo(function Pacing({ m, hot }: { m: Marketing | null; hot?: boolean }) {
  const p = m?.pacing;
  if (!p) {
    return (
      <section className={`objective boot-stagger ${hot ? "voice-hot" : ""}`} style={{ animationDelay: "0.58s" }}>
        <div className="obj-label">Primary Directive · Budget Pacing</div>
        <div className="big">—</div>
        <div className="sub"><span>waiting on the first metrics pull</span></div>
      </section>
    );
  }
  const spendPct = p.budget ? Math.min((p.spend_mtd / p.budget) * 100, 100) : 0;
  const markPct = p.budget ? Math.min((p.expected_mtd / p.budget) * 100, 100) : 0;
  const over = p.status === "over";
  const under = p.status === "under";
  const roasBad = p.blended_roas_mtd !== null && p.blended_roas_mtd < p.breakeven_roas;
  return (
    <section className={`objective pacing ${over ? "over" : ""} boot-stagger ${hot ? "voice-hot" : ""}`} style={{ animationDelay: "0.58s" }}>
      <div className="obj-label">
        Primary Directive · Budget Pacing · {p.month_label}
        {p.estimated && <span className="est-tag">EST</span>}
      </div>
      <div className="big">
        <span className="currency">₹</span>
        <CountUp value={p.spend_mtd} format={fmtINR} />
        <span className="unit">MTD</span>
      </div>
      <div className="progress">
        <i style={{ width: `${spendPct}%` }} />
        <b className="pace-mark" style={{ left: `${markPct}%` }} title="where spend should be today" />
      </div>
      <div className="sub">
        <span>
          budget <b>{fmtINRShort(p.budget)}</b>
        </span>
        <span>
          day <b>{p.day}/{p.days_in_month}</b>
        </span>
        <span className={over ? "bad" : under ? "warn" : ""}>
          pace <b>{p.pace_pct !== null ? `${Math.round(p.pace_pct)}%` : "—"}</b>
        </span>
        <span className={over ? "bad" : ""}>
          projected <b>{fmtINRShort(p.projected_eom)}</b>
        </span>
        <span className={roasBad ? "bad" : ""}>
          roas mtd <b>{fmtRoas(p.blended_roas_mtd)}</b> vs be {p.breakeven_roas.toFixed(2)}
        </span>
      </div>
    </section>
  );
});

export default Pacing;
