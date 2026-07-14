# Corporate Wars — Game Requirements Document

**Genre:** Browser-based skill/timing "slap and run" arcade game
**Status:** Ready for build
**Audience for this doc:** An AI or developer building the full, finished game from this spec alone.

---

## 1. One-Line Pitch

You play a fed-up employee slapping coworkers in a corporate hallway before security catches you — a fast, skill-based timing game where different targets (colleagues, managers, HR) carry different risk and reward, and the world occasionally throws in a surprise twist generated live by an LLM.

---

## 2. Hard Platform Constraints (non-negotiable)

These override any convenience shortcut taken elsewhere in this doc:

1. **Runs fully in the browser.** The hosted URL opens directly into the game. No install, no login, no wallet/crypto, no local server, no external controller/app required to play.
2. **Click or keyboard first.** Every core interaction must be doable with mouse clicks and/or keyboard. **No drag controls anywhere** (no drag-to-aim, drag-to-move, drag-to-slap).
3. **Playable at ~2-second reaction time.** A slow player must still understand the loop, keep playing, and score *something*, even while performing poorly. The game must never punish slowness with a hard stop, soft-lock, or incomprehensible state.
4. **First 60–90 seconds must be impressive.** Strong visuals, motion, juicy feedback, sound, and a real sense of "game feel" from the first few seconds — not after a tutorial wall.
5. **This must be an actual game loop** — a real start → play → escalate → end → retry cycle, not a tech demo or a single static interaction.

Everything below is designed to satisfy these five constraints explicitly; see Section 19 for a checklist mapping requirements back to these five points.

---

## 3. Tech Stack (recommended, not mandatory)

- **Rendering/engine:** Phaser 3 (canvas/WebGL 2D engine) — handles sprites, animation, timers, and input cleanly and loads fast in-browser.
- **Language:** TypeScript or plain JS, bundled with Vite for fast build + small output.
- **Hosting:** Any static host (Vercel, Netlify, GitHub Pages, Cloudflare Pages, S3). The game itself is 100% static/client-side.
- **LLM proxy backend:** One small serverless function (Vercel/Cloudflare Worker/Netlify Function) that holds the LLM API key and forwards requests. This is *not* a "local server" the player runs — it's invisible infrastructure behind the hosted URL, so it does not violate Constraint #1.
- **Persistence:** `localStorage` only, for high score / settings. No accounts, no database, no login — satisfies "no login/wallet" while still giving players a reason to replay.

---

## 4. Core Game Loop

```
START SCREEN → PLAY (timed run, e.g. 90–120s) → SUMMARY/SCORE SCREEN → RETRY or QUIT
```

During PLAY:
1. Targets (coworkers) appear at fixed positions along a hallway/office scene.
2. Each target telegraphs, then becomes "vulnerable" for a limited window.
3. Player slaps a vulnerable target via click or a mapped key.
4. Correct hits score points and build a combo multiplier; wrong timing or wrong target has consequences (see Section 9).
5. A **Suspicion Meter** rises with risky/reckless play; hitting max ends the run early ("Security is onto you").
6. Roughly once per 60 seconds of active play, a **novelty event** (LLM-generated or fallback) alters the run temporarily.
7. Run ends when the timer expires or the Suspicion Meter maxes out — whichever comes first.
8. Score screen shows final score, best combo, and high score (from localStorage), with a one-click "Play Again."

---

## 5. Controls

| Action | Keyboard | Mouse/Click |
|---|---|---|
| Switch/select lane | `1` `2` `3` `4` `5` or `←` `→` to cycle | Click directly on a target/lane |
| Slap | `Space` (slaps whichever lane is currently selected/hovered) | Click on the vulnerable target |
| Pause | `Esc` | Pause button (always visible, top corner) |
| Restart (from summary screen) | `Enter` | "Play Again" button |

No drag gestures exist anywhere in the input model. Movement is **lane-based, not free-scrolling** — this is what keeps controls click/keyboard-first and avoids needing drag entirely (see Section 6).

---

## 6. World & Movement Design

