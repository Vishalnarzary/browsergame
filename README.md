# Corporate Wars

A complete WebGL 3D browser arcade game with a long-view office corridor, three click/keyboard lanes, escalating targets, combo scoring, suspicion, procedural sound, local high scores, novelty events, and a 100-second start-to-retry loop.

The player is the only automatic runner. Rounded human characters have faces, hands, hair, layered clothing, and role badges printed directly on their shirts instead of floating labels. Employees work at desks, talk in groups, use phones, and present around the office. Line up early to approach from behind for a clean hit. A late side hit creates a pursuing employee who follows your lane; change lanes late to bait that pursuer into a mail cart. The game also includes Focus, score-doubling Flow State, espresso pickups, formation waves, rotating contracts, badges, and persistent career ranks.

## Play locally

Requires Node.js 22.13 or newer.

```bash
npm install
npm run dev
```

## Groq novelty events

The game is fully playable without an API key and silently uses ten bundled events. For live generated events, copy `.env.example` to `.env.local`, set `GROQ_API_KEY`, and optionally change `GROQ_MODEL`.

The secret is read only by `app/api/novelty-event/route.ts`. It is never sent to the browser. Requests have a short timeout, strict JSON schema, server-side validation, and an automatic in-game fallback.

## Controls

- The hero runs forward and slaps automatically.
- Click a lane, or press `1`–`3`, to move into it.
- Use `←` / `→` or `A` / `D` to switch lanes.
- Hold `W` to sprint and hold `S` to brake. The pace changes smoothly rather than snapping.
- Press `Space` during a run to jump office tables for a vault bonus.
- Choose a target lane while it is far away for a clean back hit. Cutting in late causes a side hit and starts a chase.
- Pursuers change lanes more slowly than the hero. Leave a mail cart in their lane to score a tactical bait.
- Automatic slaps use a full arm follow-through, a brief impact pause, expanding rings, particles, and layered impact audio.
- Press `Esc` to pause or resume.
- Press `Enter` to start or replay.

## Verify

```bash
npm run build
npm test
```
