"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { OfficeRunner3D, type OfficeActivity, type PowerupKind, type SceneFrame } from "./OfficeRunner3D";

type Screen = "start" | "playing" | "paused" | "summary";
type TargetType = "colleague" | "manager" | "hr" | "intern" | "ceo";
type EventType = "spawn_modifier" | "score_modifier" | "hazard_toggle" | "flavor_only";

type Target = {
  id: number;
  lane: number;
  type: TargetType;
  z: number;
  seed: number;
  activity: OfficeActivity;
  cleanLine: boolean;
  alignedAtZ?: number;
  resolved: boolean;
  hitMode?: "back" | "side";
  hitAt?: number;
};

type RunnerItem = {
  id: number;
  lane: number;
  z: number;
  type: "cart" | "coffee" | "table";
  resolved: boolean;
  passedPlayer: boolean;
};

type Pursuer = { id: number; lane: number; gap: number; reaction: number; seed: number; type: TargetType };
type PowerupSpec = { kind: PowerupKind; lane: number; spawn_offset_sec: number; pickup_window_sec: number; active_duration_sec: number; rarity: "common" | "rare" | "legendary" };
type PowerupBatch = { batch_flavor: string; powerups: PowerupSpec[] };
type ScheduledPowerup = PowerupSpec & { id: number; spawnAt: number };
type MapPowerup = PowerupSpec & { id: number; z: number; expiresAt: number };
type ActivePowerup = { kind: PowerupKind; endsAt: number };
type PowerStrike = { id: number; kind: PowerupKind; fromLane: number; toLane: number; targetZ: number; bornAt: number };
type CareerProfile = { xp: number; runs: number; badges: string[] };
type Contract = { label: string; metric: "back" | "baits" | "flow" | "score"; target: number; reward: number };

type NoveltyEvent = {
  event_type: EventType;
  duration_sec: number;
  params: Record<string, number | string | boolean>;
  flavor_text: string;
  rarity: "common" | "rare" | "legendary";
};

type GameData = {
  elapsed: number;
  score: number;
  combo: number;
  bestCombo: number;
  suspicion: number;
  selectedLane: number;
  playerLane: number;
  previousPlayerLane: number;
  targets: Target[];
  items: RunnerItem[];
  pursuers: Pursuer[];
  nextSpawn: number;
  nextItem: number;
  nextWave: number;
  targetId: number;
  itemId: number;
  pursuerId: number;
  lastFrame: number;
  lastHud: number;
  runDistance: number;
  focus: number;
  flowUntil: number;
  stumbleUntil: number;
  slapUntil: number;
  activeEvent: NoveltyEvent | null;
  eventEndsAt: number;
  scriptedFired: boolean;
  liveFired: boolean;
  firstHit: boolean;
  backHits: number;
  sideHits: number;
  chaserBaits: number;
  dodges: number;
  slaps: number;
  flowActivations: number;
  challengeIndex: number;
  challengeDone: boolean;
  recentEvents: string[];
  speedControl: -1 | 0 | 1;
  speedFactor: number;
  jumpStartedAt: number;
  jumpUntil: number;
  jumpCooldownUntil: number;
  hitStopUntil: number;
  scheduledPowerups: ScheduledPowerup[];
  mapPowerups: MapPowerup[];
  activePowerups: ActivePowerup[];
  powerStrikes: PowerStrike[];
  nextPowerupBatchAt: number;
  powerupBatchPending: boolean;
  powerupId: number;
  strikeId: number;
  nextLaserAt: number;
  nextKickAt: number;
  recentPowerupKinds: PowerupKind[];
  runToken: number;
};

const RUN_SECONDS = 100;
const SLAP_MIN = 0.68;
const SLAP_DISTANCE = 2.35;
const CLEAN_COMMIT_Z = -25;

const TARGETS: Record<TargetType, { points: number; color: string; suit: string }> = {
  colleague: { points: 14, color: "#f5d36f", suit: "#557c91" },
  manager: { points: 45, color: "#ff8b61", suit: "#783f43" },
  hr: { points: 85, color: "#ff5370", suit: "#7d2f54" },
  intern: { points: 22, color: "#61d8c9", suit: "#286e75" },
  ceo: { points: 180, color: "#c998ff", suit: "#3f2c62" },
};

const FALLBACK_EVENTS: NoveltyEvent[] = [
  { event_type: "spawn_modifier", duration_sec: 16, params: { spawn_rate_multiplier: 1.45 }, flavor_text: "All-hands breakout: the floor just got crowded.", rarity: "common" },
  { event_type: "score_modifier", duration_sec: 14, params: { score_multiplier: 2 }, flavor_text: "Perfect alignment window: clean hits pay double.", rarity: "rare" },
  { event_type: "hazard_toggle", duration_sec: 16, params: { suspicion_decay_multiplier: 2.4 }, flavor_text: "Security is stuck in a webinar. Suspicion cools faster.", rarity: "common" },
  { event_type: "spawn_modifier", duration_sec: 15, params: { spawn_rate_multiplier: 1.25 }, flavor_text: "Calendar collision: every meeting ended at once.", rarity: "common" },
  { event_type: "score_modifier", duration_sec: 12, params: { score_multiplier: 1.5 }, flavor_text: "Synergy surge: every clean route is worth 50% more.", rarity: "common" },
  { event_type: "hazard_toggle", duration_sec: 14, params: { suspicion_decay_multiplier: 3 }, flavor_text: "Camera maintenance: now is the time to take risks.", rarity: "rare" },
  { event_type: "flavor_only", duration_sec: 12, params: {}, flavor_text: "The printer sensed fear. It is working perfectly.", rarity: "common" },
  { event_type: "spawn_modifier", duration_sec: 15, params: { spawn_rate_multiplier: 1.6 }, flavor_text: "Fire drill rehearsal: read the floor before committing.", rarity: "legendary" },
  { event_type: "score_modifier", duration_sec: 12, params: { score_multiplier: 2.5 }, flavor_text: "Executive visibility: bold decisions are unusually valuable.", rarity: "legendary" },
  { event_type: "hazard_toggle", duration_sec: 18, params: { suspicion_decay_multiplier: 1.8 }, flavor_text: "Quiet hour: the office is pretending not to notice.", rarity: "common" },
];

const POWERUP_LABELS: Record<PowerupKind, string> = {
  titan: "TITAN CRUSH", laser: "DISTANCE LASER", long_leg: "LONG-LEG KICK", phase: "PHASE SHIFT", clone: "ECHO CLONE",
};

