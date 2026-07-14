"use client";

import { useCallback, useEffect, useRef, useState } from "react";

type Screen = "start" | "playing" | "paused" | "summary";
type TargetType = "colleague" | "manager" | "hr" | "intern" | "ceo";
type EventType = "spawn_modifier" | "score_modifier" | "hazard_toggle" | "flavor_only";

type Target = {
  id: number;
  lane: number;
  type: TargetType;
  z: number;
  resolved: boolean;
  hitAt?: number;
  knock: number;
  seed: number;
};

type Particle = { x: number; y: number; vx: number; vy: number; life: number; maxLife: number; color: string; size: number; spin: number };
type Popup = { x: number; y: number; text: string; color: string; born: number };
type NoveltyEvent = {
  event_type: EventType;
  duration_sec: number;
  params: Record<string, number | string | boolean>;
  flavor_text: string;
  rarity: "common" | "rare" | "legendary";
};

type GameData = {
  startedAt: number;
  pausedAt: number;
  pausedTotal: number;
  score: number;
  combo: number;
  bestCombo: number;
  suspicion: number;
  selectedLane: number;
  playerLane: number;
  targets: Target[];
  particles: Particle[];
  popups: Popup[];
  nextSpawnAt: number;
  targetId: number;
  lastFrame: number;
  lastHud: number;
  lastSalaryAt: number;
  scriptedFired: boolean;
  liveFired: boolean;
  ceoFired: boolean;
  activeEvent: NoveltyEvent | null;
  eventEndsAt: number;
  slapAt: number;
  shake: number;
  flash: number;
  firstHit: boolean;
  recentEvents: string[];
  runDistance: number;
  speed: number;
};

const WIDTH = 1200;
const HEIGHT = 700;
const RUN_SECONDS = 100;
const HORIZON = 126;
const TRACK_BOTTOM = 760;
const SLAP_MIN = 0.68;
const SLAP_MAX = 1.02;

const TARGETS: Record<TargetType, { points: number; color: string; suit: string; label: string }> = {
  colleague: { points: 10, color: "#f5d36f", suit: "#557c91", label: "COLLEAGUE" },
  manager: { points: 50, color: "#ff8b61", suit: "#9a493f", label: "MANAGER" },
  hr: { points: 150, color: "#ff5370", suit: "#b62f58", label: "HR" },
  intern: { points: 20, color: "#61d8c9", suit: "#25857d", label: "INTERN" },
  ceo: { points: 500, color: "#c998ff", suit: "#3f2c62", label: "CEO" },
};

const FALLBACK_EVENTS: NoveltyEvent[] = [
  { event_type: "spawn_modifier", duration_sec: 16, params: { spawn_rate_multiplier: 1.55, target_type: "manager" }, flavor_text: "Quarterly review! Managers are flooding the corridor.", rarity: "common" },
  { event_type: "score_modifier", duration_sec: 14, params: { score_multiplier: 2 }, flavor_text: "Espresso machine repaired — DOUBLE POINTS!", rarity: "rare" },
  { event_type: "spawn_modifier", duration_sec: 15, params: { spawn_rate_multiplier: 1.4, target_type: "any" }, flavor_text: "Fire drill! The whole office is on the move.", rarity: "common" },
  { event_type: "hazard_toggle", duration_sec: 18, params: { suspicion_decay_multiplier: 3 }, flavor_text: "Security is trapped in a webinar. Suspicion cools faster.", rarity: "common" },
  { event_type: "score_modifier", duration_sec: 16, params: { target_type: "intern", score_multiplier: 4 }, flavor_text: "Mentorship week: interns are suddenly worth a fortune.", rarity: "rare" },
  { event_type: "hazard_toggle", duration_sec: 14, params: { hr_suspicion_multiplier: 0.5 }, flavor_text: "Casual Friday! HR is feeling unusually forgiving.", rarity: "rare" },
  { event_type: "spawn_modifier", duration_sec: 15, params: { spawn_rate_multiplier: 1.25, target_type: "intern" }, flavor_text: "Campus tour incoming — interns have taken over the floor.", rarity: "common" },
  { event_type: "score_modifier", duration_sec: 12, params: { score_multiplier: 1.5 }, flavor_text: "Synergy surge! Every slap is 50% more productive.", rarity: "common" },
  { event_type: "flavor_only", duration_sec: 12, params: {}, flavor_text: "The printer sensed fear. It is working perfectly.", rarity: "common" },
  { event_type: "spawn_modifier", duration_sec: 13, params: { spawn_rate_multiplier: 1.35, target_type: "hr" }, flavor_text: "Mandatory culture survey. HR is everywhere — choose wisely.", rarity: "legendary" },
];

function makeGame(now: number): GameData {
  return {
    startedAt: now, pausedAt: 0, pausedTotal: 0, score: 0, combo: 1, bestCombo: 1,
    suspicion: 0, selectedLane: 1, playerLane: 1, targets: [], particles: [], popups: [],
    nextSpawnAt: now + 900, targetId: 0, lastFrame: now, lastHud: 0, lastSalaryAt: 0,
    scriptedFired: false, liveFired: false, ceoFired: false, activeEvent: null, eventEndsAt: 0,
    slapAt: -1000, shake: 0, flash: 0, firstHit: false, recentEvents: [], runDistance: 0, speed: 0.128,
  };
}