To satisfy "no drag" and "playable at slow reaction time" simultaneously, avoid free 2D movement. Instead:

- The scene is a hallway/office with **3–5 fixed lanes** (e.g., cubicle openings or doorways), each able to hold one target at a time.
- The player does **not** need to physically walk to a lane in real time — lane switching is instant (keypress or click), so switching is a *decision*, not a *reflex test*. This keeps the game legible for slow-reaction players: they are never penalized for the time it takes to move, only for the timing of the final slap.
- Skill expression comes from **which lane to commit to and when**, not from movement precision.

---

## 7. Targets / Characters

| Character | Base Points | Vulnerable Window | Risk/Behavior |
|---|---|---|---|
| Colleague | 10 | 1.8–2.2s (generous) | No penalty on miss or wrong timing. Always present as a "safe" scoring option — this is the target a slow-reaction player leans on to keep enjoying the loop. |
| Manager | 50 | 1.0–1.4s | Occasionally "counters" — a mistimed slap costs a small combo penalty (no run-ending effect). |
| HR | 150 | 0.6–0.9s | High reward, but **any hit** (successful or not) raises the Suspicion Meter significantly. Punishes carelessness, not slowness. |
| Intern (wildcard) | 20, erratic timing | Variable, randomized each spawn | Adds unpredictability without adding real risk — good for combo-building once players are warmed up. |
| CEO (rare spawn, ~1 per run) | 400+ | 0.4–0.6s (skill ceiling) | Very hard to hit, no penalty on miss. Purely a bonus for skilled/fast players — never required to enjoy the run. |

Design principle: **misses are free** for everyone except HR. The only way to end a run early is reckless HR-slapping, not slow reflexes. This directly satisfies the "2-second reaction time" constraint — a slow player can ignore Managers/HR entirely, farm Colleagues, and still have a complete, comprehensible, non-punishing run.

---

## 8. Slap Mechanic & Timing Windows

Each target follows this state machine:
```
IDLE (not on screen)
  → TELEGRAPH (300–500ms wind-up animation, e.g. a door starts to open, a head starts to turn)
    → VULNERABLE (hittable window — duration per Section 7 table)
      → RESOLVED (hit = score + effect; timeout = target leaves, no penalty except HR)
```

**Why the telegraph phase matters for accessibility:** it turns the interaction from *pure reaction* into *anticipation*. A player with slow reflexes can watch for the wind-up and prepare to act, rather than needing to react instantly to a sudden appearance. This is the single most important accessibility mechanism in the game and must not be cut for "juice" reasons.

---

## 9. Scoring, Combo & Suspicion Meter

- **Combo multiplier:** increases by +0.1x per consecutive successful hit (any target), resets to 1x on a miss (except misses on Colleagues, which are fully free — see below) or on any HR mishandling.
  - *Slow-player carve-out:* missing a Colleague does not reset combo. Only mistimed Manager/HR hits and HR overuse reset it. This means a cautious, slow player can still build and keep a modest combo indefinitely.
- **Suspicion Meter:** 0–100. Rises only from HR interactions (successful HR slap: +15; failed/mistimed HR slap: +25). Decays slowly over time (−1/sec) if the player leaves HR alone. Hitting 100 ends the run ("Security escorts you out").
- **Score popups:** every hit shows a floating "+N" with combo multiplier shown alongside (e.g., "+150 x2.3").

---

## 10. Difficulty Curve / Escalation

- 0:00–0:20 — Only Colleagues spawn, generous windows. Pure onboarding.
- 0:20–0:45 — Managers introduced. First novelty event fires here (see Section 12) using a **pre-scripted fallback event**, not a live LLM call, to guarantee the "world reacts" hook lands inside the impressive first-90-seconds window without depending on network latency.
- 0:45 onward — HR appears, Interns appear, spawn rate/density increases gradually, vulnerable windows shrink slightly per target type as elapsed time increases (cap the shrink — never make Colleague windows drop below ~1.5s, to preserve the accessibility floor).
- Real LLM-driven novelty events begin at the ~60s mark and continue roughly once per 60 seconds of active play thereafter.
- CEO rare spawn appears once, randomly, after the 45s mark.

