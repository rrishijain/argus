import { NextResponse } from "next/server";
import { ALLOWED_SKILLS, writeIntent } from "@/lib/skills";

// ---------------------------------------------------------------------------
// POST /api/queue {skill, args?} — drops an intent JSON into system/queue/.
// The runner daemon picks it up from system/queue/ within seconds.
// This is the "buttons are real" part. Skill list + intent
// shape live in lib/skills.ts (shared with /api/voice).
// ---------------------------------------------------------------------------

export const dynamic = "force-dynamic";

// args the deck/voice may pass; everything else is dropped. The runner
// re-validates (argScope/argRange/modelFor) — this is the first gate, not the
// only one.
const SCOPES = new Set(["meta", "google", "seo", "blended"]);
const RANGES = new Set([7, 30, 90]);
const MODELS = new Set(["claude-opus-4-8", "claude-fable-5", "claude-sonnet-4-6", "claude-haiku-4-5-20251001"]);

function cleanArgs(raw: unknown): Record<string, unknown> {
  if (!raw || typeof raw !== "object") return {};
  const a = raw as Record<string, unknown>;
  const out: Record<string, unknown> = {};
  if (typeof a.scope === "string" && SCOPES.has(a.scope)) out.scope = a.scope;
  if (RANGES.has(Number(a.range))) out.range = Number(a.range);
  if (typeof a.model === "string" && MODELS.has(a.model)) out.model = a.model;
  if (typeof a.topic === "string" && a.topic.trim()) out.topic = a.topic.trim().slice(0, 200);
  if (typeof a.brand === "string" && a.brand.trim()) out.brand = a.brand.trim().slice(0, 120);
  const n = Number(a.count);
  if (Number.isInteger(n) && n >= 1 && n <= 30) out.count = n;
  if (a.dry_run === true) out.dry_run = true;
  return out;
}

export async function POST(req: Request) {
  let body: { skill?: string; args?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "bad json" }, { status: 400 });
  }

  const skill = String(body.skill ?? "");
  if (!ALLOWED_SKILLS.has(skill)) {
    return NextResponse.json({ error: `unknown skill: ${skill}` }, { status: 400 });
  }

  try {
    const args = cleanArgs(body.args);
    const id = writeIntent(skill, "vault-hud", args);
    return NextResponse.json({ ok: true, id, skill, args });
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}
