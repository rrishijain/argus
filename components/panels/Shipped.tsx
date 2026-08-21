"use client";

import { memo } from "react";
import type { ShippedEntry } from "@/lib/vault";
import { fmtAge } from "@/lib/format";
import { SectionTitle } from "./shared";

// ---------------------------------------------------------------------------
// Shipped — everything the system produced that you can open: reports in the
// vault, decks, live blog posts and carousels (rows with a `link:` jump out).
// ---------------------------------------------------------------------------

const Shipped = memo(function Shipped({
  items,
  hot,
  onOpen,
}: {
  items: ShippedEntry[];
  hot?: boolean;
  onOpen: (path: string) => void;
}) {
  if (items.length === 0) return null;
  const week = items.filter((s) => s.ts && Date.now() - Date.parse(s.ts) < 7 * 86_400_000).length;
  return (
    <section className={`block boot-stagger ${hot ? "voice-hot" : ""}`} style={{ animationDelay: "0.42s" }}>
      <SectionTitle title="Shipped" tick={`${week} · 7D`} />
      {items.slice(0, 5).map((s) => {
        const name = (s.label ?? s.skill).replace(/-/g, " ").replace(/^ds /, "");
        const host = s.link ? s.link.replace(/^https?:\/\/(www\.)?/, "").split("/")[0] : null;
        return (
          <div
            className="doc-row"
            key={s.id}
            role="button"
            onClick={() => (s.link ? window.open(s.link, "_blank", "noopener") : onOpen(s.deliverable_path))}
            title={s.link ?? s.deliverable_path}
          >
            <span className="doc-skill">
              {name}
              {host && <span className="ext"> · {host} ↗</span>}
            </span>
            <span className="doc-age">{fmtAge(s.ts).label}</span>
          </div>
        );
      })}
    </section>
  );
});

export default Shipped;
