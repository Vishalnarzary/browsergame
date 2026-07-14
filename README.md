# Corporate Wars

A complete WebGL 3D browser arcade game with a long-view office corridor, three click/keyboard lanes, escalating targets, combo scoring, suspicion, procedural sound, local high scores, novelty events, and an endless run that continues until suspicion reaches 100%.

The player is the only automatic runner. Rounded human characters have faces, hands, hair, and layered clothing, while large high-contrast overhead labels identify each employee from the long camera view. Every employee appears alone, working at a desk, using a phone, presenting, or gesturing. Line up early to approach from behind for a clean hit. A late side hit creates a pursuing employee with a glowing red, steaming head; sprinting opens a safe gap, while braking lets the chase close in. Change lanes late to bait a pursuer into a mail cart. The game also includes Focus, score-doubling Flow State, espresso pickups, formation waves, rotating contracts, badges, and persistent career ranks.

Generated speech bubbles update live on already-spawned 3D employees. When an employee is hit, their desk, chair, monitor, phone, presentation board, and other activity props disappear on the same impact frame instead of lingering behind the reaction animation.

Replay progression is built around skill and player choice. Before each run, choose Route Planner for a wider clean-hit commitment window, Pace Setter for higher sprint speed, or Cart Trickster for stronger bait rewards. During the run, a live personal-best pace indicator and combo mastery milestones create clear improvement targets. Daily briefings reward two completed contracts with bonus XP but never punish missed days, while every three banked contracts awards a mastery bonus. The shift report grades the route and previews the next contract so every replay has a concrete goal.

Five glowing 3D power-ups add route decisions: Titan Crush grows the hero and clears two lanes, Distance Laser automatically fires down the selected lane, Long-Leg Kick attacks across two lanes, Phase Shift passes through obstacles and pursuers, and Echo Clone covers the mirrored lane. The server asks Groq for a strict structured batch of one to four drops at the start of each minute. Groq decides every drop's kind, lane, spawn time, pickup window, active duration, and rarity; validated local batches keep the mechanic playable if the API is unavailable.

A Groq request starts immediately with every run and repeats at 30-second intervals, returning exactly seven lightly funny office sentences with at least one motivational quote. One randomly selected distant employee displays one queued line at a time; the next employee receives the next line six seconds later. A persistent device history, client filtering, server validation, and explicit prompt context prevent repeats. A large combinatorial local generator preserves the same seven-line, one-motivation format whenever Groq is rate-limited or unavailable, while the scheduled API calls continue normally.

Every normal slap randomly selects one of three stylized 3D reactions: a high off-screen full-body launch, a detached-arm fall, or a double-leg-detachment launch with bone-shard particles. The supplied running recording loops throughout each active run, follows the runner's pace, pauses with the game, and respects the sound toggle. The game randomly alternates between `public/audio/slap1.mp3` and `public/audio/slap2.mp3`, and uses `public/audio/bone-break.mp3` for either break reaction. Power-up attacks use the same supplied impact layer, with Long-Leg Kick also triggering the break sound. If any impact clip is absent, a synthesized slap or crack plays automatically instead.

## Play locally

Requires Node.js 22.13 or newer.

```bash
npm install
npm run dev
```

## Live AI direction

The game is fully playable without an API key and silently uses bundled fallbacks. For live generated events, AI-directed power-up drops, and fresh funny office chatter every 30 seconds, copy `.env.example` to `.env.local`, set `GROQ_API_KEY`, and optionally change `GROQ_MODEL` or `GROQ_CHATTER_MODEL`.

The secrets are read only by server routes under `app/api`. They are never sent to the browser. Requests have a short timeout, structured JSON schemas, server-side validation, and automatic in-game fallbacks.

## Deploy with Vercel

Import the GitHub repository into Vercel and keep the root directory as the repository root. The included Vercel configuration selects Next.js and runs the verified `npm run vercel-build` command. Before deploying, add `GROQ_API_KEY` as a sensitive environment variable and set `GROQ_MODEL` and `GROQ_CHATTER_MODEL` to `openai/gpt-oss-20b`. Apply them to Production and Preview, then deploy. Future pushes to `main` automatically create production deployments.

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