const FALLBACK_POWERUP_BATCHES: PowerupBatch[] = [
  { batch_flavor: "Emergency R&D shipment routed to the main corridor.", powerups: [
    { kind: "titan", lane: 1, spawn_offset_sec: 8, pickup_window_sec: 12, active_duration_sec: 10, rarity: "legendary" },
    { kind: "phase", lane: 0, spawn_offset_sec: 22, pickup_window_sec: 11, active_duration_sec: 9, rarity: "rare" },
    { kind: "laser", lane: 2, spawn_offset_sec: 37, pickup_window_sec: 12, active_duration_sec: 11, rarity: "rare" },
    { kind: "clone", lane: 1, spawn_offset_sec: 50, pickup_window_sec: 9, active_duration_sec: 8, rarity: "legendary" },
  ] },
  { batch_flavor: "Prototype benefits have escaped the innovation lab.", powerups: [
    { kind: "long_leg", lane: 2, spawn_offset_sec: 7, pickup_window_sec: 12, active_duration_sec: 10, rarity: "rare" },
    { kind: "clone", lane: 0, spawn_offset_sec: 19, pickup_window_sec: 10, active_duration_sec: 9, rarity: "legendary" },
    { kind: "titan", lane: 1, spawn_offset_sec: 34, pickup_window_sec: 13, active_duration_sec: 8, rarity: "legendary" },
    { kind: "phase", lane: 2, spawn_offset_sec: 48, pickup_window_sec: 10, active_duration_sec: 12, rarity: "rare" },
  ] },
];

const CONTRACTS: Contract[] = [
  { label: "Land 9 clean back hits", metric: "back", target: 9, reward: 220 },
  { label: "Bait 2 pursuers into carts", metric: "baits", target: 2, reward: 300 },
  { label: "Trigger Flow State", metric: "flow", target: 1, reward: 250 },
  { label: "Reach 1,500 productivity", metric: "score", target: 1500, reward: 240 },
];

const RANKS = [
  { name: "INTERN", xp: 0 }, { name: "ASSOCIATE", xp: 450 }, { name: "SENIOR ASSOCIATE", xp: 1100 },
  { name: "MANAGER", xp: 2200 }, { name: "DIRECTOR", xp: 4000 }, { name: "VP OF CHAOS", xp: 6500 }, { name: "CEO OF SLAPS", xp: 10000 },
];

const defaultHud = {
  score: 0, combo: 1, suspicion: 0, time: RUN_SECONDS, distance: 0, focus: 0, flow: false,
  backHits: 0, sideHits: 0, pursuers: 0, baits: 0, contractLabel: CONTRACTS[0].label,
  contractProgress: 0, contractTarget: CONTRACTS[0].target, contractDone: false, selectedLane: 1, firstHit: false,
  speedFactor: 1, jumping: false,
  activePowerups: [] as { kind: PowerupKind; remaining: number }[], powerupsQueued: 0, aiPlanning: false,
};

function clamp(value: number, min: number, max: number) { return Math.max(min, Math.min(max, value)); }
function randomActivity(): OfficeActivity {
  const r = Math.random();
  return r < 0.36 ? "desk" : r < 0.7 ? "chatting" : r < 0.86 ? "phone" : "presenting";
}

function chooseType(elapsed: number, activeEvent: NoveltyEvent | null): TargetType {
  if (elapsed > 82 && Math.random() < 0.09) return "ceo";
  const roll = Math.random();
  if (activeEvent?.params.target_type && activeEvent.params.target_type !== "any") return activeEvent.params.target_type as TargetType;
  if (roll < 0.09 && elapsed > 35) return "hr";
  if (roll < 0.25) return "manager";
  if (roll < 0.48) return "intern";
  return "colleague";
}

function makeGame(challengeIndex = 0): GameData {
  return {
    elapsed: 0, score: 0, combo: 1, bestCombo: 1, suspicion: 0, selectedLane: 1, playerLane: 1, previousPlayerLane: 1,
    targets: [], items: [], pursuers: [], nextSpawn: 1.1, nextItem: 8, nextWave: 20, targetId: 0, itemId: 0,
    pursuerId: 0, lastFrame: performance.now(), lastHud: 0, runDistance: 0, focus: 0, flowUntil: 0, stumbleUntil: 0, slapUntil: 0,
    activeEvent: null, eventEndsAt: 0, scriptedFired: false, liveFired: false, firstHit: false, backHits: 0,
    sideHits: 0, chaserBaits: 0, dodges: 0, slaps: 0, flowActivations: 0, challengeIndex, challengeDone: false, recentEvents: [],
    speedControl: 0, speedFactor: 1, jumpStartedAt: -10, jumpUntil: -10, jumpCooldownUntil: 0, hitStopUntil: 0,
    scheduledPowerups: [], mapPowerups: [], activePowerups: [], powerStrikes: [], nextPowerupBatchAt: 0,
    powerupBatchPending: false, powerupId: 0, strikeId: 0, nextLaserAt: 0, nextKickAt: 0, recentPowerupKinds: [], runToken: Math.random(),
  };
}

function rankForXp(xp: number) {
  let index = 0;
  for (let i = 0; i < RANKS.length; i++) if (xp >= RANKS[i].xp) index = i;
  return { ...RANKS[index], index, next: RANKS[index + 1] || null };
}

function contractProgress(game: GameData, contract: Contract) {
  if (contract.metric === "back") return game.backHits;
  if (contract.metric === "baits") return game.chaserBaits;
  if (contract.metric === "flow") return game.flowActivations;
  return game.score;
}