---

## 11. Accessibility: Slow Reaction Time Requirement (explicit)

Concrete rules to guarantee a ~2-second-reaction player still has a complete, enjoyable run:

- No target type ever causes a run-ending penalty on miss — only reckless HR engagement does.
- Colleague windows never drop below 1.5 seconds, at any difficulty tier, for the entire run.
- The telegraph/wind-up phase is always present and never skipped, even at max difficulty.
- The run has a fixed time budget (90–120s) regardless of score — a slow player still gets a full, unhurried match, not an early forced game-over from poor performance.
- Nothing is timed so tightly that a slow player cannot mentally follow *what just happened and why their score changed*. Every scoring event has a clear, readable visual + text callout.

---

## 12. First 60–90 Seconds Requirement (onboarding & "wow" factor)

- **Load time budget:** playable within ~3 seconds on a normal connection. No long asset-heavy splash screens — this time counts against the "impressive first 90 seconds," so keep it fast.
- **No tutorial text wall.** Teach through a single short on-screen prompt during the first Colleague spawn only (e.g., "Click the glowing target!"), which disappears permanently after the first successful hit.
- **Immediate juice on first hit:** screen shake, particle burst (papers flying), impact sound, floating score number, combo counter appearing — all within the very first successful slap.
- **Ambient life before the player acts:** idle animations, background hallway motion (people walking past, blinking office lights, a ceiling fan) so frame one already feels alive, not static.
- **First novelty event lands by ~30–45s** (via scripted fallback, per Section 10) so the "the game surprises you" hook is felt well inside the 90-second window, without waiting on real LLM latency.
- **Audio:** must start on first user input (click/keypress), never autoplay on load — browsers block unprompted audio, and this must be handled gracefully rather than causing a silent, dead-feeling first impression.

---

## 13. Visual & Audio Feedback Requirements

- Comedic, exaggerated "impact" feedback on every slap: screen flash, squash/stretch on the target sprite, a burst of office-themed particles (papers, coffee splashes, sticky notes).
- Distinct sound cue per target type (a different "smack" pitch/tone for Colleague vs Manager vs HR) so players get audio feedback on *what* they hit without needing to look at the score.
- Suspicion Meter should visually pulse/redden as it approaches max, with an audio cue (heartbeat or alarm tick) that escalates — gives players an intuitive, non-numeric sense of danger.
- Combo counter should visibly grow (font size or color shift) as it climbs, to make streaks feel rewarding.

---

## 14. UI / HUD

Always visible during PLAY:
- Score (top left)
- Time remaining (top center)
- Suspicion Meter bar (top right, color-shifts green → yellow → red)
- Current combo multiplier (near score)
- A subtle, small toast/banner area for novelty-event announcements (e.g., "⚠️ Fire Drill! Spawn rate up for 20s") — must not block gameplay.

Start screen: Title, "Play" button, best score (if any, from localStorage), brief one-line control reminder.

Summary screen: Final score, best combo achieved, high score comparison, "Play Again" button, no login/share requirement.

---

## 15. LLM Novelty Layer

### 15.1 Cadence
One live LLM call per ~60 seconds of **active play time** (pause the cadence timer while paused). First real call fires at ~60s mark; before that, use scripted fallback events (Section 10/12) so early impressiveness never depends on API latency.

### 15.2 Architecture
```
Browser (game client)
   → POST /api/novelty-event  { score, elapsedSec, difficultyTier, recentEventTypes[] }
Serverless proxy (holds API key, never exposed to client)
   → calls LLM with strict system prompt, JSON-only response required
   → validates response against schema below
   → returns validated JSON (or a local fallback event if invalid/timeout)
Browser
   → applies event, shows toast, schedules its expiry
```

**Never call the LLM directly from the browser** — the API key must live only in the serverless function.

### 15.3 Required JSON schema (LLM response contract)