function clamp(n: number, min: number, max: number) { return Math.max(min, Math.min(max, n)); }
function roundedRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath(); ctx.roundRect(x, y, w, h, Math.min(r, w / 2, h / 2));
}

function project(lane: number, z: number) {
  const p = Math.pow(clamp(z, 0, 1.1), 0.78);
  const y = HORIZON + p * (TRACK_BOTTOM - HORIZON);
  const halfWidth = 82 + p * 520;
  const x = WIDTH / 2 + (lane - 1) * halfWidth * 0.55;
  const scale = 0.24 + p * 1.03;
  return { x, y, scale, halfWidth, p };
}

function targetWindow(type: TargetType) {
  if (type === "ceo") return { min: .81, max: .92 };
  if (type === "hr") return { min: .77, max: .95 };
  if (type === "manager") return { min: .72, max: .98 };
  if (type === "intern") return { min: .69, max: 1 };
  return { min: .65, max: 1.04 };
}

function drawCorridor(ctx: CanvasRenderingContext2D, game: GameData, now: number) {
  const pulse = Math.sin(now / 700) * 0.5 + 0.5;
  const bg = ctx.createLinearGradient(0, 0, 0, HEIGHT);
  bg.addColorStop(0, "#132941"); bg.addColorStop(0.55, "#31576a"); bg.addColorStop(1, "#08121e");
  ctx.fillStyle = bg; ctx.fillRect(0, 0, WIDTH, HEIGHT);

  // Ceiling and walls converge to the center to sell forward motion.
  ctx.fillStyle = "#132435";
  ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(WIDTH, 0); ctx.lineTo(682, HORIZON); ctx.lineTo(518, HORIZON); ctx.closePath(); ctx.fill();
  ctx.fillStyle = "#233d50";
  ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(518, HORIZON); ctx.lineTo(518, 680); ctx.lineTo(0, HEIGHT); ctx.closePath(); ctx.fill();
  ctx.fillStyle = "#1c3447";
  ctx.beginPath(); ctx.moveTo(WIDTH, 0); ctx.lineTo(682, HORIZON); ctx.lineTo(682, 680); ctx.lineTo(WIDTH, HEIGHT); ctx.closePath(); ctx.fill();

  // Scrolling ceiling lights.
  for (let i = 0; i < 8; i++) {
    const z = ((i / 8 + (game.runDistance * 0.32) % 0.125) % 1);
    const q = project(1, z);
    const w = 26 + q.p * 150;
    const h = 5 + q.p * 24;
    ctx.fillStyle = `rgba(192,255,232,${0.16 + pulse * 0.08})`;
    ctx.beginPath(); ctx.moveTo(600 - w / 2, q.y * 0.48); ctx.lineTo(600 + w / 2, q.y * 0.48); ctx.lineTo(600 + w * .38, q.y * .48 + h); ctx.lineTo(600 - w * .38, q.y * .48 + h); ctx.closePath(); ctx.fill();
  }

  // Office windows and doors stream past at the sides.
  for (let i = 0; i < 7; i++) {
    const z = ((i / 7 + (game.runDistance * 0.18) % (1 / 7)) % 1);
    const q = project(1, z);
    const h = 35 + q.p * 210;
    const w = 24 + q.p * 100;
    const left = 510 - q.p * 500;
    const right = 690 + q.p * 500 - w;
    ctx.fillStyle = "rgba(115,205,202,.13)";
    roundedRect(ctx, left, q.y - h, w, h, 5); ctx.fill(); roundedRect(ctx, right, q.y - h, w, h, 5); ctx.fill();
    ctx.strokeStyle = "rgba(175,244,226,.2)"; ctx.lineWidth = Math.max(1, q.p * 4);
    ctx.strokeRect(left, q.y - h, w, h); ctx.strokeRect(right, q.y - h, w, h);
  }

  // Track.
  const floor = ctx.createLinearGradient(0, HORIZON, 0, HEIGHT);
  floor.addColorStop(0, "#3d746f"); floor.addColorStop(.45, "#347069"); floor.addColorStop(1, "#193d3c");
  ctx.fillStyle = floor;
  ctx.beginPath(); ctx.moveTo(518, HORIZON); ctx.lineTo(682, HORIZON); ctx.lineTo(1200, TRACK_BOTTOM); ctx.lineTo(0, TRACK_BOTTOM); ctx.closePath(); ctx.fill();

  // Moving carpet bands.
  for (let i = 0; i < 12; i++) {
    const z = ((i / 12 + (game.runDistance * .55) % (1 / 12)) % 1);
    const a = project(1, z);
    const b = project(1, Math.min(1.08, z + .012));
    ctx.fillStyle = i % 2 ? "rgba(111,255,211,.035)" : "rgba(0,0,0,.055)";
    ctx.beginPath(); ctx.moveTo(600 - a.halfWidth, a.y); ctx.lineTo(600 + a.halfWidth, a.y); ctx.lineTo(600 + b.halfWidth, b.y); ctx.lineTo(600 - b.halfWidth, b.y); ctx.closePath(); ctx.fill();
  }

  // Lane guides and edge rails.
  ctx.lineWidth = 3;
  for (const laneEdge of [-.5, .5]) {
    ctx.strokeStyle = "rgba(174,255,232,.14)";
    ctx.beginPath(); ctx.moveTo(600 + laneEdge * 82 * .55, HORIZON); ctx.lineTo(600 + laneEdge * 602 * .55, TRACK_BOTTOM); ctx.stroke();
  }
  ctx.strokeStyle = "#0a1724"; ctx.lineWidth = 13;
  ctx.beginPath(); ctx.moveTo(518, HORIZON); ctx.lineTo(0, TRACK_BOTTOM); ctx.moveTo(682, HORIZON); ctx.lineTo(1200, TRACK_BOTTOM); ctx.stroke();
  ctx.strokeStyle = "rgba(111,255,211,.36)"; ctx.lineWidth = 2;
  ctx.beginPath(); ctx.moveTo(518, HORIZON); ctx.lineTo(0, TRACK_BOTTOM); ctx.moveTo(682, HORIZON); ctx.lineTo(1200, TRACK_BOTTOM); ctx.stroke();

  // Slap zone on the floor.
  const near = project(1, SLAP_MAX);
  const far = project(1, SLAP_MIN);
  const zone = ctx.createLinearGradient(0, far.y, 0, near.y);
  zone.addColorStop(0, "rgba(111,255,211,0)"); zone.addColorStop(1, "rgba(111,255,211,.14)");
  ctx.fillStyle = zone;
  ctx.beginPath(); ctx.moveTo(600 - far.halfWidth, far.y); ctx.lineTo(600 + far.halfWidth, far.y); ctx.lineTo(600 + near.halfWidth, near.y); ctx.lineTo(600 - near.halfWidth, near.y); ctx.closePath(); ctx.fill();
  ctx.strokeStyle = "rgba(111,255,211,.42)"; ctx.lineWidth = 3; ctx.setLineDash([12, 10]);
  ctx.beginPath(); ctx.moveTo(600 - far.halfWidth, far.y); ctx.lineTo(600 + far.halfWidth, far.y); ctx.stroke(); ctx.setLineDash([]);
}