function eventNumber(event: NoveltyEvent | null, key: string, fallback: number) {
  const value = event?.params[key];
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function hasPowerup(game: GameData, kind: PowerupKind) { return game.activePowerups.some((powerup) => powerup.kind === kind && powerup.endsAt > game.elapsed); }
function powerLanes(game: GameData) {
  const main = game.selectedLane;
  if (main === 0) return [0, 1];
  if (main === 2) return [2, 1];
  return game.previousPlayerLane < game.playerLane ? [1, 2] : [1, 0];
}

export default function CorporateWarsGame() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const rendererRef = useRef<OfficeRunner3D | null>(null);
  const screenRef = useRef<Screen>("start");
  const gameRef = useRef<GameData>(makeGame());
  const audioRef = useRef<AudioContext | null>(null);
  const mutedRef = useRef(false);
  const feedbackTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [screen, setScreen] = useState<Screen>("start");
  const [hud, setHud] = useState(defaultHud);
  const [best, setBest] = useState(0);
  const [muted, setMuted] = useState(false);
  const [profile, setProfile] = useState<CareerProfile>({ xp: 0, runs: 0, badges: [] });
  const [toast, setToast] = useState<NoveltyEvent | null>(null);
  const [toastVisible, setToastVisible] = useState(false);
  const [feedback, setFeedback] = useState<{ text: string; kind: "clean" | "risk" | "danger" } | null>(null);
  const [summary, setSummary] = useState({ score: 0, highScore: 0, bestCombo: 1, distance: 0, backHits: 0, sideHits: 0, baits: 0, xp: 0, newRank: "", badges: [] as string[], contractDone: false, newBest: false, caught: false });

  useEffect(() => {
    // Keep the server and first browser render identical, then restore local progress.
    const restoreFrame = requestAnimationFrame(() => {
      const savedBest = Number(localStorage.getItem("corporate-wars-best") || 0);
      if (Number.isFinite(savedBest)) setBest(savedBest);
      try {
        const saved = JSON.parse(localStorage.getItem("corporate-wars-career") || "null") as CareerProfile | null;
        if (saved && Number.isFinite(saved.xp) && Array.isArray(saved.badges)) setProfile(saved);
      } catch { /* Ignore malformed local progress. */ }
    });
    return () => cancelAnimationFrame(restoreFrame);
  }, []);

  const tone = useCallback((frequency: number, duration = 0.1, type: OscillatorType = "triangle", volume = 0.04, slide = 0) => {
    if (mutedRef.current) return;
    try {
      const audio = audioRef.current ?? new AudioContext();
      audioRef.current = audio;
      const oscillator = audio.createOscillator();
      const gain = audio.createGain();
      oscillator.type = type;
      oscillator.frequency.setValueAtTime(frequency, audio.currentTime);
      oscillator.frequency.linearRampToValueAtTime(Math.max(40, frequency + slide), audio.currentTime + duration);
      gain.gain.setValueAtTime(volume, audio.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.0001, audio.currentTime + duration);
      oscillator.connect(gain).connect(audio.destination);
      oscillator.start(); oscillator.stop(audio.currentTime + duration);
    } catch { /* Audio is optional. */ }
  }, []);

  const showFeedback = useCallback((text: string, kind: "clean" | "risk" | "danger") => {
    setFeedback({ text, kind });
    if (feedbackTimer.current) clearTimeout(feedbackTimer.current);
    feedbackTimer.current = setTimeout(() => setFeedback(null), 920);
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const renderer = new OfficeRunner3D(canvas);
    rendererRef.current = renderer;
    const resize = () => renderer.resize(canvas.clientWidth, canvas.clientHeight);
    const observer = new ResizeObserver(resize);
    observer.observe(canvas);
    resize();
    return () => { observer.disconnect(); renderer.dispose(); rendererRef.current = null; };
  }, []);

  const displayEvent = useCallback((event: NoveltyEvent) => {
    const game = gameRef.current;
    game.activeEvent = event;
    game.eventEndsAt = game.elapsed + event.duration_sec;
    game.recentEvents = [...game.recentEvents.slice(-3), event.event_type];
    setToast(event); setToastVisible(true);
    setTimeout(() => setToastVisible(false), 4200);
    tone(event.rarity === "legendary" ? 620 : event.rarity === "rare" ? 510 : 390, 0.3, "triangle", 0.055, 190);
  }, [tone]);

  const fetchNovelty = useCallback(async () => {
    const game = gameRef.current;
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 2500);
      const response = await fetch("/api/novelty-event", {
        method: "POST", headers: { "content-type": "application/json" }, signal: controller.signal,
        body: JSON.stringify({ score: game.score, elapsedSec: Math.round(game.elapsed), difficultyTier: Math.min(5, 1 + Math.floor(game.elapsed / 20)), recentEventTypes: game.recentEvents }),
      });
      clearTimeout(timeout);
      if (!response.ok) throw new Error("fallback");
      displayEvent(await response.json() as NoveltyEvent);
    } catch {
      displayEvent(FALLBACK_EVENTS[Math.floor(Math.random() * FALLBACK_EVENTS.length)]);
    }
  }, [displayEvent]);

  const fetchPowerupBatch = useCallback(async (minuteStart: number, runToken: number) => {
    const snapshot = gameRef.current;
    let batch: PowerupBatch | null = null;
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 4500);
    try {
      const response = await fetch("/api/powerup-batch", {
        method: "POST",
        headers: { "content-type": "application/json" },
        signal: controller.signal,
        body: JSON.stringify({
          score: snapshot.score,
          elapsedSec: Math.round(snapshot.elapsed),
          difficultyTier: Math.min(5, 1 + Math.floor(snapshot.elapsed / 20)),
          activePowerups: snapshot.activePowerups.map((powerup) => powerup.kind),
          recentKinds: snapshot.recentPowerupKinds,
        }),
      });
      if (!response.ok) throw new Error("fallback");
      const candidate = await response.json() as PowerupBatch;
      const valid = Array.isArray(candidate.powerups) && candidate.powerups.length >= 1 && candidate.powerups.length <= 4
        && candidate.powerups.every((powerup) => POWERUP_LABELS[powerup.kind] && Number.isInteger(powerup.lane) && powerup.lane >= 0 && powerup.lane <= 2);
      if (!valid) throw new Error("invalid batch");
      batch = candidate;
    } catch {
      batch = FALLBACK_POWERUP_BATCHES[Math.floor(minuteStart / 60) % FALLBACK_POWERUP_BATCHES.length];
    } finally {
      clearTimeout(timeout);
    }

    const game = gameRef.current;
    if (game.runToken !== runToken || !batch) return;
    const usablePowerups = batch.powerups.filter((powerup) => minuteStart + powerup.spawn_offset_sec < RUN_SECONDS - 2);
    game.scheduledPowerups.push(...usablePowerups.map((powerup) => ({ ...powerup, id: ++game.powerupId, spawnAt: minuteStart + powerup.spawn_offset_sec })));
    game.recentPowerupKinds = [...game.recentPowerupKinds, ...usablePowerups.map((powerup) => powerup.kind)].slice(-8);
    game.powerupBatchPending = false;
    showFeedback(`AI DROP QUEUED x${usablePowerups.length}`, "clean");
    tone(470, 0.2, "triangle", 0.045, 250);
  }, [showFeedback, tone]);

  const spawnTarget = useCallback((lane?: number, z?: number, forcedType?: TargetType, activity?: OfficeActivity) => {
    const game = gameRef.current;
    const targetLane = lane ?? Math.floor(Math.random() * 3);
    game.targets.push({
      id: ++game.targetId, lane: targetLane, type: forcedType ?? chooseType(game.elapsed, game.activeEvent),
      z: z ?? -78 - Math.random() * 24, seed: Math.random() * 9, activity: activity ?? randomActivity(),
      cleanLine: game.selectedLane === targetLane, alignedAtZ: game.selectedLane === targetLane ? (z ?? -78) : undefined,
      resolved: false,
    });
  }, []);

  const spawnWave = useCallback(() => {
    const game = gameRef.current;
    const safeLane = Math.floor(Math.random() * 3);
    for (let lane = 0; lane < 3; lane++) {
      if (lane === safeLane) spawnTarget(lane, -94, "intern", "phone");
      else spawnTarget(lane, -82 - lane * 6, game.elapsed > 55 ? "hr" : "manager", lane === 1 ? "chatting" : "desk");
    }
    showFeedback("DEADLINE DASH — PLAN TWO MOVES AHEAD", "risk");
    tone(430, 0.22, "square", 0.04, 150);
  }, [showFeedback, spawnTarget, tone]);

  const spawnItem = useCallback(() => {
    const game = gameRef.current;
    const roll = Math.random();
    const type: RunnerItem["type"] = roll < 0.24 ? "coffee" : roll < 0.66 ? "table" : "cart";
    game.items.push({ id: ++game.itemId, lane: Math.floor(Math.random() * 3), z: -82 - Math.random() * 16, type, resolved: false, passedPlayer: false });
  }, []);

  const startGame = useCallback(() => {
    const contractIndex = profile.runs % CONTRACTS.length;
    gameRef.current = makeGame(contractIndex);
    screenRef.current = "playing"; setScreen("playing");
    const contract = CONTRACTS[contractIndex];
    setHud({ ...defaultHud, contractLabel: contract.label, contractTarget: contract.target });
    setToast(null); setToastVisible(false); setFeedback(null);
    tone(320, 0.14, "triangle", 0.045, 220);
  }, [profile.runs, tone]);

  const finishGame = useCallback(() => {
    const game = gameRef.current;
    const newBest = game.score > best;
    const highScore = Math.max(best, game.score);
    if (newBest) { localStorage.setItem("corporate-wars-best", String(game.score)); setBest(game.score); }
    const earnedXp = Math.max(35, Math.round(game.score * 0.09 + game.backHits * 10 + game.chaserBaits * 35 + (game.challengeDone ? 120 : 0)));
    const candidates = [game.backHits >= 10 ? "SHADOW ROUTE" : "", game.chaserBaits >= 3 ? "CART TACTICIAN" : "", game.sideHits === 0 && game.slaps >= 8 ? "CLEAN HANDS" : "", game.score >= 3000 ? "OVERACHIEVER" : ""].filter(Boolean);
    const newBadges = candidates.filter((badge) => !profile.badges.includes(badge));
    const nextProfile = { xp: profile.xp + earnedXp, runs: profile.runs + 1, badges: [...profile.badges, ...newBadges] };
    const oldRank = rankForXp(profile.xp); const nextRank = rankForXp(nextProfile.xp);
    localStorage.setItem("corporate-wars-career", JSON.stringify(nextProfile)); setProfile(nextProfile);
    setSummary({ score: game.score, highScore, bestCombo: game.bestCombo, distance: Math.round(game.runDistance), backHits: game.backHits, sideHits: game.sideHits, baits: game.chaserBaits, xp: earnedXp, newRank: nextRank.index > oldRank.index ? nextRank.name : "", badges: newBadges, contractDone: game.challengeDone, newBest, caught: game.suspicion >= 100 });
    screenRef.current = "summary"; setScreen("summary"); setToastVisible(false);
    tone(newBest ? 620 : 310, 0.32, "triangle", 0.06, newBest ? 310 : -130);
  }, [best, profile, tone]);

  const togglePause = useCallback(() => {
    if (screenRef.current === "playing") { gameRef.current.speedControl = 0; screenRef.current = "paused"; setScreen("paused"); }
    else if (screenRef.current === "paused") { gameRef.current.lastFrame = performance.now(); screenRef.current = "playing"; setScreen("playing"); }
  }, []);

  const moveLane = useCallback((direction: -1 | 1) => {
    if (screenRef.current !== "playing") return;
    const game = gameRef.current;
    const next = clamp(game.selectedLane + direction, 0, 2);
    if (next !== game.selectedLane) { game.selectedLane = next; tone(210, 0.055, "triangle", 0.022, 80); }
  }, [tone]);

  const selectLane = useCallback((lane: number) => {
    if (screenRef.current !== "playing") return;
    gameRef.current.selectedLane = clamp(lane, 0, 2);
  }, []);

  const triggerJump = useCallback(() => {
    if (screenRef.current !== "playing") return;
    const game = gameRef.current;
    if (game.elapsed < game.jumpCooldownUntil) return;
    game.jumpStartedAt = game.elapsed; game.jumpUntil = game.elapsed + 0.94; game.jumpCooldownUntil = game.elapsed + 1.02;
    showFeedback("JUMP", "clean"); tone(245, 0.24, "sine", 0.035, 260);
  }, [showFeedback, tone]);

  const resolveSlap = useCallback((target: Target) => {
    const game = gameRef.current;
    const clean = target.cleanLine && target.alignedAtZ !== undefined && target.alignedAtZ <= CLEAN_COMMIT_Z && Math.abs(game.playerLane - target.lane) < SLAP_MIN * 0.3;
    const mode = clean ? "back" : "side";
    target.resolved = true; target.hitMode = mode; target.hitAt = game.elapsed;
    game.slapUntil = game.elapsed + 0.42; game.hitStopUntil = game.elapsed + 0.105; game.slaps += 1; game.firstHit = true;
    const cfg = TARGETS[target.type];
    const eventMultiplier = game.activeEvent?.event_type === "score_modifier" ? eventNumber(game.activeEvent, "score_multiplier", 1) : 1;
    const flowMultiplier = game.elapsed < game.flowUntil ? 2 : 1;
    const precisionMultiplier = clean ? 1.9 : 0.72;
    const points = Math.round(cfg.points * game.combo * precisionMultiplier * eventMultiplier * flowMultiplier);
    game.score += points;
    if (clean) {
      game.backHits += 1; game.combo = Math.min(8, Math.round((game.combo + 0.25) * 100) / 100);
      game.focus = Math.min(100, game.focus + 18); showFeedback(`CLEAN BACK HIT  +${points}`, "clean");
      tone(128, 0.16, "sine", 0.07, -48); tone(710, 0.085, "triangle", 0.026, -180);
    } else {
      game.sideHits += 1; game.combo = Math.max(1, Math.round((game.combo - 0.35) * 100) / 100); game.suspicion += target.type === "hr" ? 15 : 7;
      game.pursuers.push({ id: ++game.pursuerId, lane: target.lane, gap: 5.6, reaction: 0.48, seed: target.seed, type: target.type });
      showFeedback("SIDE HIT — PURSUER JOINED", "danger"); tone(105, 0.19, "sine", 0.07, 70); tone(540, 0.08, "triangle", 0.024, -120);
    }
    game.bestCombo = Math.max(game.bestCombo, game.combo);
    if (game.focus >= 100 && game.elapsed >= game.flowUntil) {
      game.focus = 0; game.flowUntil = game.elapsed + 6.5; game.flowActivations += 1;
      showFeedback("FLOW STATE ×2", "clean"); tone(520, 0.35, "triangle", 0.07, 410);
    }
  }, [showFeedback, tone]);

  const resolvePowerHit = useCallback((target: Target, kind: PowerupKind) => {
    if (target.resolved) return;
    const game = gameRef.current;
    target.resolved = true;
    target.hitMode = kind === "laser" ? "back" : "side";
    target.hitAt = game.elapsed;
    game.slapUntil = game.elapsed + 0.24;
    game.hitStopUntil = game.elapsed + 0.045;
    game.slaps += 1;
    game.firstHit = true;
    const multiplier = kind === "laser" ? 1.35 : kind === "titan" ? 1.2 : 1;
    const points = Math.round(TARGETS[target.type].points * Math.max(1, game.combo) * multiplier);
    game.score += points;
    game.backHits += 1;
    game.combo = Math.min(8, Math.round((game.combo + 0.12) * 100) / 100);
    game.focus = Math.min(100, game.focus + 8);
    game.bestCombo = Math.max(game.bestCombo, game.combo);
    game.powerStrikes.push({ id: ++game.strikeId, kind, fromLane: game.selectedLane, toLane: target.lane, targetZ: target.z, bornAt: game.elapsed });
    tone(kind === "laser" ? 920 : kind === "titan" ? 92 : 240, 0.12, kind === "laser" ? "sawtooth" : "triangle", 0.045, kind === "laser" ? -360 : 160);
  }, [tone]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (["Space", "ArrowLeft", "ArrowRight", "Enter", "KeyW", "KeyS"].includes(event.code)) event.preventDefault();
      if (event.code === "Escape") { if (screenRef.current === "playing" || screenRef.current === "paused") togglePause(); return; }
      if ((screenRef.current === "start" || screenRef.current === "summary") && (event.code === "Enter" || event.code === "Space")) { startGame(); return; }
      if (screenRef.current !== "playing") return;
      if (event.code === "Space") { if (!event.repeat) triggerJump(); }
      else if (event.code === "KeyW") gameRef.current.speedControl = 1;
      else if (event.code === "KeyS") gameRef.current.speedControl = -1;
      else if (event.code === "ArrowLeft" || event.code === "KeyA") moveLane(-1);
      else if (event.code === "ArrowRight" || event.code === "KeyD") moveLane(1);
      else if (["Digit1", "Digit2", "Digit3"].includes(event.code)) selectLane(Number(event.code.slice(5)) - 1);
    };
    const onKeyUp = (event: KeyboardEvent) => {
      if (event.code === "KeyW" && gameRef.current.speedControl === 1) gameRef.current.speedControl = 0;
      if (event.code === "KeyS" && gameRef.current.speedControl === -1) gameRef.current.speedControl = 0;
    };
    window.addEventListener("keydown", onKey);
    window.addEventListener("keyup", onKeyUp);
    return () => { window.removeEventListener("keydown", onKey); window.removeEventListener("keyup", onKeyUp); };
  }, [moveLane, selectLane, startGame, togglePause, triggerJump]);

  useEffect(() => {
    let animation = 0;
    const frame = (now: number) => {
      const game = gameRef.current;
      const dt = Math.min(0.04, Math.max(0, (now - game.lastFrame) / 1000));
      game.lastFrame = now;
      if (screenRef.current === "playing") {
        game.elapsed += dt;
        const flow = game.elapsed < game.flowUntil;
        const stumble = game.elapsed < game.stumbleUntil;
        const speedTarget = game.speedControl > 0 ? 1.38 : game.speedControl < 0 ? 0.68 : 1;
        game.speedFactor += (speedTarget - game.speedFactor) * Math.min(1, dt * 5.8);
        const hitStop = game.elapsed < game.hitStopUntil;
        const speed = (11.7 + game.elapsed * 0.045) * game.speedFactor * (stumble ? 0.62 : flow ? 0.88 : 1) * (hitStop ? 0.12 : 1);
        const jumpProgress = game.elapsed < game.jumpUntil ? clamp((game.elapsed - game.jumpStartedAt) / 0.94, 0, 1) : 0;
        game.runDistance += dt * speed * 1.58;
        game.previousPlayerLane = game.playerLane;
        game.playerLane += (game.selectedLane - game.playerLane) * Math.min(1, dt * 11.5);

        if (game.elapsed >= game.nextPowerupBatchAt && !game.powerupBatchPending) {
          const minuteStart = game.nextPowerupBatchAt;
          game.nextPowerupBatchAt += 60;
          game.powerupBatchPending = true;
          void fetchPowerupBatch(minuteStart, game.runToken);
        }
        game.activePowerups = game.activePowerups.filter((powerup) => powerup.endsAt > game.elapsed);
        const arriving = game.scheduledPowerups.filter((powerup) => powerup.spawnAt <= game.elapsed);
        game.scheduledPowerups = game.scheduledPowerups.filter((powerup) => powerup.spawnAt > game.elapsed);
        game.mapPowerups.push(...arriving.map((powerup) => ({ ...powerup, z: -74, expiresAt: game.elapsed + powerup.pickup_window_sec })));
        for (const powerup of game.mapPowerups) powerup.z += speed * dt;
        const pickedUp = game.mapPowerups.find((powerup) => powerup.z >= 4 && powerup.z <= 6.4 && powerup.lane === game.selectedLane && Math.abs(game.playerLane - powerup.lane) < 0.3);
        if (pickedUp) {
          game.mapPowerups = game.mapPowerups.filter((powerup) => powerup.id !== pickedUp.id);
          game.activePowerups = game.activePowerups.filter((powerup) => powerup.kind !== pickedUp.kind);
          game.activePowerups.push({ kind: pickedUp.kind, endsAt: game.elapsed + pickedUp.active_duration_sec });
          game.score += pickedUp.rarity === "legendary" ? 100 : pickedUp.rarity === "rare" ? 70 : 45;
          showFeedback(`${POWERUP_LABELS[pickedUp.kind]}  ${pickedUp.active_duration_sec}s`, "clean");
          tone(360, 0.32, "triangle", 0.07, 520);
        }
        game.mapPowerups = game.mapPowerups.filter((powerup) => powerup.expiresAt > game.elapsed && powerup.z < 9);

        for (const target of game.targets) {
          if (target.resolved) continue;
          target.z += speed * dt;
          if (target.lane === game.selectedLane) {
            if (target.alignedAtZ === undefined) target.alignedAtZ = target.z;
            if (target.z <= CLEAN_COMMIT_Z) target.cleanLine = true;
          } else if (target.z > -18) target.cleanLine = false;
        }

        for (const item of game.items) if (!item.resolved) item.z += speed * dt;
        for (const pursuer of game.pursuers) {
          pursuer.reaction -= dt;
          if (pursuer.reaction <= 0) pursuer.lane += (game.playerLane - pursuer.lane) * Math.min(1, dt * 1.65);
          const closingRate = game.speedFactor >= 1.12
            ? -(0.76 + (game.speedFactor - 1.12) * 1.6)
            : 0.52 + (1 - game.speedFactor) * 1.25 + game.elapsed * 0.0035 + (game.combo > 4 ? 0.12 : 0);
          pursuer.gap -= dt * closingRate;
        }

        const poweredLanes = powerLanes(game);
        if (hasPowerup(game, "titan")) {
          for (const target of game.targets) if (!target.resolved && poweredLanes.includes(target.lane) && target.z > -7 && target.z < 7) resolvePowerHit(target, "titan");
          for (const item of game.items) if (!item.resolved && poweredLanes.includes(item.lane) && item.z > -5 && item.z < 7) {
            item.resolved = true; game.score += 35;
            game.powerStrikes.push({ id: ++game.strikeId, kind: "titan", fromLane: game.selectedLane, toLane: item.lane, targetZ: item.z, bornAt: game.elapsed });
          }
          const crushed = game.pursuers.filter((pursuer) => poweredLanes.some((lane) => Math.abs(pursuer.lane - lane) < 0.34) && pursuer.gap < 4.6);
          if (crushed.length) { game.score += crushed.length * 60; game.pursuers = game.pursuers.filter((pursuer) => !crushed.includes(pursuer)); }
        }
        if (hasPowerup(game, "laser") && game.elapsed >= game.nextLaserAt) {
          const laserTarget = game.targets.filter((target) => !target.resolved && target.lane === game.selectedLane && target.z > -58 && target.z < 4).sort((a, b) => b.z - a.z)[0];
          if (laserTarget) { resolvePowerHit(laserTarget, "laser"); game.nextLaserAt = game.elapsed + 0.62; }
        }
        if (hasPowerup(game, "long_leg") && game.elapsed >= game.nextKickAt) {
          const kickTargets = game.targets.filter((target) => !target.resolved && poweredLanes.includes(target.lane) && target.z > -7 && target.z < 6);
          if (kickTargets.length) {
            kickTargets.forEach((target) => resolvePowerHit(target, "long_leg"));
            game.nextKickAt = game.elapsed + 0.72;
          }
        }
        if (hasPowerup(game, "clone")) {
          const cloneLane = 2 - game.selectedLane;
          const cloneTarget = game.targets.find((target) => !target.resolved && target.lane === cloneLane && target.z >= SLAP_DISTANCE && target.z < 5.5);
          if (cloneTarget) resolvePowerHit(cloneTarget, "clone");
        }
        for (const target of game.targets) {
          if (!target.resolved && target.z >= SLAP_DISTANCE && target.z < 5.5 && target.lane === game.selectedLane && Math.abs(game.playerLane - target.lane) < 0.22) resolveSlap(target);
        }

        for (const item of game.items) {
          if (item.resolved) continue;
          if (item.type === "cart") {
            const trapped = game.pursuers.find((pursuer) => Math.abs(pursuer.lane - item.lane) < 0.32 && Math.abs((5 + pursuer.gap) - item.z) < 1.18);
            if (trapped) {
              item.resolved = true; game.pursuers = game.pursuers.filter((pursuer) => pursuer.id !== trapped.id);
              game.chaserBaits += 1; game.score += 90 * Math.max(1, Math.floor(game.combo)); game.focus = Math.min(100, game.focus + 22);
              showFeedback("PURSUER BAITED INTO CART  +90", "clean"); tone(88, 0.34, "square", 0.075, -28); continue;
            }
          }
          if (item.z >= 4.25 && item.z <= 6.25 && item.lane === game.selectedLane && Math.abs(game.playerLane - item.lane) < 0.27) {
            if (hasPowerup(game, "phase")) {
              item.resolved = true; game.score += 30; game.focus = Math.min(100, game.focus + 7);
              game.powerStrikes.push({ id: ++game.strikeId, kind: "phase", fromLane: game.selectedLane, toLane: item.lane, targetZ: item.z, bornAt: game.elapsed });
            } else if (item.type === "table" && jumpProgress > 0.13 && jumpProgress < 0.92) {
              item.resolved = true; game.dodges += 1; game.score += 45; game.focus = Math.min(100, game.focus + 12);
              showFeedback("TABLE VAULT  +45", "clean"); tone(390, 0.24, "sine", 0.04, 240); tone(840, 0.07, "triangle", 0.018, -120);
            } else if (item.type === "coffee") {
              item.resolved = true; game.focus = Math.min(100, game.focus + 32); game.score += 25;
              showFeedback("ESPRESSO  +25 FOCUS", "clean"); tone(560, 0.2, "triangle", 0.055, 230);
            } else {
              item.resolved = true; game.combo = 1; game.focus = Math.max(0, game.focus - 24); game.suspicion += 5; game.stumbleUntil = game.elapsed + 0.78;
              showFeedback(item.type === "table" ? "TABLE CRASH — JUMP EARLIER" : "CART CRASH — COMBO LOST", "danger"); tone(92, 0.35, "sawtooth", 0.075, -45);
            }
          } else if (item.type !== "coffee" && !item.passedPlayer && item.z > 6.4) {
            item.passedPlayer = true; game.dodges += 1; game.score += 6; game.focus = Math.min(100, game.focus + 3);
          }
        }

        const caught = game.speedFactor < 1.12
          ? game.pursuers.find((pursuer) => pursuer.gap < 0.86 && Math.abs(pursuer.lane - game.playerLane) < 0.3)
          : undefined;
        if (caught) {
          game.pursuers = game.pursuers.filter((pursuer) => pursuer.id !== caught.id);
          if (hasPowerup(game, "phase")) {
            game.score += 55;
            game.powerStrikes.push({ id: ++game.strikeId, kind: "phase", fromLane: game.selectedLane, toLane: Math.round(caught.lane), targetZ: 5 + caught.gap, bornAt: game.elapsed });
          } else {
            game.suspicion += 24; game.combo = 1; game.stumbleUntil = game.elapsed + 0.55;
            showFeedback("CAUGHT!  +24% SUSPICION", "danger"); tone(82, 0.4, "sawtooth", 0.08, -30);
          }
        }

        if (game.activeEvent && game.elapsed >= game.eventEndsAt) game.activeEvent = null;
        const decay = game.activeEvent?.event_type === "hazard_toggle" ? eventNumber(game.activeEvent, "suspicion_decay_multiplier", 1) : 1;
        game.suspicion = Math.max(0, game.suspicion - dt * 0.72 * decay);
        const spawnRate = game.activeEvent?.event_type === "spawn_modifier" ? eventNumber(game.activeEvent, "spawn_rate_multiplier", 1) : 1;
        if (game.elapsed >= game.nextSpawn) {
          spawnTarget(); game.nextSpawn = game.elapsed + Math.max(1.25, (2.45 - game.elapsed * 0.007) / spawnRate);
        }
        if (game.elapsed >= game.nextItem) { spawnItem(); game.nextItem = game.elapsed + 4.6 + Math.random() * 2.8; }
        if (game.elapsed >= game.nextWave) { spawnWave(); game.nextWave += 22; }
        if (!game.scriptedFired && game.elapsed >= 30) { game.scriptedFired = true; displayEvent(FALLBACK_EVENTS[3]); }
        if (!game.liveFired && game.elapsed >= 60) { game.liveFired = true; void fetchNovelty(); }
        if (Math.floor(game.elapsed) > 0 && Math.floor(game.elapsed) % 15 === 0 && Math.floor(game.elapsed - dt) % 15 !== 0) { game.score += 10; showFeedback("+10 ATTENDANCE BONUS", "clean"); }

        if (game.focus >= 100 && game.elapsed >= game.flowUntil) {
          game.focus = 0; game.flowUntil = game.elapsed + 6.5; game.flowActivations += 1; showFeedback("FLOW STATE ×2", "clean"); tone(520, 0.35, "triangle", 0.07, 410);
        }
        const contract = CONTRACTS[game.challengeIndex]; const progress = contractProgress(game, contract);
        if (!game.challengeDone && progress >= contract.target) { game.challengeDone = true; game.score += contract.reward; showFeedback(`CONTRACT COMPLETE  +${contract.reward}`, "clean"); tone(660, 0.3, "triangle", 0.07, 280); }

        game.targets = game.targets.filter((target) => target.resolved ? Boolean(target.hitAt !== undefined && game.elapsed - target.hitAt < 0.48) : target.z < 9);
        game.items = game.items.filter((item) => !item.resolved && item.z < 15);
        const outrun = game.pursuers.filter((pursuer) => pursuer.gap >= 8);
        if (outrun.length) {
          game.pursuers = game.pursuers.filter((pursuer) => pursuer.gap < 8);
          game.score += outrun.length * 75; game.focus = Math.min(100, game.focus + outrun.length * 10);
          showFeedback(`PURSUER OUTRUN  +${outrun.length * 75}`, "clean"); tone(430, 0.2, "triangle", 0.045, 240);
        }
        game.powerStrikes = game.powerStrikes.filter((strike) => game.elapsed - strike.bornAt < 0.52);
        const remaining = Math.max(0, RUN_SECONDS - game.elapsed);
        if (game.elapsed - game.lastHud >= 0.08) {
          game.lastHud = game.elapsed;
          setHud({ score: game.score, combo: game.combo, suspicion: Math.min(100, game.suspicion), time: Math.ceil(remaining), distance: Math.round(game.runDistance), focus: game.focus, flow, backHits: game.backHits, sideHits: game.sideHits, pursuers: game.pursuers.length, baits: game.chaserBaits, contractLabel: contract.label, contractProgress: Math.min(contract.target, progress), contractTarget: contract.target, contractDone: game.challengeDone, selectedLane: game.selectedLane, firstHit: game.firstHit, speedFactor: game.speedFactor, jumping: jumpProgress > 0, activePowerups: game.activePowerups.map((powerup) => ({ kind: powerup.kind, remaining: Math.max(0, Math.ceil(powerup.endsAt - game.elapsed)) })), powerupsQueued: game.scheduledPowerups.length + game.mapPowerups.length, aiPlanning: game.powerupBatchPending });
        }
        if (remaining <= 0 || game.suspicion >= 100) finishGame();
      }

      const sceneFrame: SceneFrame = {
        running: screenRef.current === "playing", elapsed: game.elapsed, distance: game.runDistance,
        playerLane: game.playerLane, targetLane: game.selectedLane,
        slapPulse: clamp((game.slapUntil - game.elapsed) / 0.42, 0, 1), jumpProgress: game.elapsed < game.jumpUntil ? clamp((game.elapsed - game.jumpStartedAt) / 0.94, 0, 1) : 0,
        speedFactor: game.speedFactor, flow: game.elapsed < game.flowUntil,
        stumble: game.elapsed < game.stumbleUntil,
        targets: game.targets.map((target) => ({ id: target.id, lane: target.lane, z: target.z, color: TARGETS[target.type].color, suit: TARGETS[target.type].suit, role: target.type.toUpperCase(), activity: target.activity, seed: target.seed, hitMode: target.hitMode, hitAge: target.hitAt === undefined ? undefined : game.elapsed - target.hitAt })),
        items: game.items.map((item) => ({ id: item.id, lane: item.lane, z: item.z, type: item.type })),
        pursuers: game.pursuers.map((pursuer) => ({ ...pursuer, role: pursuer.type.toUpperCase(), color: TARGETS[pursuer.type].color, suit: TARGETS[pursuer.type].suit })),
        powerups: game.mapPowerups.map((powerup) => ({ id: powerup.id, lane: powerup.lane, z: powerup.z, kind: powerup.kind, rarity: powerup.rarity })),
        activePowerups: game.activePowerups.map((powerup) => powerup.kind),
        strikes: game.powerStrikes.map((strike) => ({ id: strike.id, kind: strike.kind, fromLane: strike.fromLane, toLane: strike.toLane, targetZ: strike.targetZ, age: game.elapsed - strike.bornAt })),
      };
      rendererRef.current?.render(sceneFrame, dt);
      animation = requestAnimationFrame(frame);
    };
    animation = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(animation);
  }, [displayEvent, fetchNovelty, fetchPowerupBatch, finishGame, resolvePowerHit, resolveSlap, showFeedback, spawnItem, spawnTarget, spawnWave, tone]);

  const onCanvasClick = (event: React.PointerEvent<HTMLCanvasElement>) => {
    const rect = event.currentTarget.getBoundingClientRect();
    const x = (event.clientX - rect.left) / rect.width;
    selectLane(x < 1 / 3 ? 0 : x > 2 / 3 ? 2 : 1);
  };

  const toggleMute = () => { mutedRef.current = !mutedRef.current; setMuted(mutedRef.current); if (!mutedRef.current) tone(420, 0.1, "triangle", 0.035, 80); };
  const suspicionColor = hud.suspicion > 72 ? "danger" : hud.suspicion > 38 ? "warn" : "safe";
  const careerRank = rankForXp(profile.xp);
  const careerProgress = careerRank.next ? clamp(((profile.xp - careerRank.xp) / (careerRank.next.xp - careerRank.xp)) * 100, 0, 100) : 100;

  return <main className="game-shell">
    <div className={`game-stage suspicion-${suspicionColor}`}>
      <canvas ref={canvasRef} className="game-canvas" onPointerDown={onCanvasClick} aria-label="3D office runner with three strategic lanes" />
      <div className="grain" aria-hidden="true" /><div className="top-brand" aria-hidden="true"><span>CW</span> CORPORATE WARS 3D</div>

      {(screen === "playing" || screen === "paused") && <>
        <section className="hud" aria-label="Game status">
          <div className="hud-card score-card"><span className="hud-label">PRODUCTIVITY</span><strong>{hud.score.toLocaleString()}</strong><span className="combo">×{hud.combo.toFixed(2)} COMBO · {hud.backHits} CLEAN</span></div>
          <div className={`timer-card ${hud.time <= 10 ? "timer-danger" : ""}`}><span>{hud.distance}M · {hud.speedFactor.toFixed(2)}× PACE</span><strong>{String(Math.floor(hud.time / 60)).padStart(2, "0")}:{String(hud.time % 60).padStart(2, "0")}</strong><div className={`focus-mini ${hud.flow ? "flowing" : ""}`}><i style={{ width: `${hud.flow ? 100 : hud.focus}%` }} /><b>{hud.flow ? "FLOW ×2" : "FOCUS"}</b></div></div>
          <div className="hud-card suspicion-card"><div className="suspicion-head"><span className="hud-label">SUSPICION</span><b>{Math.round(hud.suspicion)}%</b></div><div className="meter"><i style={{ width: `${hud.suspicion}%` }} /></div><small>{hud.pursuers ? `${hud.pursuers} PURSUER${hud.pursuers > 1 ? "S" : ""} CLOSING` : hud.suspicion > 45 ? "KEEP IT CASUAL" : "ROUTE IS CLEAN"}</small></div>
        </section>
        <div className={`event-toast ${toastVisible ? "show" : ""} rarity-${toast?.rarity || "common"}`} role="status"><span className="event-kicker">OFFICE UPDATE</span><b>{toast?.flavor_text}</b>{toast && <span className="event-duration">{toast.duration_sec}s</span>}</div>
        <div className={`contract-strip ${hud.contractDone ? "done" : ""}`}><span>ACTIVE CONTRACT</span><b>{hud.contractLabel}</b><i>{hud.contractDone ? "COMPLETE" : `${hud.contractProgress}/${hud.contractTarget}`}</i></div>
        <div className={`pursuit-card ${hud.pursuers ? "hot" : ""}`}><span>PURSUIT</span><b>{hud.pursuers || "CLEAR"}</b><small>{hud.pursuers ? "DODGE LATE · LEAVE A CART IN THEIR LANE" : `${hud.baits} CART BAITS`}</small></div>
        <div className={`pace-strip ${hud.jumping ? "airborne" : hud.speedFactor > 1.08 ? "sprinting" : hud.speedFactor < .92 ? "braking" : ""}`}><b>{hud.jumping ? "AIRBORNE" : hud.speedFactor > 1.08 ? "SPRINT" : hud.speedFactor < .92 ? "BRAKE" : "CRUISE"}</b><span><kbd>W</kbd> speed up <kbd>S</kbd> slow down <kbd>SPACE</kbd> jump</span></div>
        <div className={`powerup-rack ${hud.activePowerups.length ? "powered" : ""}`}>
          <span className="powerup-planner">AI DROP {hud.aiPlanning ? "PLANNING" : `${hud.powerupsQueued} QUEUED`}</span>
          <div>{hud.activePowerups.length ? hud.activePowerups.map((powerup) => <b key={powerup.kind} className={`power-${powerup.kind}`}>{POWERUP_LABELS[powerup.kind]} <i>{powerup.remaining}s</i></b>) : <em>Collect a glowing prototype</em>}</div>
        </div>
        {feedback && <div className={`skill-feedback ${feedback.kind}`}>{feedback.text}</div>}
        {!hud.firstHit && <div className="first-prompt"><kbd>← →</kbd> line up while they are far away <span>· late cuts cause a chase</span></div>}
        <div className="lane-hints" aria-hidden="true">{[1, 2, 3].map((number) => <span key={number} className={hud.selectedLane === number - 1 ? "active" : ""}>{number}</span>)}</div>
        <div className="runner-controls" aria-label="Runner controls"><button onPointerDown={() => moveLane(-1)} aria-label="Move left">←</button><button className="jump-control" onPointerDown={triggerJump} aria-label="Jump over table">JUMP</button><button onPointerDown={() => moveLane(1)} aria-label="Move right">→</button></div>
        <div className="game-actions"><button onClick={toggleMute} className="icon-btn">{muted ? "SOUND OFF" : "SOUND ON"}</button><button onClick={togglePause} className="icon-btn">{screen === "paused" ? "RESUME" : "PAUSE"}</button></div>
      </>}

      {screen === "start" && <section className="screen-overlay start-screen">
        <div className="start-copy"><div className="eyebrow"><span>REAL 3D OFFICE RUNNER</span><i /> THINK TWO MOVES AHEAD</div><h1>CORPORATE<br /><em>WARS</em></h1>
          <p>You are the only runner. Control the pace, jump office tables, and chase AI-planned prototype drops. Every minute, Groq schedules up to four glowing power-ups across the three lanes.</p>
          <button className="primary-btn" onClick={startGame}><span>START RUNNING</span><small>ENTER / SPACE</small></button>
          <div className="control-strip"><div><kbd>← →</kbd><span>CHANGE LANE</span></div><div><kbd>W / S</kbd><span>SPRINT / BRAKE</span></div><div><kbd>SPACE</kbd><span>JUMP TABLE</span></div><div><kbd>AUTO</kbd><span>SLAP AT CONTACT</span></div></div>
        </div>
        <aside className="briefing-card"><span className="stamp">TACTICAL BRIEF</span><h2>READ. COMMIT. ESCAPE.</h2>
          <div className="strategy-row clean"><b>01</b><div><strong>APPROACH FROM BEHIND</strong><span>Choose the lane while the employee is far away. Clean hits build Focus and a stronger combo.</span></div></div>
          <div className="strategy-row risk"><b>02</b><div><strong>SIDE HITS CREATE PURSUERS</strong><span>A late lane cut still lands, but the employee turns and chases you down.</span></div></div>
          <div className="strategy-row trap"><b>03</b><div><strong>TURN PRESSURE INTO POINTS</strong><span>Change lanes just before a cart. The slower pursuer follows and takes the collision.</span></div></div>
          <div className="strategy-row power"><b>04</b><div><strong>READ THE AI DROP ROUTE</strong><span>Titan and Long-Leg cover two lanes; Laser reaches ahead; Phase ignores danger; Echo Clone attacks the mirrored lane.</span></div></div>
          <div className="best-score"><span>PERSONAL BEST</span><strong>{best.toLocaleString()}</strong></div>
          <div className="career-progress"><div><span>{careerRank.name}</span><b>{profile.xp.toLocaleString()} XP</b></div><div className="career-meter"><i style={{ width: `${careerProgress}%` }} /></div><small>{careerRank.next ? `${careerRank.next.xp - profile.xp} XP TO ${careerRank.next.name}` : "CAREER MAXED"}</small></div>
        </aside>
      </section>}

      {screen === "paused" && <section className="screen-overlay pause-screen"><div className="pause-card"><div className="eyebrow"><span>TACTICAL PAUSE</span></div><h2>HOLD<br />POSITION</h2><p>Plan your next lane. Pursuers resume exactly where you left them.</p><button className="primary-btn" onClick={togglePause}><span>RESUME RUN</span><small>ESC</small></button></div></section>}

      {screen === "summary" && <section className="screen-overlay summary-screen"><div className="summary-card"><div className="eyebrow"><span>SHIFT REPORT</span></div><h2>{summary.caught ? "ESCORTED\nOUT" : "CLOCKED\nOUT"}</h2>
        {summary.newBest && <div className="new-record">NEW PERSONAL BEST</div>}
        <div className="final-score"><span>PRODUCTIVITY</span><strong>{summary.score.toLocaleString()}</strong></div>
        <div className="summary-stats"><div><span>CLEAN HITS</span><b>{summary.backHits}</b></div><div><span>RISKY HITS</span><b>{summary.sideHits}</b></div><div><span>CART BAITS</span><b>{summary.baits}</b></div><div><span>BEST COMBO</span><b>×{summary.bestCombo.toFixed(2)}</b></div><div><span>DISTANCE</span><b>{summary.distance}M</b></div></div>
        <div className="run-rewards"><b>+{summary.xp} CAREER XP</b>{summary.contractDone && <span>CONTRACT COMPLETE</span>}{summary.newRank && <span>PROMOTED: {summary.newRank}</span>}{summary.badges.map((badge) => <span key={badge}>BADGE: {badge}</span>)}</div>
        <button className="primary-btn" onClick={startGame}><span>RUN IT AGAIN</span><small>ENTER</small></button>
      </div></section>}
    </div>
    <footer className="game-footer"><span>WEBGL 3D · THROTTLE / BRAKE / JUMP</span><span>SATISFYING IMPACT FX · PURSUER AI · PERSISTENT CAREER</span></footer>
  </main>;
}
