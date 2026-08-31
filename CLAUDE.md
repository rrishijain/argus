# ARGUS (formerly ARGUS) — Claude Code instructions

## Onboarding trigger

**If `.argus-config.json` does NOT exist in the repo root**: this is a fresh
clone that has not been personalized. Before doing anything else:

1. **Install dependencies if needed.** If `node_modules/` is missing, run
   `npm install` (Node.js + the logged-in `claude` CLI are assumed present).
   This is a fresh-from-zip clone — the deps are never bundled.
2. Read `ONBOARD.md` and run the onboarding interview it describes — it walks
   the user through pointing the HUD at their vault, naming their metrics,
   picking voice options, and wiring the runner, then writes
   `.argus-config.json` to mark onboarding complete.

Do the install proactively without making the user ask — "set this up for me"
or simply opening Claude here should be enough. Do not skip onboarding even
for small asks; an unpersonalized clone half-works in confusing ways.

**If `.argus-config.json` exists**: onboarding is done. Treat its contents
as the user's choices and help with whatever they ask.

## Platform rule

Detect the user's OS and adapt every command, path, and launcher to it
without asking — .vbs launchers are Windows; Mac/Linux use the direct
commands (nohup/launchd/systemd). Voice on machines without an NVIDIA GPU
runs CPU mode (plain `onnxruntime`): slower, fully functional.

## "Spin up ARGUS" — the start-everything playbook

When the user asks to start/spin up/boot ARGUS (any phrasing), do this, in
order, skipping anything already running:

1. Voice server: probe `http://127.0.0.1:3108/health`. Down → launch
   `voice-server\start-voice-server.vbs` (Windows) or
   `voice-server/.venv/bin/python voice-server/server.py` detached. If the
   venv doesn't exist, say voice isn't set up yet (README has the section)
   and continue — the HUD runs fine silent.
2. Runner: check the heartbeat file `<vault>/system/runner-status.json`
   (stale > 2 min = down). Down → launch `runner\start-runner.vbs` or
   `node runner/runner.js` detached.
3. HUD: probe `http://localhost:3107`. Down → launch `start-hud.vbs`
   (Windows) or `npx next build && npx next start -p 3107` detached.
   IMPORTANT: launch DETACHED (the .vbs files, or Start-Process /nohup) —
   a plain background shell command dies when this Claude session closes.
4. Tell the user: open `http://localhost:3107`, hold Space to talk. Remind
   them the first audio needs one click/keypress in the tab (browser
   autoplay policy).

If the user asks to make any of this automatic at login: Windows → put
shortcuts to the three .vbs files in `shell:startup` (open with
`explorer shell:startup`); Mac → launchd plists; Linux → systemd user
units. Do the wiring for them when asked.

## Project facts

- Next.js 15 HUD on **:3107** (`npx next dev -p 3107`), Python voice-server
  on **:3108** (Kokoro TTS + faster-whisper STT), Node runner daemon in
  `runner/` that executes skills via headless `claude -p`.
- All state lives as plain files under the vault (`VAULT_ROOT`, defaults to
  `starter-vault/`). No database. The architecture one-pager is
  `docs/architecture.html`; the README has the short version.
- Quality gates: `npm test` (router sweep, no API spend) and
  `npx tsc --noEmit`. Run both after touching `lib/`.

## ARGUS marketing layer (added 2026-08-21)

- Single source of truth for numbers: `~/.claude/skills/metrics-pull/scripts/marketing_context.py`
  → `<vault>/system/metrics/marketing-latest.json` (HUD) and `context/<scope>-<range>d.json`
  (perf-report, report-deck). Verdicts/pacing are computed THERE, never in TS.
- Daily history CSVs under `system/metrics/history/` (90-day upsert) feed 30/90-day decks.
- Python for skills is **`/usr/bin/python3`** (3.9 — has python-pptx/jinja2). `~/.local/bin/python3` does not.
- Publishing skills (`ds-blog-publish`, `news-carousel`) run with `cwd` = the agent project
  (`SKILL_CWD` in runner.js), opus, daily caps from `system/publish-ledger.json`. Setup + token
  checklist: `docs/marketing-setup.md`.