function drawPerson(ctx: CanvasRenderingContext2D, x: number, y: number, scale: number, type: TargetType, runPhase: number, player = false, hitT = 0, knock = 0) {
  const cfg = TARGETS[type];
  const leg = Math.sin(runPhase) * 13;
  const arm = Math.sin(runPhase + Math.PI) * 11;
  ctx.save();
  ctx.translate(x + knock * hitT * 95 * scale, y - 56 * scale - Math.sin(runPhase * 2) * 2 * scale);
  ctx.rotate(knock * hitT * .72);
  ctx.scale(scale * (hitT ? 1 + .12 * (1 - hitT) : 1), scale * (hitT ? .8 + .2 * hitT : 1));

  ctx.fillStyle = "rgba(0,0,0,.28)"; ctx.beginPath(); ctx.ellipse(0, 62, 34, 10, 0, 0, Math.PI * 2); ctx.fill();
  ctx.strokeStyle = player ? "#10243d" : "#182433"; ctx.lineWidth = 12; ctx.lineCap = "round";
  ctx.beginPath(); ctx.moveTo(-11, 31); ctx.lineTo(-15 + leg, 62); ctx.moveTo(11, 31); ctx.lineTo(15 - leg, 62); ctx.stroke();
  ctx.strokeStyle = player ? "#e8f7f1" : cfg.suit; ctx.lineWidth = 14;
  ctx.beginPath(); ctx.moveTo(-27, -11); ctx.lineTo(-37 - arm, 21); ctx.moveTo(27, -11); ctx.lineTo(37 + arm, 21); ctx.stroke();

  ctx.fillStyle = player ? "#1977d2" : cfg.suit; roundedRect(ctx, -31, -40, 62, 79, 18); ctx.fill();
  ctx.fillStyle = "rgba(255,255,255,.18)";
  ctx.beginPath(); ctx.moveTo(-20, -35); ctx.lineTo(0, -5); ctx.lineTo(20, -35); ctx.closePath(); ctx.fill();
  ctx.fillStyle = player ? "#6fffd3" : cfg.color;
  ctx.beginPath(); ctx.moveTo(-4, -25); ctx.lineTo(4, -25); ctx.lineTo(7, 3); ctx.lineTo(0, 9); ctx.lineTo(-7, 3); ctx.closePath(); ctx.fill();

  const skin = type === "intern" ? "#905d3b" : type === "ceo" ? "#79503b" : "#bd7a51";
  ctx.fillStyle = skin; ctx.beginPath(); ctx.ellipse(0, -63, 25, 29, 0, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = type === "hr" ? "#4a1829" : type === "ceo" ? "#dfdcd5" : player ? "#18324f" : "#202b34";
  ctx.beginPath(); ctx.arc(0, -69, 25, Math.PI, Math.PI * 2); ctx.lineTo(21, -65); ctx.quadraticCurveTo(0, -91, -22, -65); ctx.fill();

  if (!player) {
    ctx.fillStyle = "#111820"; ctx.beginPath(); ctx.arc(-8, -62, 2.3, 0, Math.PI * 2); ctx.arc(8, -62, 2.3, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = "#66372c"; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(0, -53, 8, 0, Math.PI); ctx.stroke();
  }
  if (type === "ceo" && !player) {
    ctx.fillStyle = "#f4cd5f"; ctx.beginPath(); ctx.moveTo(-20, -88); ctx.lineTo(-12, -104); ctx.lineTo(-3, -91); ctx.lineTo(7, -107); ctx.lineTo(16, -91); ctx.lineTo(23, -105); ctx.lineTo(20, -84); ctx.closePath(); ctx.fill();
  }
  ctx.restore();
}

function drawTarget(ctx: CanvasRenderingContext2D, target: Target, game: GameData, now: number) {
  const q = project(target.lane, target.z);
  const cfg = TARGETS[target.type];
  const window = targetWindow(target.type);
  const inRange = target.z >= window.min && target.z <= window.max;
  const hitT = target.hitAt ? clamp((now - target.hitAt) / 430, 0, 1) : 0;
  const runPhase = game.runDistance * 11 + target.seed;

  if (inRange && !target.resolved) {
    const glow = ctx.createRadialGradient(q.x, q.y - 50 * q.scale, 5, q.x, q.y - 50 * q.scale, 82 * q.scale);
    glow.addColorStop(0, `${cfg.color}66`); glow.addColorStop(1, `${cfg.color}00`);
    ctx.fillStyle = glow; ctx.beginPath(); ctx.arc(q.x, q.y - 48 * q.scale, 84 * q.scale, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = cfg.color; ctx.lineWidth = 4; ctx.globalAlpha = .65 + Math.sin(now / 90) * .25;
    ctx.beginPath(); ctx.ellipse(q.x, q.y - 46 * q.scale, 43 * q.scale, 74 * q.scale, 0, 0, Math.PI * 2); ctx.stroke(); ctx.globalAlpha = 1;
  }

  drawPerson(ctx, q.x, q.y, q.scale, target.type, runPhase, false, hitT, target.knock);

  if (target.z > .44 && !target.resolved) {
    const labelY = q.y - 140 * q.scale;
    ctx.fillStyle = "rgba(6,15,23,.88)"; roundedRect(ctx, q.x - 48 * q.scale, labelY - 18 * q.scale, 96 * q.scale, 25 * q.scale, 10 * q.scale); ctx.fill();
    ctx.fillStyle = cfg.color; ctx.font = `900 ${Math.max(9, 12 * q.scale)}px Arial, sans-serif`; ctx.textAlign = "center"; ctx.fillText(cfg.label, q.x, labelY);
  }
}

function drawPlayer(ctx: CanvasRenderingContext2D, game: GameData, now: number) {
  const q = project(game.playerLane, .91);
  const phase = game.runDistance * 14;
  // Running dust trail.
  for (let i = 0; i < 6; i++) {
    const alpha = (6 - i) / 28;
    ctx.fillStyle = `rgba(218,255,243,${alpha})`;
    ctx.beginPath(); ctx.arc(q.x + Math.sin(i * 2.3) * 12, q.y + 39 + i * 18, 7 - i * .7, 0, Math.PI * 2); ctx.fill();
  }
  drawPerson(ctx, q.x, q.y, 1.18, "colleague", phase, true);

  const slapT = (now - game.slapAt) / 360;
  if (slapT >= 0 && slapT <= 1) {
    const swing = Math.sin(slapT * Math.PI);
    ctx.save(); ctx.translate(q.x, q.y - 60); ctx.rotate(-.9 + swing * 1.8);
    ctx.strokeStyle = "rgba(111,255,211,.4)"; ctx.lineWidth = 22; ctx.lineCap = "round";
    ctx.beginPath(); ctx.arc(0, 0, 95, -1.1, .55); ctx.stroke();
    ctx.strokeStyle = "#d18a5d"; ctx.lineWidth = 18; ctx.beginPath(); ctx.moveTo(15, 0); ctx.lineTo(90, -8); ctx.stroke();
    ctx.fillStyle = "#d18a5d"; roundedRect(ctx, 78, -24, 36, 38, 15); ctx.fill(); ctx.restore();
  }
}

function drawEffects(ctx: CanvasRenderingContext2D, game: GameData, now: number) {
  for (const p of game.particles) {
    const a = clamp(p.life / p.maxLife, 0, 1); ctx.save(); ctx.globalAlpha = a; ctx.translate(p.x, p.y); ctx.rotate(p.spin * (1 - a));
    ctx.fillStyle = p.color; ctx.fillRect(-p.size / 2, -p.size / 3, p.size, p.size * .66); ctx.restore();
  }
  for (const pop of game.popups) {
    const t = clamp((now - pop.born) / 900, 0, 1); ctx.save(); ctx.globalAlpha = 1 - t; ctx.translate(pop.x, pop.y - t * 68);
    ctx.font = "900 27px Arial Black, Arial"; ctx.textAlign = "center"; ctx.lineWidth = 7; ctx.strokeStyle = "rgba(4,10,17,.82)"; ctx.strokeText(pop.text, 0, 0); ctx.fillStyle = pop.color; ctx.fillText(pop.text, 0, 0); ctx.restore();
  }
}

function getEventNumber(event: NoveltyEvent | null, key: string, fallback = 1) {
  const value = event?.params[key]; return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

export default function CorporateWarsGame() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const gameRef = useRef<GameData>(makeGame(performance.now()));
  const screenRef = useRef<Screen>("start");
  const audioRef = useRef<AudioContext | null>(null);
  const mutedRef = useRef(false);
  const [screen, setScreen] = useState<Screen>("start");
  const [muted, setMuted] = useState(false);
  const [best, setBest] = useState(0);
  const [hud, setHud] = useState({ score: 0, combo: 1, suspicion: 0, time: RUN_SECONDS, distance: 0 });
  const [summary, setSummary] = useState({ score: 0, bestCombo: 1, highScore: 0, newBest: false, distance: 0 });
  const [toast, setToast] = useState<NoveltyEvent | null>(null);
  const [toastVisible, setToastVisible] = useState(false);

  useEffect(() => { const saved = Number(localStorage.getItem("corporate-wars-best") || 0); setBest(Number.isFinite(saved) ? saved : 0); }, []);

  const ensureAudio = useCallback(() => {
    if (!audioRef.current) audioRef.current = new AudioContext();
    if (audioRef.current.state === "suspended") void audioRef.current.resume();
    return audioRef.current;
  }, []);

  const tone = useCallback((frequency: number, duration: number, type: OscillatorType = "square", volume = .05, slide = 0) => {
    if (mutedRef.current) return; const audio = ensureAudio(); const osc = audio.createOscillator(); const gain = audio.createGain();
    osc.type = type; osc.frequency.setValueAtTime(frequency, audio.currentTime);
    if (slide) osc.frequency.exponentialRampToValueAtTime(Math.max(30, frequency + slide), audio.currentTime + duration);
    gain.gain.setValueAtTime(volume, audio.currentTime); gain.gain.exponentialRampToValueAtTime(.001, audio.currentTime + duration);
    osc.connect(gain).connect(audio.destination); osc.start(); osc.stop(audio.currentTime + duration);
  }, [ensureAudio]);

  const showEvent = useCallback((event: NoveltyEvent, now: number) => {
    const game = gameRef.current; game.activeEvent = event; game.eventEndsAt = now + event.duration_sec * 1000;
    game.recentEvents = [...game.recentEvents.slice(-3), event.event_type]; setToast(event); setToastVisible(true);
    tone(event.rarity === "legendary" ? 620 : 480, .16, "triangle", .055, 180); window.setTimeout(() => setToastVisible(false), 4600);
  }, [tone]);

  const fetchNovelty = useCallback(async (elapsed: number, now: number) => {
    const game = gameRef.current; const controller = new AbortController(); const timeout = window.setTimeout(() => controller.abort(), 2500);
    try {
      const response = await fetch("/api/novelty-event", { method: "POST", headers: { "Content-Type": "application/json" }, signal: controller.signal,
        body: JSON.stringify({ score: game.score, elapsedSec: Math.floor(elapsed), difficultyTier: elapsed < 45 ? 1 : 2, recentEventTypes: game.recentEvents }) });
      if (!response.ok) throw new Error("fallback"); showEvent((await response.json()) as NoveltyEvent, now);
    } catch {
      const choices = FALLBACK_EVENTS.filter((event) => !game.recentEvents.includes(event.event_type));
      showEvent((choices.length ? choices : FALLBACK_EVENTS)[Math.floor(Math.random() * (choices.length || FALLBACK_EVENTS.length))], now);
    } finally { window.clearTimeout(timeout); }
  }, [showEvent]);

  const chooseTargetType = (elapsed: number, game: GameData): TargetType => {
    const forced = game.activeEvent?.event_type === "spawn_modifier" ? game.activeEvent.params.target_type : undefined;
    if (forced && forced !== "any" && TARGETS[forced as TargetType] && elapsed >= 20 && Math.random() < .62) return forced as TargetType;
    if (elapsed < 20) return "colleague";
    if (elapsed < 45) return Math.random() < .68 ? "colleague" : "manager";
    const r = Math.random(); return r < .4 ? "colleague" : r < .64 ? "manager" : r < .81 ? "intern" : "hr";
  };

  const spawnTarget = useCallback((elapsed: number) => {
    const game = gameRef.current;
    let type = chooseTargetType(elapsed, game);
    if (!game.ceoFired && elapsed > 48 && Math.random() < .08) { type = "ceo"; game.ceoFired = true; }
    const lane = Math.floor(Math.random() * 3);
    const laneCrowded = game.targets.some((target) => !target.resolved && target.lane === lane && target.z < .3);
    if (laneCrowded) return;
    game.targets.push({ id: ++game.targetId, lane, type, z: .035, resolved: false, knock: Math.random() < .5 ? -1 : 1, seed: Math.random() * Math.PI * 2 });
  }, []);

  const finishGame = useCallback(() => {
    const game = gameRef.current; const highScore = Math.max(best, game.score); const newBest = game.score > best;
    if (newBest) { localStorage.setItem("corporate-wars-best", String(game.score)); setBest(game.score); }
    setSummary({ score: game.score, bestCombo: game.bestCombo, highScore, newBest, distance: Math.round(game.runDistance * 40) });
    screenRef.current = "summary"; setScreen("summary"); setToastVisible(false); tone(newBest ? 620 : 310, .3, "triangle", .06, newBest ? 310 : -130);
  }, [best, tone]);

  const startGame = useCallback(() => {
    ensureAudio(); const now = performance.now(); gameRef.current = makeGame(now); screenRef.current = "playing"; setScreen("playing");
    setHud({ score: 0, combo: 1, suspicion: 0, time: RUN_SECONDS, distance: 0 }); setToast(null); setToastVisible(false); tone(320, .14, "triangle", .045, 220);
  }, [ensureAudio, tone]);

  const togglePause = useCallback(() => {
    const now = performance.now(); const game = gameRef.current;
    if (screenRef.current === "playing") { game.pausedAt = now; screenRef.current = "paused"; setScreen("paused"); }
    else if (screenRef.current === "paused") {
      const delta = now - game.pausedAt; game.pausedTotal += delta; game.nextSpawnAt += delta; game.eventEndsAt += delta;
      game.popups.forEach((popup) => { popup.born += delta; }); game.targets.forEach((target) => { if (target.hitAt) target.hitAt += delta; });
      game.lastFrame = now; screenRef.current = "playing"; setScreen("playing");
    }
  }, []);

  const moveLane = useCallback((direction: -1 | 1) => {
    if (screenRef.current !== "playing") return;
    const game = gameRef.current; const next = clamp(game.selectedLane + direction, 0, 2);
    if (next !== game.selectedLane) { game.selectedLane = next; tone(210, .06, "triangle", .025, 70); }
  }, [tone]);

  const selectLane = useCallback((lane: number) => {
    if (screenRef.current !== "playing") return; gameRef.current.selectedLane = clamp(lane, 0, 2);
  }, []);

  const slap = useCallback(() => {
    if (screenRef.current !== "playing") return;
    ensureAudio(); const now = performance.now(); const game = gameRef.current; game.slapAt = now;
    tone(115, .07, "sawtooth", .028, 95);
    const laneTargets = game.targets.filter((target) => target.lane === game.selectedLane && !target.resolved).sort((a, b) => b.z - a.z);
    const live = laneTargets.find((target) => { const window = targetWindow(target.type); return target.z >= window.min && target.z <= window.max; });
    if (live) {
      live.resolved = true; live.hitAt = now; const cfg = TARGETS[live.type]; const event = game.activeEvent;
      let eventMultiplier = event?.event_type === "score_modifier" ? getEventNumber(event, "score_multiplier", 1) : 1;
      if (event?.params.target_type && event.params.target_type !== live.type) eventMultiplier = 1;
      const precision = 1 + Math.max(0, .18 - Math.abs(.84 - live.z)) * 1.7;
      const points = Math.round(cfg.points * game.combo * eventMultiplier * precision);
      game.score += points; game.combo = Math.round((game.combo + .1) * 10) / 10; game.bestCombo = Math.max(game.bestCombo, game.combo); game.firstHit = true;
      if (live.type === "hr") game.suspicion += 15 * (event?.event_type === "hazard_toggle" ? getEventNumber(event, "hr_suspicion_multiplier", 1) : 1);
      game.shake = live.type === "ceo" ? 19 : 11; game.flash = .28;
      const q = project(live.lane, live.z); const colors = [cfg.color, "#fff", "#6fffd3", "#ff8f62", "#fff1a6"];
      for (let i = 0; i < (live.type === "ceo" ? 34 : 20); i++) {
        const a = Math.random() * Math.PI * 2; const speed = 90 + Math.random() * 250;
        game.particles.push({ x: q.x, y: q.y - 62 * q.scale, vx: Math.cos(a) * speed, vy: Math.sin(a) * speed - 100, life: .55 + Math.random() * .5, maxLife: .7 + Math.random() * .4, color: colors[i % colors.length], size: 7 + Math.random() * 13, spin: (Math.random() - .5) * 9 });
      }
      game.popups.push({ x: q.x, y: q.y - 150 * q.scale, text: `+${points}  ×${(game.combo - .1).toFixed(1)}`, color: cfg.color, born: now });
      const base = live.type === "ceo" ? 130 : live.type === "hr" ? 180 : live.type === "manager" ? 230 : 285;
      tone(base, .16, "sawtooth", .08, -90); tone(base * 2.1, .08, "square", .035, -120);
      return;
    }
    const premature = laneTargets.find((target) => target.z > .42 && target.z < targetWindow(target.type).min);
    if (premature?.type === "hr") {
      game.suspicion += 25; game.combo = 1; const q = project(premature.lane, premature.z);
      game.popups.push({ x: q.x, y: q.y - 90, text: "HR SAW THAT! +25%", color: "#ff5370", born: now }); tone(110, .28, "sawtooth", .06, -45);
    } else if (premature?.type === "manager") {
      game.combo = Math.max(1, Math.round((game.combo - .3) * 10) / 10); const q = project(premature.lane, premature.z);
      game.popups.push({ x: q.x, y: q.y - 80, text: "TOO EARLY!", color: "#ff8b61", born: now }); tone(150, .14, "square", .035, -60);
    }
  }, [ensureAudio, tone]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (["Space", "ArrowLeft", "ArrowRight", "Enter"].includes(event.code)) event.preventDefault();
      if (event.code === "Escape") { if (screenRef.current === "playing" || screenRef.current === "paused") togglePause(); return; }
      if ((screenRef.current === "start" || screenRef.current === "summary") && (event.code === "Enter" || event.code === "Space")) { startGame(); return; }
      if (screenRef.current !== "playing") return;
      if (event.code === "ArrowLeft" || event.code === "KeyA") moveLane(-1);
      else if (event.code === "ArrowRight" || event.code === "KeyD") moveLane(1);
      else if (event.code === "Space") slap();
      else if (["Digit1", "Digit2", "Digit3"].includes(event.code)) selectLane(Number(event.code.slice(5)) - 1);
    };
    window.addEventListener("keydown", onKey); return () => window.removeEventListener("keydown", onKey);
  }, [moveLane, selectLane, slap, startGame, togglePause]);

  useEffect(() => {
    let raf = 0;
    const frame = (now: number) => {
      const canvas = canvasRef.current; if (!canvas) { raf = requestAnimationFrame(frame); return; }
      const ctx = canvas.getContext("2d"); if (!ctx) { raf = requestAnimationFrame(frame); return; }
      const dpr = Math.min(2, window.devicePixelRatio || 1); if (canvas.width !== WIDTH * dpr || canvas.height !== HEIGHT * dpr) { canvas.width = WIDTH * dpr; canvas.height = HEIGHT * dpr; }
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0); const game = gameRef.current;
      if (screenRef.current === "playing") {
        const dt = Math.min(.04, Math.max(0, (now - game.lastFrame) / 1000)); const elapsed = (now - game.startedAt - game.pausedTotal) / 1000;
        const remaining = Math.max(0, RUN_SECONDS - elapsed); game.lastFrame = now; game.speed = Math.min(.176, .128 + elapsed * .00048);
        const eventRate = game.activeEvent?.event_type === "spawn_modifier" ? getEventNumber(game.activeEvent, "spawn_rate_multiplier", 1) : 1;
        game.runDistance += dt * (2.3 + elapsed * .012); game.playerLane += (game.selectedLane - game.playerLane) * Math.min(1, dt * 12);
        game.targets.forEach((target) => { if (!target.resolved) target.z += game.speed * dt; });
        if (game.activeEvent && now >= game.eventEndsAt) game.activeEvent = null;
        const decay = game.activeEvent?.event_type === "hazard_toggle" ? getEventNumber(game.activeEvent, "suspicion_decay_multiplier", 1) : 1;
        game.suspicion = Math.max(0, game.suspicion - dt * decay); game.shake = Math.max(0, game.shake - dt * 43); game.flash = Math.max(0, game.flash - dt * 2.8);
        if (now >= game.nextSpawnAt) {
          spawnTarget(elapsed); const base = Math.max(760, 1450 - elapsed * 5.8); game.nextSpawnAt = now + (base * (.82 + Math.random() * .35)) / eventRate;
        }
        if (!game.scriptedFired && elapsed >= 30) { game.scriptedFired = true; showEvent(FALLBACK_EVENTS[2], now); }
        if (!game.liveFired && elapsed >= 60) { game.liveFired = true; void fetchNovelty(elapsed, now); }
        if (elapsed - game.lastSalaryAt >= 15) { game.lastSalaryAt = elapsed; game.score += 10; game.popups.push({ x: 600, y: 185, text: "+10 ATTENDANCE BONUS", color: "#9ad9c8", born: now }); }
        game.targets = game.targets.filter((target) => target.resolved ? Boolean(target.hitAt && now - target.hitAt < 440) : target.z < 1.1);
        game.particles.forEach((p) => { p.life -= dt; p.vy += 430 * dt; p.x += p.vx * dt; p.y += p.vy * dt; p.spin += dt; });
        game.particles = game.particles.filter((p) => p.life > 0); game.popups = game.popups.filter((popup) => now - popup.born < 950);
        if (now - game.lastHud > 80) { game.lastHud = now; setHud({ score: game.score, combo: game.combo, suspicion: Math.min(100, game.suspicion), time: Math.ceil(remaining), distance: Math.round(game.runDistance * 40) }); }
        if (remaining <= 0 || game.suspicion >= 100) finishGame();
      } else game.lastFrame = now;

      const visualNow = screenRef.current === "paused" ? game.pausedAt : now;
      ctx.save(); if (game.shake > 0) ctx.translate((Math.random() - .5) * game.shake, (Math.random() - .5) * game.shake);
      drawCorridor(ctx, game, visualNow);
      [...game.targets].sort((a, b) => a.z - b.z).forEach((target) => drawTarget(ctx, target, game, visualNow));
      drawPlayer(ctx, game, visualNow); drawEffects(ctx, game, visualNow);
      if (game.flash > 0) { ctx.fillStyle = `rgba(255,255,255,${game.flash})`; ctx.fillRect(0, 0, WIDTH, HEIGHT); }
      ctx.restore(); raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame); return () => cancelAnimationFrame(raf);
  }, [fetchNovelty, finishGame, showEvent, spawnTarget]);

  const onCanvasClick = (event: React.PointerEvent<HTMLCanvasElement>) => {
    if (screenRef.current !== "playing") return;
    const rect = event.currentTarget.getBoundingClientRect(); const x = ((event.clientX - rect.left) / rect.width) * WIDTH;
    const lane = x < WIDTH / 3 ? 0 : x > WIDTH * 2 / 3 ? 2 : 1; selectLane(lane);
    const hittable = gameRef.current.targets.some((target) => { const window = targetWindow(target.type); return target.lane === lane && !target.resolved && target.z >= window.min && target.z <= window.max; });
    if (hittable) slap();
  };

  const toggleMute = () => { const next = !mutedRef.current; mutedRef.current = next; setMuted(next); if (!next) tone(420, .1, "triangle", .035, 80); };
  const suspicionColor = hud.suspicion > 72 ? "danger" : hud.suspicion > 38 ? "warn" : "safe";

  return (
    <main className="game-shell">
      <div className={`game-stage suspicion-${suspicionColor}`}>
        <canvas ref={canvasRef} className="game-canvas" onPointerDown={onCanvasClick} aria-label="Forward-running corporate corridor with three lanes" />
        <div className="grain" aria-hidden="true" /><div className="top-brand" aria-hidden="true"><span>CW</span> CORPORATE WARS</div>

        {(screen === "playing" || screen === "paused") && <>
          <section className="hud" aria-label="Game status">
            <div className="hud-card score-card"><span className="hud-label">PRODUCTIVITY</span><strong>{hud.score.toLocaleString()}</strong><span className="combo">×{hud.combo.toFixed(1)} COMBO</span></div>
            <div className={`timer-card ${hud.time <= 10 ? "timer-danger" : ""}`}><span>{hud.distance}M • SHIFT ENDS IN</span><strong>{String(Math.floor(hud.time / 60)).padStart(2, "0")}:{String(hud.time % 60).padStart(2, "0")}</strong></div>
            <div className="hud-card suspicion-card"><div className="suspicion-head"><span className="hud-label">SUSPICION</span><b>{Math.round(hud.suspicion)}%</b></div><div className="meter"><i style={{ width: `${hud.suspicion}%` }} /></div><small>{hud.suspicion > 72 ? "SECURITY INBOUND" : hud.suspicion > 38 ? "KEEP IT CASUAL" : "BLEND IN"}</small></div>
          </section>
          <div className={`event-toast ${toastVisible ? "show" : ""} rarity-${toast?.rarity || "common"}`} role="status"><span className="event-kicker">OFFICE UPDATE</span><b>{toast?.flavor_text}</b>{toast && <span className="event-duration">{toast.duration_sec}s</span>}</div>
          {!gameRef.current.firstHit && <div className="first-prompt"><kbd>← →</kbd> change lanes <span>• slap inside the glowing zone with <kbd>SPACE</kbd></span></div>}
          <div className="lane-hints" aria-hidden="true">{[1, 2, 3].map((n) => <span key={n} className={gameRef.current.selectedLane === n - 1 ? "active" : ""}>{n}</span>)}</div>
          <div className="runner-controls" aria-label="Runner controls"><button onPointerDown={() => moveLane(-1)} aria-label="Move left">←</button><button className="slap-control" onPointerDown={slap}>SLAP</button><button onPointerDown={() => moveLane(1)} aria-label="Move right">→</button></div>
          <div className="game-actions"><button onClick={toggleMute} className="icon-btn" aria-label={muted ? "Turn sound on" : "Mute sound"}>{muted ? "SOUND OFF" : "SOUND ON"}</button><button onClick={togglePause} className="icon-btn">{screen === "paused" ? "RESUME" : "PAUSE"}</button></div>
        </>}

        {screen === "start" && <section className="screen-overlay start-screen">
          <div className="start-copy"><div className="eyebrow"><span>RUN THE FLOOR</span><i /> NO MORE SYNERGY</div><h1>CORPORATE<br /><em>WARS</em></h1>
            <p>Sprint through the office, switch lanes, and slap coworkers as you catch them. Risk HR only when the points are worth the heat.</p>
            <button className="primary-btn" onClick={startGame}><span>START RUNNING</span><small>ENTER / SPACE</small></button>
            <div className="control-strip"><div><kbd>← →</kbd><span>CHANGE LANE</span></div><div><kbd>1–3</kbd><span>PICK LANE</span></div><div><kbd>SPACE</kbd><span>SLAP</span></div><div><kbd>ESC</kbd><span>PAUSE</span></div></div>
          </div>
          <aside className="briefing-card"><span className="stamp">CONFIDENTIAL</span><h2>CHASE LIST</h2>
            <div className="role-row safe"><b>10</b><span><strong>COLLEAGUE</strong>Safe and easy to catch.</span></div><div className="role-row manager"><b>50</b><span><strong>MANAGER</strong>Slap too early and lose combo.</span></div><div className="role-row risky"><b>150</b><span><strong>HR</strong>Huge points. Raises suspicion.</span></div><div className="role-row ceo"><b>500</b><span><strong>CEO</strong>Rare corridor bonus.</span></div>
            <div className="best-score"><span>PERSONAL BEST</span><strong>{best.toLocaleString()}</strong></div>
          </aside>
        </section>}

        {screen === "paused" && <section className="screen-overlay pause-screen"><div className="pause-card"><span className="eyebrow">UNSCHEDULED BREAK</span><h2>RUN<br />PAUSED</h2><p>The corridor, suspicion, and shift clock are frozen.</p><button className="primary-btn" onClick={togglePause}><span>KEEP RUNNING</span><small>ESC</small></button></div></section>}

        {screen === "summary" && <section className="screen-overlay summary-screen"><div className="summary-card"><span className="eyebrow">END OF RUN REPORT</span><h2>{gameRef.current.suspicion >= 100 ? "ESCORTED\nOUT." : "CLOCKED\nOUT."}</h2>
          {summary.newBest && <div className="new-record">NEW OFFICE RECORD</div>}<div className="final-score"><span>PRODUCTIVITY</span><strong>{summary.score.toLocaleString()}</strong></div>
          <div className="summary-stats"><div><span>BEST COMBO</span><b>×{summary.bestCombo.toFixed(1)}</b></div><div><span>DISTANCE</span><b>{summary.distance}M</b></div><div><span>HIGH SCORE</span><b>{summary.highScore.toLocaleString()}</b></div></div>
          <button className="primary-btn" onClick={startGame}><span>RUN IT BACK</span><small>ENTER</small></button></div></section>}
      </div>
      <footer className="game-footer"><span>AUTO-RUN • THREE LANES • NO DRAG CONTROLS</span><span>100 SECOND OFFICE CHASE</span></footer>
    </main>
  );
}
