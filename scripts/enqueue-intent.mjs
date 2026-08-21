#!/usr/bin/env node
// enqueue-intent.mjs <skill> ['{"scope":"blended","range":7}'] [source]
// Drops an intent into <vault>/system/queue exactly like lib/skills.ts
// writeIntent(), so launchd/cron jobs show up on the wall and get spoken like
// any other run. No deps — reads VAULT_ROOT from ~/.claude/.env.
import { randomUUID } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

const [, , skill, argsJson = "{}", source = "launchd"] = process.argv;
if (!skill) {
  console.error("usage: enqueue-intent.mjs <skill> [argsJSON] [source]");
  process.exit(1);
}
let vault = process.env.VAULT_ROOT || process.env.AGENTIC_OS_VAULT;
const envPath = join(homedir(), ".claude", ".env");
if (!vault && existsSync(envPath)) {
  for (const raw of readFileSync(envPath, "utf8").split(/\r?\n/)) {
    const m = raw.match(/^(VAULT_ROOT|AGENTIC_OS_VAULT)=(.+)$/);
    if (m && !vault) vault = m[2].trim().replace(/^["']|["']$/g, "");
  }
}
if (!vault) {
  console.error("VAULT_ROOT not set");
  process.exit(1);
}
const args = JSON.parse(argsJson);
const id = randomUUID();
const dir = join(vault, "system", "queue");
mkdirSync(dir, { recursive: true });
writeFileSync(join(dir, `${id}.json`), JSON.stringify({ id, skill, args, ts: new Date().toISOString(), source }, null, 2));
console.log(JSON.stringify({ ok: true, id, skill, args }));