- `news-carousel` is the ONE carousel agent (`rrishijainxCarousel-Final` → **@rrishijain**). The DS
  carousel agent was unwired on 2026-08-21; its project still sits on disk, unused. The publisher
  refuses to post unless the token's own handle matches `IG_EXPECTED_USERNAME` — if a run exits 3,
  fix the token, never the guard.
- **Images for both publishers come from KIE** (`https://api.kie.ai`, job flow
  createTask -> recordInfo -> download). Default model is **`nano-banana-2`**
  (8 credits, ~60-90s): the cheaper `google/nano-banana` at 4 credits stutters on
  long strings — it duplicated words on 7 of 8 slides of the firefly deck and
  hallucinated a fourth header token. Its request schema differs
  (`aspect_ratio`/`image_input`/`resolution` vs `image_size`/`image_urls`), so
  both scripts build the request through one model-aware function. One key,
  canonically `KIE_API_KEY`, in argus/.env AND each agent project's own .env —
  the agents load their own, so all three must carry it. Balance:
  `node scripts/generate_slides.mjs --credits` (carousel) or
  `python3 scripts/kie_image.py --credits` (ds-seo-agent).
  Carousel renders via `scripts/generate_slides.mjs`; portrait slides route to
  `google/nano-banana-edit` with his reference frames hosted on WP (cached in
  `assets/portrait-refs/.hosted.json`). Gemini stays as fallback in both —
  set `CAROUSEL_RENDERER=gemini` so verify_slides re-rolls on the same engine.
  Never put hex codes in an image prompt; models render them as literal text.
- Never test publishing with a live intent — say "as a draft" / pass `args.dry_run: true`.

## Competitor intel + bulk creatives (added 2026-08-31)

- `competitor-intel` (Publish deck; voice "competitor report on <brand>") → cwd =
  the competitor-xray project at `~/Desktop/Ai Resources - Most Important/Ai Agents/Zip Files/competitor-xray`
  (override `COMPETITOR_XRAY_DIR`). Its /xray pipeline needs APIFY_TOKEN +
  FIRECRAWL_API_KEY (env → ./.env → ~/.competitor-xray/.env) — NOT configured yet,
  so runs take PATH B (Apify/Semrush connectors + public builtwith/similarweb pages)
  until those keys exist. No-brand runs pick from `<vault>/ops/competitors.md`
  (seeded with upGrad). Report: `<vault>/inbox/reports/competitors/`.
