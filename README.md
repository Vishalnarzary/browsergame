# Corporate Wars

A complete browser arcade game with a perspective-rendered office, three click/keyboard lanes, escalating targets, combo scoring, suspicion, procedural sound, local high scores, novelty events, and a 100-second start-to-retry loop.

The current run-and-slap design adds precision grades, a Focus meter and score-doubling Flow State, mail-cart obstacles, espresso pickups, escalating formation waves, and role-specific timing windows.

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

- The employee runs forward automatically.
- Click a lane, or press `1`–`3`, to move into it.
- Use `←` / `→` to switch lanes and `Space` to slap when a target reaches the glowing zone.
- Press `Esc` to pause or resume.
- Press `Enter` to start or replay.

## Verify

```bash
npm run build
npm test
```