```json
{
  "event_type": "spawn_modifier | score_modifier | hazard_toggle | flavor_only",
  "duration_sec": 15,
  "params": { "spawn_rate_multiplier": 1.5, "target_type": "manager" },
  "flavor_text": "Quarterly review just dropped — managers are everywhere.",
  "rarity": "common"
}
```
- `event_type` must be one of the enumerated values only — reject anything else.
- `flavor_text` capped at ~140 characters, HTML-escaped before rendering (never trust it, treat as untrusted user-facing string).
- `params` shape is validated per `event_type` (define a small per-type schema; reject and fall back if shape doesn't match).

### 15.4 Fallback pool (mandatory)
Ship at least 8–10 hardcoded local events in the game bundle. If the LLM call fails, times out (hard cap ~2.5s), or fails schema validation, silently substitute a random fallback event — the player should never perceive a stall or an error.

### 15.5 Prompting guidance
- Feed the LLM current score, elapsed time, difficulty tier, and recently-used event types so it can escalate sensibly and avoid repeats.
- System prompt should constrain tone (office comedy, PG, no real people/brands/political content) and enforce JSON-only output with no preamble or markdown fences.
- Keep `max_tokens` small (~150) — this call happens repeatedly across all sessions, so cost scales with call volume.

### 15.6 Cost/scaling note (optional, worth flagging to whoever builds this)
If concurrent players are expected to be numerous, consider generating **one shared/global event per 60s server-side** (rather than one per individual player session) and broadcasting/polling it to all active clients — cuts LLM call volume from O(players) to O(1) per minute. Not required for an MVP with modest traffic, but worth designing the proxy endpoint so this swap is easy later.

---

## 16. Game States

`BOOT → START_SCREEN → PLAYING ⇄ PAUSED → RUN_END_SUMMARY → (retry) START_SCREEN`

Each state must be reachable via keyboard alone (no mouse-only dead ends) to keep the "click or keyboard first" constraint true at every screen, not just during PLAY.

---

## 17. Suggested Project Structure

```
/src
  /scenes      (Boot, StartScreen, Play, Summary)
  /entities    (Target base class + Colleague/Manager/HR/Intern/CEO subclasses)
  /systems     (ScoringSystem, SuspicionSystem, SpawnSystem, NoveltyEventSystem)
  /data        (fallbackEvents.json, targetConfig.json)
  /ui          (HUD components)
/api
  novelty-event.ts   (serverless proxy function)
/public
  /assets      (sprites, sfx, background art)
```

---

## 18. Non-Goals / Out of Scope

- Multiplayer or leaderboards requiring a backend database.
- User accounts, login, or any wallet/crypto integration.
- Native mobile app builds (mobile *browser* play is a nice-to-have, not required — see Section 20).
- Monetization, ads, or in-app purchases.
- Drag-based input of any kind.

---

## 19. Acceptance Criteria (Definition of Done)

- [ ] Hosted URL opens directly into a playable game — zero installs, logins, wallets, local servers, or external controllers.
- [ ] Every action achievable via click and/or keyboard; no drag interaction exists anywhere.
- [ ] A player consistently missing timing windows can still play a full run, score >0 points, and never hits an incomprehensible or broken state.
- [ ] From cold load, a new player sees strong visual motion, at least one juicy hit effect, and one novelty-event toast within the first 90 seconds.
- [ ] A complete start → play → end → retry loop exists and works without page reload.
- [ ] LLM novelty events never block or stall gameplay (fallback pool always available; timeout enforced).
- [ ] API key for the LLM is never exposed in client-side code.
- [ ] Game is playable start-to-finish with sound muted (no critical info conveyed by audio alone).

---

## 20. Open Assumptions (defaults chosen so the builder isn't blocked — flag if wrong)

- Run length defaults to 100 seconds; adjustable via a config constant.
- Desktop browser is the primary target; touch/tap-as-click support on mobile browsers is a nice-to-have, not a requirement, since only click/keyboard were specified.
- "LLM" for the novelty layer is assumed to be an Anthropic Claude model called via the serverless proxy described in Section 15; swap-compatible with any JSON-capable chat completion API.
- No specific visual art style was mandated — a bright, slightly cartoonish office theme is assumed to best support the "impressive first 90 seconds" and comedic slap feedback.