- `bulk-creatives` (Publish deck; voice "make 10 ads for <offer>") → cwd =
  `ads-generator-kit` (override `ADS_KIT_DIR`). Writes `briefs/ads/<slug>.yaml`,
  renders via `python3 tools/build_ads.py` (Gemini key in the kit's own .env),
  args {topic, count 1-30 (default 6), dry_run = copy only, no images}. Picks one
  render skill per batch (sophisticated / coursib / best-performing / isaac);
  Vels MBA copy is governed by the kit's VelsMBS/anti-vels.md. Top 3 PNGs are
  copied to `<vault>/inbox/reports/creatives/`.
- Both are in DEDUPE_SKILLS (they spend real API credits — no double-fires).

## Voice tone + stop (added 2026-08-31)

- Persona is "sharp friend", not butler. It lives in THREE places that must stay
  in the same register: `AUTONOMOUS_PREFIX` (runner.js), the Voice line in
  `routerSystem()` and the `smalltalk()` replies (lib/router.ts).
- Stop speech: the ■ Stop Voice button (bottom-left, next to Transcript) and Esc
  both call `voice.stopAll()` — stop() locally plus a localStorage broadcast
  (`argus.voice.stop`) that silences EVERY tab, covering overlap from a tab that
  lost the speech lead mid-utterance.

## Engagement layer (added 2026-08-31)

- `lib/engagement.ts` computes streaks/quests/momentum/records from files the
  vault already writes (runs, publish-ledger, daily-note frontmatter + Daily
  Drivers, meta-daily.csv) — HUD-domain math in TS. Marketing verdicts STAY in
  `marketing_context.py`; engagement never judges a marketing number against a
  target. Bests persist in `system/engagement-records.json` (written only by
  the Next server, on improvement; first sight of a measure seeds silently —
  delete the file to re-seed without celebrations).
- Celebrations: `lib/celebrate.ts` is a PURE diff of consecutive same-day
  engagement snapshots; HUD primes the first snapshot and re-primes across
  midnight (runsPrimedRef pattern) so reloads/rollovers never fire. Tier
  minor = panel shimmer + chime; major/record also flare the WireCore bundle
  via the `celebrate` prop (seq+tier impulse) and speak ONE ambient line.
- Rishi rejected "momentum" and "quests" as UI concepts (2026-08-31): the
  engine still computes them (celebration diffs use quests), but NOTHING on
  the wall may display an invented composite score or the word "quests".
  Visible gamification stays concrete: streak dots + 🔥 count (TopBar),
  publish caps on Shipped, records/near-miss line, Daily Drivers checkboxes.
- Chimes (`lib/sound.ts`) are oscillator-only, drop (never queue) before the
  first user gesture, respect the voice lead lock, mute via `M` / ♪ button
  (`argus.sound.muted`). Demo keys: `6` major, `7` record celebration.

## Load-bearing couplings (break one and voice quietly misroutes)

- `ALLOWED_SKILLS` in `lib/skills.ts` ⟷ `buildPrompt()` cases in
  `runner/runner.js` ⟷ `DECK_GROUPS` in `components/panels/CommandDeck.tsx`
  ⟷ `SKILL_ALIASES` in `lib/router.ts` — all four must agree (deck buttons
  grey out automatically for skills the API doesn't accept).
- Offer wording in `briefingOffer()` (lib/router.ts) ⟷ `OFFER_SKILLS` keys
  ⟷ the regex in `pendingOffer()` — the spoken offer is parsed back out of
  conversation memory verbatim when the user answers "yes".
- `HUD_TZ` (lib/config.ts) ⟷ the runner's `HUD_TZ` — both default
  America/Chicago; change them TOGETHER or "today" splits across two dates.
- `.boot-stagger` CSS sections must never receive a second `animation` —
  it cancels `boot-in ... forwards` and blanks the panel. Overlays animate on
  pseudo-elements instead: `.voice-hot` owns `::before`, `.quest-flash` owns
  `::after` — keep new overlays off both.
- Any absolutely-centered element (`translate(-50%,-50%)`, e.g. `.sun-core`)
  needs keyframes that RESTATE the translate in every frame — a keyframe
  ending on `transform: none` with `forwards` fill wipes the centering.
- Publish caps: `DAILY_CAP` in runner/runner.js ⟷ `publishes` goals in
  `lib/engagement.ts` — the Shipped chips must show the caps the runner
  actually enforces.

## Editing gotchas

- After editing `runner/runner.js`, ALWAYS `node --check runner/runner.js`
  — the runner fails silently on syntax errors (stale heartbeat, no log).
- Testing `/api/voice` with a command phrase queues a REAL intent the
  runner will execute. Use tier-2 questions ("what's in the queue") for
  pipeline tests.
- Speech is cross-tab locked (`argus.voice.lead` in localStorage, lib/voiceClient.ts):
  only the tab you last touched talks, so extra tabs no longer double the
  audio. Browser autoplay still needs one click/keypress per tab.
- Run completions are coalesced: several runs landing together speak ONE
  line (`batchAnnouncement` in HUD.tsx); voice-ask answers stay individual
  and rank as replies, so asking something cuts off background chatter.
- Voice/accent live in voice-server: `KOKORO_VOICE` + `KOKORO_SPEED`
  (+ optional `KOKORO_LANG`; accent otherwise follows the voice prefix —
  b=en-gb, a=en-us). `python voice-server/make_samples.py` re-auditions.
- Next dev can hang after webpack cache corruption: kill node on 3107,
  delete `.next/`, restart.
