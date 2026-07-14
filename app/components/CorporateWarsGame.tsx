"use client";

import { useCallback, useEffect, useRef, useState } from "react";

type Screen = "start" | "playing" | "paused" | "summary";
type TargetType = "colleague" | "manager" | "hr" | "intern" | "ceo";
type EventType = "spawn_modifier" | "score_modifier" | "hazard_toggle" | "flavor_only";

type Target = {
  id: number;
  lane: number;
  type: TargetType;
  born: number;
  telegraph: number;
  vulnerable: number;
  resolved: boolean;
  hitAt?: number;
};

type Particle = {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  maxLife: number;
  color: string;
  size: number;
  spin: number;
};

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
  slapLane: number;
  shake: number;
  flash: number;
  firstHit: boolean;
  recentEvents: string[];
};

const WIDTH = 1200;
const HEIGHT = 700;
const RUN_SECONDS = 100;
const LANE_X = [132, 360, 600, 840, 1068];
const LANE_Y = [536, 490, 466, 490, 536];
const LANE_SCALE = [0.84, 0.94, 1, 0.94, 0.84];

const TARGETS: Record<TargetType, { points: number; min: number; max: number; color: string; label: string; role: string }> = {
  colleague: { points: 10, min: 1800, max: 2200, color: "#f5d36f", label: "COLLEAGUE", role: "safe" },
  manager: { points: 50, min: 1000, max: 1400, color: "#ff8b61", label: "MANAGER", role: "timing" },
  hr: { points: 150, min: 650, max: 900, color: "#ff5370", label: "HR", role: "risky" },
  intern: { points: 20, min: 850, max: 1800, color: "#61d8c9", label: "INTERN", role: "wild" },
  ceo: { points: 500, min: 450, max: 600, color: "#c998ff", label: "CEO", role: "bonus" },
};

const FALLBACK_EVENTS: NoveltyEvent[] = [
  { event_type: "spawn_modifier", duration_sec: 16, params: { spawn_rate_multiplier: 1.55, target_type: "manager" }, flavor_text: "Quarterly review! Managers are multiplying in the hallway.", rarity: "common" },
  { event_type: "score_modifier", duration_sec: 14, params: { score_multiplier: 2 }, flavor_text: "Espresso machine repaired — DOUBLE POINTS while it lasts!", rarity: "rare" },
  { event_type: "spawn_modifier", duration_sec: 15, params: { spawn_rate_multiplier: 1.4, target_type: "any" }, flavor_text: "Fire drill! Everybody is in the hallway at once.", rarity: "common" },
  { event_type: "hazard_toggle", duration_sec: 18, params: { suspicion_decay_multiplier: 3 }, flavor_text: "Security is stuck in a webinar. Suspicion cools faster.", rarity: "common" },
  { event_type: "score_modifier", duration_sec: 16, params: { target_type: "intern", score_multiplier: 4 }, flavor_text: "Mentorship week: interns are suddenly worth a fortune.", rarity: "rare" },
  { event_type: "hazard_toggle", duration_sec: 14, params: { hr_suspicion_multiplier: 0.5 }, flavor_text: "Casual Friday! HR is feeling unusually forgiving.", rarity: "rare" },
  { event_type: "spawn_modifier", duration_sec: 15, params: { spawn_rate_multiplier: 1.25, target_type: "intern" }, flavor_text: "Campus tour incoming — interns have taken over the floor.", rarity: "common" },
  { event_type: "score_modifier", duration_sec: 12, params: { score_multiplier: 1.5 }, flavor_text: "Synergy surge! Every slap is 50% more productive.", rarity: "common" },
  { event_type: "flavor_only", duration_sec: 12, params: {}, flavor_text: "The printer sensed fear. It is working perfectly for twelve seconds.", rarity: "common" },
  { event_type: "spawn_modifier", duration_sec: 13, params: { spawn_rate_multiplier: 1.35, target_type: "hr" }, flavor_text: "Mandatory culture survey. HR is everywhere — choose wisely.", rarity: "legendary" },
];

function makeGame(now: number): GameData {
  return {
    startedAt: now,
    pausedAt: 0,
    pausedTotal: 0,
    score: 0,
    combo: 1,
    bestCombo: 1,
    suspicion: 0,
    selectedLane: 2,
    targets: [],
    particles: [],
    popups: [],
    nextSpawnAt: now + 650,
    targetId: 0,
    lastFrame: now,
    lastHud: 0,
    lastSalaryAt: 0,
    scriptedFired: false,
    liveFired: false,
    ceoFired: false,
    activeEvent: null,
    eventEndsAt: 0,
    slapAt: -1000,
    slapLane: 2,
    shake: 0,
    flash: 0,
    firstHit: false,
    recentEvents: [],
  };
}

function clamp(n: number, min: number, max: number) {
  return Math.max(min, Math.min(max, n));
}

function mulberry32(seed: number) {
  let t = seed;
  return () => {
    t += 0x6d2b79f5;
    let r = Math.imul(t ^ (t >>> 15), 1 | t);
    r ^= r + Math.imul(r ^ (r >>> 7), 61 | r);
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
  };
}

function roundedRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  const radius = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.roundRect(x, y, w, h, radius);
}

function drawOffice(ctx: CanvasRenderingContext2D, game: GameData, now: number) {
  const elapsed = (now - game.startedAt - game.pausedTotal) / 1000;
  const pulse = Math.sin(now / 780) * 0.5 + 0.5;

  const sky = ctx.createLinearGradient(0, 0, 0, HEIGHT);
  sky.addColorStop(0, "#101d31");
  sky.addColorStop(0.48, "#263a50");
  sky.addColorStop(1, "#0d1725");
  ctx.fillStyle = sky;
  ctx.fillRect(0, 0, WIDTH, HEIGHT);

  // Ceiling and side walls converge on a vanishing point.
  ctx.fillStyle = "#18283a";
  ctx.beginPath();
  ctx.moveTo(0, 0); ctx.lineTo(WIDTH, 0); ctx.lineTo(790, 210); ctx.lineTo(410, 210); ctx.closePath(); ctx.fill();

  ctx.fillStyle = "#2b4052";
  ctx.beginPath();
  ctx.moveTo(0, 0); ctx.lineTo(410, 210); ctx.lineTo(410, 525); ctx.lineTo(0, HEIGHT); ctx.closePath(); ctx.fill();
  ctx.fillStyle = "#23384b";
  ctx.beginPath();
  ctx.moveTo(WIDTH, 0); ctx.lineTo(790, 210); ctx.lineTo(790, 525); ctx.lineTo(WIDTH, HEIGHT); ctx.closePath(); ctx.fill();

  // Glowing far wall.
  const far = ctx.createLinearGradient(0, 210, 0, 525);
  far.addColorStop(0, "#6d8790");
  far.addColorStop(1, "#263b4c");
  ctx.fillStyle = far;
  ctx.fillRect(410, 210, 380, 315);
  ctx.fillStyle = `rgba(181, 247, 225, ${0.08 + pulse * 0.05})`;
  ctx.fillRect(430, 235, 340, 118);

  // Ceiling light panels.
  for (let i = 0; i < 4; i++) {
    const w = 150 - i * 20;
    const y = 28 + i * 48;
    const x = WIDTH / 2 - w / 2;
    ctx.fillStyle = `rgba(215,255,240,${0.13 + (i === 2 ? pulse * 0.06 : 0)})`;
    ctx.beginPath();
    ctx.moveTo(x - 25, y); ctx.lineTo(x + w + 25, y); ctx.lineTo(x + w, y + 19); ctx.lineTo(x, y + 19); ctx.closePath(); ctx.fill();
  }

  // Perspective floor.
  const floor = ctx.createLinearGradient(0, 420, 0, HEIGHT);
  floor.addColorStop(0, "#314353");
  floor.addColorStop(1, "#0c1420");
  ctx.fillStyle = floor;
  ctx.beginPath();
  ctx.moveTo(410, 420); ctx.lineTo(790, 420); ctx.lineTo(1110, HEIGHT); ctx.lineTo(90, HEIGHT); ctx.closePath(); ctx.fill();

  ctx.strokeStyle = "rgba(176,211,207,.11)";
  ctx.lineWidth = 2;
  for (let i = -5; i <= 5; i++) {
    ctx.beginPath(); ctx.moveTo(600 + i * 40, 420); ctx.lineTo(600 + i * 105, HEIGHT); ctx.stroke();
  }
  for (let y = 455; y < 700; y += 48) {
    const p = (y - 420) / 280;
    ctx.beginPath(); ctx.moveTo(410 - p * 320, y); ctx.lineTo(790 + p * 320, y); ctx.stroke();
  }

  // Ambient moving silhouettes behind frosted glass.
  const walkerX = 420 + ((elapsed * 42) % 620);
  ctx.globalAlpha = 0.12;
  ctx.fillStyle = "#b9ffe8";
  ctx.beginPath(); ctx.arc(walkerX, 302, 13, 0, Math.PI * 2); ctx.fill();
  roundedRect(ctx, walkerX - 10, 314, 20, 55, 8); ctx.fill();
  ctx.globalAlpha = 1;

  // Workstations/lane portals.
  for (let i = 0; i < 5; i++) {
    const x = LANE_X[i];
    const y = LANE_Y[i];
    const s = LANE_SCALE[i];
    const selected = game.selectedLane === i;
    ctx.save();
    ctx.translate(x, y);
    ctx.scale(s, s);

    if (selected) {
      const beam = ctx.createRadialGradient(0, 44, 10, 0, 44, 105);
      beam.addColorStop(0, "rgba(111,255,211,.28)");
      beam.addColorStop(1, "rgba(111,255,211,0)");
      ctx.fillStyle = beam;
      ctx.beginPath(); ctx.ellipse(0, 48, 116, 45, 0, 0, Math.PI * 2); ctx.fill();
    }

    ctx.fillStyle = "rgba(0,0,0,.42)";
    ctx.beginPath(); ctx.ellipse(0, 58, 90, 23, 0, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = selected ? "#344f5d" : "#293d4b";
    roundedRect(ctx, -92, -48, 184, 93, 12); ctx.fill();
    ctx.fillStyle = "#0c1722";
    roundedRect(ctx, -82, -40, 164, 66, 8); ctx.fill();
    ctx.fillStyle = selected ? "#82f8cf" : "#557383";
    ctx.fillRect(-92, 31, 184, 9);
    ctx.fillStyle = "#1a2935";
    roundedRect(ctx, -77, 40, 18, 58, 4); ctx.fill();
    roundedRect(ctx, 59, 40, 18, 58, 4); ctx.fill();

    ctx.fillStyle = selected ? "rgba(130,248,207,.14)" : "rgba(255,255,255,.04)";
    roundedRect(ctx, -38, 47, 76, 25, 12); ctx.fill();
    ctx.fillStyle = selected ? "#c6ffed" : "#9ab0b8";
    ctx.font = "700 12px ui-monospace, monospace";
    ctx.textAlign = "center";
    ctx.fillText(`0${i + 1}`, 0, 64);
    ctx.restore();
  }
}

function drawCharacter(ctx: CanvasRenderingContext2D, target: Target, now: number, selected: boolean) {
  const cfg = TARGETS[target.type];
  const age = now - target.born;
  const vulnerable = age >= target.telegraph && age <= target.telegraph + target.vulnerable;
  const tTele = clamp(age / target.telegraph, 0, 1);
  const exitT = clamp((age - target.telegraph - target.vulnerable) / 420, 0, 1);
  const hitT = target.hitAt ? clamp((now - target.hitAt) / 320, 0, 1) : 0;
  const x = LANE_X[target.lane];
  const y = LANE_Y[target.lane] - 38;
  const s = LANE_SCALE[target.lane] * (target.type === "ceo" ? 1.08 : 1);
  const rise = vulnerable ? 1 : tTele;
  const hiddenY = (1 - rise) * 115 + exitT * 120;
  const bounce = vulnerable ? Math.sin(age / 115) * 3 : 0;

  ctx.save();
  ctx.translate(x, y + hiddenY + bounce);
  ctx.scale(s * (target.resolved ? 1.18 - hitT * 0.18 : 1), s * (target.resolved ? 0.62 + hitT * 0.38 : 1));

  // Target glow and vulnerability ring.
  if (vulnerable && !target.resolved) {
    const glow = ctx.createRadialGradient(0, -78, 12, 0, -78, 95);
    glow.addColorStop(0, `${cfg.color}66`);
    glow.addColorStop(1, `${cfg.color}00`);
    ctx.fillStyle = glow;
    ctx.beginPath(); ctx.arc(0, -78, 95, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = cfg.color;
    ctx.lineWidth = selected ? 5 : 3;
    ctx.globalAlpha = 0.55 + Math.sin(now / 90) * 0.25;
    ctx.beginPath(); ctx.ellipse(0, -75, 58, 86, 0, 0, Math.PI * 2); ctx.stroke();
    ctx.globalAlpha = 1;
  }

  ctx.fillStyle = "rgba(0,0,0,.35)";
  ctx.beginPath(); ctx.ellipse(0, 41, 49, 13, 0, 0, Math.PI * 2); ctx.fill();

  // Legs.
  ctx.strokeStyle = target.type === "ceo" ? "#201932" : "#151e2a";
  ctx.lineWidth = 16;
  ctx.lineCap = "round";
  ctx.beginPath(); ctx.moveTo(-18, 8); ctx.lineTo(-25, 47); ctx.moveTo(18, 8); ctx.lineTo(25, 47); ctx.stroke();

  // Body and lapels.
  ctx.fillStyle = target.type === "hr" ? "#b42e56" : target.type === "intern" ? "#237f79" : target.type === "ceo" ? "#352553" : target.type === "manager" ? "#8f3f38" : "#34536a";
  roundedRect(ctx, -48, -103, 96, 122, 25); ctx.fill();
  ctx.fillStyle = "rgba(255,255,255,.17)";
  ctx.beginPath(); ctx.moveTo(-30, -97); ctx.lineTo(0, -53); ctx.lineTo(30, -97); ctx.closePath(); ctx.fill();
  ctx.fillStyle = target.type === "hr" ? "#ffd65a" : "#ff7e66";
  ctx.beginPath(); ctx.moveTo(-5, -76); ctx.lineTo(5, -76); ctx.lineTo(9, -35); ctx.lineTo(0, -27); ctx.lineTo(-9, -35); ctx.closePath(); ctx.fill();

  // Head.
  ctx.fillStyle = target.type === "intern" ? "#9a633d" : target.type === "ceo" ? "#7a4d34" : "#b9764d";
  ctx.beginPath(); ctx.ellipse(0, -132, 38, 43, 0, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = target.type === "hr" ? "#3e1725" : target.type === "ceo" ? "#e0dfdb" : "#1d2631";
  ctx.beginPath(); ctx.arc(0, -142, 38, Math.PI, Math.PI * 2); ctx.lineTo(32, -137); ctx.quadraticCurveTo(0, -177, -33, -137); ctx.fill();

  // Face.
  ctx.fillStyle = "#111c24";
  ctx.beginPath(); ctx.arc(-13, -133, 3, 0, Math.PI * 2); ctx.arc(13, -133, 3, 0, Math.PI * 2); ctx.fill();
  ctx.strokeStyle = "#5e3027";
  ctx.lineWidth = 3;
  ctx.beginPath();
  if (target.resolved) { ctx.moveTo(-13, -117); ctx.quadraticCurveTo(0, -108, 13, -117); }
  else { ctx.moveTo(-12, -117); ctx.quadraticCurveTo(0, -124, 12, -117); }
  ctx.stroke();

  // Role props.
  if (target.type === "manager" || target.type === "hr") {
    ctx.fillStyle = "#e8f2ed"; roundedRect(ctx, 32, -64, 31, 48, 3); ctx.fill();
    ctx.fillStyle = cfg.color; ctx.fillRect(39, -55, 17, 4); ctx.fillRect(39, -46, 13, 3);
  }
  if (target.type === "intern") {
    ctx.strokeStyle = "#101a23"; ctx.lineWidth = 4;
    ctx.beginPath(); ctx.arc(-13, -132, 10, 0, Math.PI * 2); ctx.arc(13, -132, 10, 0, Math.PI * 2); ctx.moveTo(-3, -132); ctx.lineTo(3, -132); ctx.stroke();
  }
  if (target.type === "ceo") {
    ctx.fillStyle = "#f3ca55"; ctx.beginPath(); ctx.moveTo(-30, -171); ctx.lineTo(-20, -192); ctx.lineTo(-5, -176); ctx.lineTo(9, -197); ctx.lineTo(22, -176); ctx.lineTo(34, -193); ctx.lineTo(29, -166); ctx.closePath(); ctx.fill();
  }

  // Label plate.
  ctx.fillStyle = "rgba(8,15,23,.86)";
  roundedRect(ctx, -53, 56, 106, 25, 12); ctx.fill();
  ctx.fillStyle = cfg.color;
  ctx.font = "900 12px Arial, sans-serif";
  ctx.textAlign = "center";
  ctx.fillText(cfg.label, 0, 73);
  ctx.restore();
}

function drawEffects(ctx: CanvasRenderingContext2D, game: GameData, now: number) {
  for (const p of game.particles) {
    const a = clamp(p.life / p.maxLife, 0, 1);
    ctx.save(); ctx.globalAlpha = a; ctx.translate(p.x, p.y); ctx.rotate(p.spin * (1 - a));
    ctx.fillStyle = p.color; ctx.fillRect(-p.size / 2, -p.size / 3, p.size, p.size * 0.66); ctx.restore();
  }
  for (const pop of game.popups) {
    const t = clamp((now - pop.born) / 900, 0, 1);
    ctx.save(); ctx.globalAlpha = 1 - t; ctx.translate(pop.x, pop.y - t * 72); ctx.scale(1 + Math.sin(t * Math.PI) * 0.14, 1 + Math.sin(t * Math.PI) * 0.14);
    ctx.font = "900 29px Arial Black, Arial"; ctx.textAlign = "center"; ctx.lineWidth = 7; ctx.strokeStyle = "rgba(6,11,18,.8)"; ctx.strokeText(pop.text, 0, 0); ctx.fillStyle = pop.color; ctx.fillText(pop.text, 0, 0); ctx.restore();
  }

  // Exaggerated foreground slap hand.
  const slapT = (now - game.slapAt) / 380;
  if (slapT >= 0 && slapT <= 1) {
    const targetX = LANE_X[game.slapLane];
    const targetY = LANE_Y[game.slapLane] - 130;
    const eased = slapT < 0.42 ? 1 - Math.pow(1 - slapT / 0.42, 3) : 1 - (slapT - 0.42) / 0.58;
    const x = 600 + (targetX - 600) * eased;
    const y = 760 + (targetY - 760) * eased;
    const angle = (targetX - 600) / 900 + Math.sin(slapT * Math.PI) * 0.08;
    ctx.save(); ctx.translate(x, y); ctx.rotate(angle); ctx.shadowColor = "rgba(0,0,0,.4)"; ctx.shadowBlur = 18; ctx.shadowOffsetY = 12;
    ctx.strokeStyle = "#7f452f"; ctx.lineWidth = 42; ctx.lineCap = "round"; ctx.beginPath(); ctx.moveTo(0, 95); ctx.lineTo(0, 5); ctx.stroke();
    ctx.fillStyle = "#c47d53"; roundedRect(ctx, -35, -30, 70, 72, 30); ctx.fill();
    ctx.strokeStyle = "#c47d53"; ctx.lineWidth = 17;
    for (let i = 0; i < 4; i++) { ctx.beginPath(); ctx.moveTo(-25 + i * 17, -20); ctx.lineTo(-30 + i * 18, -62 - Math.abs(i - 1.5) * 4); ctx.stroke(); }
    ctx.restore();
  }
}

function getEventNumber(event: NoveltyEvent | null, key: string, fallback = 1) {
  const value = event?.params[key];
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
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
  const [hud, setHud] = useState({ score: 0, combo: 1, suspicion: 0, time: RUN_SECONDS });
  const [summary, setSummary] = useState({ score: 0, bestCombo: 1, highScore: 0, newBest: false });
  const [toast, setToast] = useState<NoveltyEvent | null>(null);
  const [toastVisible, setToastVisible] = useState(false);

  useEffect(() => {
    const saved = Number(localStorage.getItem("corporate-wars-best") || 0);
    setBest(Number.isFinite(saved) ? saved : 0);
  }, []);

  const ensureAudio = useCallback(() => {
    if (!audioRef.current) audioRef.current = new AudioContext();
    if (audioRef.current.state === "suspended") void audioRef.current.resume();
    return audioRef.current;
  }, []);

  const tone = useCallback((frequency: number, duration: number, type: OscillatorType = "square", volume = 0.05, slide = 0) => {
    if (mutedRef.current) return;
    const audio = ensureAudio();
    const osc = audio.createOscillator();
    const gain = audio.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(frequency, audio.currentTime);
    if (slide) osc.frequency.exponentialRampToValueAtTime(Math.max(30, frequency + slide), audio.currentTime + duration);
    gain.gain.setValueAtTime(volume, audio.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, audio.currentTime + duration);
    osc.connect(gain).connect(audio.destination);
    osc.start(); osc.stop(audio.currentTime + duration);
  }, [ensureAudio]);

  const impactSound = useCallback((type: TargetType) => {
    const base = type === "ceo" ? 130 : type === "hr" ? 180 : type === "manager" ? 230 : type === "intern" ? 310 : 270;
    tone(base, 0.16, "sawtooth", 0.08, -90);
    tone(base * 2.2, 0.08, "square", 0.035, -120);
  }, [tone]);

  const showEvent = useCallback((event: NoveltyEvent, now: number) => {
    const game = gameRef.current;
    game.activeEvent = event;
    game.eventEndsAt = now + event.duration_sec * 1000;
    game.recentEvents = [...game.recentEvents.slice(-3), event.event_type];
    setToast(event);
    setToastVisible(true);
    tone(event.rarity === "legendary" ? 620 : 480, 0.16, "triangle", 0.055, 180);
    window.setTimeout(() => setToastVisible(false), 4600);
  }, [tone]);

  const fetchNovelty = useCallback(async (elapsed: number, now: number) => {
    const game = gameRef.current;
    const controller = new AbortController();
    const timeout = window.setTimeout(() => controller.abort(), 2500);
    try {
      const response = await fetch("/api/novelty-event", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        signal: controller.signal,
        body: JSON.stringify({ score: game.score, elapsedSec: Math.floor(elapsed), difficultyTier: elapsed < 45 ? 1 : 2, recentEventTypes: game.recentEvents }),
      });
      if (!response.ok) throw new Error("fallback");
      const event = (await response.json()) as NoveltyEvent;
      showEvent(event, now);
    } catch {
      const choices = FALLBACK_EVENTS.filter((event) => !game.recentEvents.includes(event.event_type));
      showEvent((choices.length ? choices : FALLBACK_EVENTS)[Math.floor(Math.random() * (choices.length || FALLBACK_EVENTS.length))], now);
    } finally {
      window.clearTimeout(timeout);
    }
  }, [showEvent]);

  const spawnTarget = useCallback((now: number, elapsed: number) => {
    const game = gameRef.current;
    const occupied = new Set(game.targets.filter((target) => !target.resolved).map((target) => target.lane));
    const lanes = [0, 1, 2, 3, 4].filter((lane) => !occupied.has(lane));
    if (!lanes.length) return;
    const rand = mulberry32(Math.floor(now + game.targetId * 97));
    let type: TargetType = "colleague";

    const forced = game.activeEvent?.event_type === "spawn_modifier" ? game.activeEvent.params.target_type : undefined;
    if (forced && forced !== "any" && TARGETS[forced as TargetType] && elapsed >= 20 && rand() < 0.62) {
      type = forced as TargetType;
    } else if (elapsed < 20) {
      type = "colleague";
    } else if (elapsed < 45) {
      type = rand() < 0.7 ? "colleague" : "manager";
    } else {
      const r = rand();
      type = r < 0.42 ? "colleague" : r < 0.67 ? "manager" : r < 0.82 ? "intern" : "hr";
    }

    const safeVisible = game.targets.some((target) => target.type === "colleague" && !target.resolved);
    if (!safeVisible && elapsed > 12 && rand() < 0.5) type = "colleague";

    if (!game.ceoFired && elapsed > 52 && rand() < 0.075) {
      type = "ceo";
      game.ceoFired = true;
    }

    const lane = lanes[Math.floor(rand() * lanes.length)];
    const cfg = TARGETS[type];
    const difficultyShrink = type === "colleague" ? Math.min(300, elapsed * 2.5) : Math.min(160, elapsed * 1.4);
    const rawWindow = cfg.min + rand() * (cfg.max - cfg.min) - difficultyShrink;
    const vulnerable = type === "colleague" ? Math.max(1500, rawWindow) : Math.max(cfg.min * 0.82, rawWindow);
    game.targets.push({ id: ++game.targetId, lane, type, born: now, telegraph: 380 + rand() * 170, vulnerable, resolved: false });
  }, []);

  const finishGame = useCallback(() => {
    const game = gameRef.current;
    const highScore = Math.max(best, game.score);
    const newBest = game.score > best;
    if (newBest) {
      localStorage.setItem("corporate-wars-best", String(game.score));
      setBest(game.score);
    }
    setSummary({ score: game.score, bestCombo: game.bestCombo, highScore, newBest });
    screenRef.current = "summary";
    setScreen("summary");
    setToastVisible(false);
    tone(newBest ? 620 : 310, 0.3, "triangle", 0.06, newBest ? 310 : -130);
  }, [best, tone]);

  const startGame = useCallback(() => {
    ensureAudio();
    const now = performance.now();
    gameRef.current = makeGame(now);
    screenRef.current = "playing";
    setScreen("playing");
    setHud({ score: 0, combo: 1, suspicion: 0, time: RUN_SECONDS });
    setToast(null);
    setToastVisible(false);
    tone(320, 0.14, "triangle", 0.045, 220);
  }, [ensureAudio, tone]);

  const togglePause = useCallback(() => {
    const now = performance.now();
    const game = gameRef.current;
    if (screenRef.current === "playing") {
      game.pausedAt = now;
      screenRef.current = "paused";
      setScreen("paused");
    } else if (screenRef.current === "paused") {
      const delta = now - game.pausedAt;
      game.pausedTotal += delta;
      game.nextSpawnAt += delta;
      game.eventEndsAt += delta;
      game.targets.forEach((target) => { target.born += delta; if (target.hitAt) target.hitAt += delta; });
      game.popups.forEach((popup) => { popup.born += delta; });
      game.lastFrame = now;
      screenRef.current = "playing";
      setScreen("playing");
    }
  }, []);

  const slap = useCallback((lane: number) => {
    if (screenRef.current !== "playing") return;
    ensureAudio();
    const now = performance.now();
    const game = gameRef.current;
    game.selectedLane = lane;
    game.slapAt = now;
    game.slapLane = lane;
    const live = game.targets.find((target) => target.lane === lane && !target.resolved);
    tone(105, 0.07, "sawtooth", 0.025, 80);
    if (!live) return;

    const age = now - live.born;
    const vulnerable = age >= live.telegraph && age <= live.telegraph + live.vulnerable;
    const grace = live.type === "colleague" && age > live.telegraph + live.vulnerable && age < live.telegraph + live.vulnerable + 360;

    if (vulnerable || grace) {
      live.resolved = true;
      live.hitAt = now;
      const cfg = TARGETS[live.type];
      const event = game.activeEvent;
      let eventMultiplier = event?.event_type === "score_modifier" ? getEventNumber(event, "score_multiplier", 1) : 1;
      const eventTarget = event?.params.target_type;
      if (eventTarget && eventTarget !== live.type) eventMultiplier = 1;
      const graceMultiplier = grace ? 0.4 : 1;
      const points = Math.max(2, Math.round(cfg.points * game.combo * eventMultiplier * graceMultiplier));
      game.score += points;
      if (!grace) game.combo = Math.round((game.combo + 0.1) * 10) / 10;
      game.bestCombo = Math.max(game.bestCombo, game.combo);
      game.firstHit = true;
      if (live.type === "hr") {
        const hrMultiplier = event?.event_type === "hazard_toggle" ? getEventNumber(event, "hr_suspicion_multiplier", 1) : 1;
        game.suspicion += 15 * hrMultiplier;
      }
      game.shake = live.type === "ceo" ? 18 : live.type === "hr" ? 13 : 9;
      game.flash = 0.32;
      const x = LANE_X[lane];
      const y = LANE_Y[lane] - 120;
      const colors = [cfg.color, "#ffffff", "#6fffd3", "#ff8f62", "#fff1a6"];
      for (let i = 0; i < (live.type === "ceo" ? 30 : 18); i++) {
        const a = Math.random() * Math.PI * 2;
        const speed = 90 + Math.random() * 260;
        game.particles.push({ x, y, vx: Math.cos(a) * speed, vy: Math.sin(a) * speed - 90, life: 0.6 + Math.random() * 0.5, maxLife: 0.7 + Math.random() * 0.45, color: colors[i % colors.length], size: 8 + Math.random() * 13, spin: (Math.random() - 0.5) * 9 });
      }
      game.popups.push({ x, y: y - 40, text: grace ? `CLOSE! +${points}` : `+${points}  ×${(game.combo - (grace ? 0 : 0.1)).toFixed(1)}`, color: cfg.color, born: now });
      impactSound(live.type);
    } else if (live.type === "hr") {
      const hrMultiplier = game.activeEvent?.event_type === "hazard_toggle" ? getEventNumber(game.activeEvent, "hr_suspicion_multiplier", 1) : 1;
      game.suspicion += 25 * hrMultiplier;
      game.combo = 1;
      game.popups.push({ x: LANE_X[lane], y: LANE_Y[lane] - 150, text: "HR SAW THAT! +25%", color: "#ff5370", born: now });
      game.shake = 12;
      tone(110, 0.28, "sawtooth", 0.06, -45);
    } else if (live.type === "manager") {
      game.combo = Math.max(1, Math.round((game.combo - 0.3) * 10) / 10);
      game.popups.push({ x: LANE_X[lane], y: LANE_Y[lane] - 145, text: "COUNTERED!", color: "#ff8b61", born: now });
      tone(150, 0.14, "square", 0.035, -60);
    }
  }, [ensureAudio, impactSound, tone]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (["Space", "ArrowLeft", "ArrowRight", "Enter"].includes(event.code)) event.preventDefault();
      if (event.code === "Escape") {
        if (screenRef.current === "playing" || screenRef.current === "paused") togglePause();
        return;
      }
      if (screenRef.current === "start" && (event.code === "Enter" || event.code === "Space")) { startGame(); return; }
      if (screenRef.current === "summary" && (event.code === "Enter" || event.code === "Space")) { startGame(); return; }
      if (screenRef.current !== "playing") return;
      const game = gameRef.current;
      if (event.code.startsWith("Digit")) {
        const lane = Number(event.code.slice(5)) - 1;
        if (lane >= 0 && lane < 5) { game.selectedLane = lane; slap(lane); }
      } else if (event.code === "ArrowLeft") game.selectedLane = (game.selectedLane + 4) % 5;
      else if (event.code === "ArrowRight") game.selectedLane = (game.selectedLane + 1) % 5;
      else if (event.code === "Space") slap(game.selectedLane);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [slap, startGame, togglePause]);

  useEffect(() => {
    let raf = 0;
    const frame = (now: number) => {
      const canvas = canvasRef.current;
      if (!canvas) { raf = requestAnimationFrame(frame); return; }
      const ctx = canvas.getContext("2d");
      if (!ctx) { raf = requestAnimationFrame(frame); return; }
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      if (canvas.width !== WIDTH * dpr || canvas.height !== HEIGHT * dpr) {
        canvas.width = WIDTH * dpr; canvas.height = HEIGHT * dpr;
      }
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      const game = gameRef.current;

      if (screenRef.current === "playing") {
        const dt = Math.min(0.04, Math.max(0, (now - game.lastFrame) / 1000));
        const elapsed = (now - game.startedAt - game.pausedTotal) / 1000;
        const remaining = Math.max(0, RUN_SECONDS - elapsed);
        game.lastFrame = now;

        if (game.activeEvent && now >= game.eventEndsAt) game.activeEvent = null;
        const decay = game.activeEvent?.event_type === "hazard_toggle" ? getEventNumber(game.activeEvent, "suspicion_decay_multiplier", 1) : 1;
        game.suspicion = Math.max(0, game.suspicion - dt * decay);
        game.shake = Math.max(0, game.shake - dt * 42);
        game.flash = Math.max(0, game.flash - dt * 2.8);

        if (now >= game.nextSpawnAt) {
          spawnTarget(now, elapsed);
          const eventRate = game.activeEvent?.event_type === "spawn_modifier" ? getEventNumber(game.activeEvent, "spawn_rate_multiplier", 1) : 1;
          const base = Math.max(690, 1650 - elapsed * 9.2);
          game.nextSpawnAt = now + (base * (0.82 + Math.random() * 0.36)) / eventRate;
        }
        if (!game.scriptedFired && elapsed >= 35) {
          game.scriptedFired = true;
          showEvent(FALLBACK_EVENTS[2], now);
        }
        if (!game.liveFired && elapsed >= 60) {
          game.liveFired = true;
          void fetchNovelty(elapsed, now);
        }
        if (elapsed - game.lastSalaryAt >= 15) {
          game.lastSalaryAt = elapsed;
          game.score += 10;
          game.popups.push({ x: 600, y: 235, text: "+10 ATTENDANCE BONUS", color: "#9ad9c8", born: now });
        }

        game.targets = game.targets.filter((target) => target.resolved
          ? Boolean(target.hitAt && now - target.hitAt < 350)
          : now - target.born < target.telegraph + target.vulnerable + 470);
        game.particles.forEach((p) => { p.life -= dt; p.vy += 440 * dt; p.x += p.vx * dt; p.y += p.vy * dt; p.spin += dt; });
        game.particles = game.particles.filter((p) => p.life > 0);
        game.popups = game.popups.filter((popup) => now - popup.born < 950);

        if (now - game.lastHud > 80) {
          game.lastHud = now;
          setHud({ score: game.score, combo: game.combo, suspicion: Math.min(100, game.suspicion), time: Math.ceil(remaining) });
        }
        if (remaining <= 0 || game.suspicion >= 100) finishGame();
      } else {
        game.lastFrame = now;
      }

      ctx.save();
      if (game.shake > 0) ctx.translate((Math.random() - 0.5) * game.shake, (Math.random() - 0.5) * game.shake);
      const visualNow = screenRef.current === "paused" ? game.pausedAt : now;
      drawOffice(ctx, game, visualNow);
      const ordered = [...game.targets].sort((a, b) => LANE_Y[a.lane] - LANE_Y[b.lane]);
      for (const target of ordered) drawCharacter(ctx, target, visualNow, game.selectedLane === target.lane);
      drawEffects(ctx, game, visualNow);
      if (game.flash > 0) { ctx.fillStyle = `rgba(255,255,255,${game.flash})`; ctx.fillRect(0, 0, WIDTH, HEIGHT); }
      ctx.restore();
      raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(raf);
  }, [fetchNovelty, finishGame, showEvent, spawnTarget]);

  const onCanvasClick = (event: React.PointerEvent<HTMLCanvasElement>) => {
    const rect = event.currentTarget.getBoundingClientRect();
    const x = ((event.clientX - rect.left) / rect.width) * WIDTH;
    let lane = 0;
    let distance = Infinity;
    LANE_X.forEach((laneX, index) => { const d = Math.abs(laneX - x); if (d < distance) { distance = d; lane = index; } });
    slap(lane);
  };

  const toggleMute = () => {
    const next = !mutedRef.current;
    mutedRef.current = next;
    setMuted(next);
    if (!next) tone(420, 0.1, "triangle", 0.035, 80);
  };

  const suspicionColor = hud.suspicion > 72 ? "danger" : hud.suspicion > 38 ? "warn" : "safe";

  return (
    <main className="game-shell">
      <div className={`game-stage suspicion-${suspicionColor}`}>
        <canvas ref={canvasRef} className="game-canvas" onPointerDown={onCanvasClick} aria-label="Corporate hallway with five target lanes" />

        <div className="grain" aria-hidden="true" />
        <div className="top-brand" aria-hidden="true"><span>CW</span> CORPORATE WARS</div>

        {(screen === "playing" || screen === "paused") && (
          <>
            <section className="hud" aria-label="Game status">
              <div className="hud-card score-card">
                <span className="hud-label">PRODUCTIVITY</span>
                <strong>{hud.score.toLocaleString()}</strong>
                <span className="combo">×{hud.combo.toFixed(1)} COMBO</span>
              </div>
              <div className={`timer-card ${hud.time <= 10 ? "timer-danger" : ""}`}>
                <span>SHIFT ENDS IN</span><strong>{String(Math.floor(hud.time / 60)).padStart(2, "0")}:{String(hud.time % 60).padStart(2, "0")}</strong>
              </div>
              <div className="hud-card suspicion-card">
                <div className="suspicion-head"><span className="hud-label">SUSPICION</span><b>{Math.round(hud.suspicion)}%</b></div>
                <div className="meter"><i style={{ width: `${hud.suspicion}%` }} /></div>
                <small>{hud.suspicion > 72 ? "SECURITY INBOUND" : hud.suspicion > 38 ? "KEEP IT CASUAL" : "BLEND IN"}</small>
              </div>
            </section>

            <div className={`event-toast ${toastVisible ? "show" : ""} rarity-${toast?.rarity || "common"}`} role="status">
              <span className="event-kicker">OFFICE UPDATE</span>
              <b>{toast?.flavor_text}</b>
              {toast && <span className="event-duration">{toast.duration_sec}s</span>}
            </div>

            {!gameRef.current.firstHit && <div className="first-prompt"><kbd>CLICK</kbd> the glowing target <span>or press <kbd>1–5</kbd></span></div>}

            <div className="lane-hints" aria-hidden="true">{[1, 2, 3, 4, 5].map((n) => <span key={n} className={gameRef.current.selectedLane === n - 1 ? "active" : ""}>{n}</span>)}</div>

            <div className="game-actions">
              <button onClick={toggleMute} className="icon-btn" aria-label={muted ? "Turn sound on" : "Mute sound"}>{muted ? "SOUND OFF" : "SOUND ON"}</button>
              <button onClick={togglePause} className="icon-btn">{screen === "paused" ? "RESUME" : "PAUSE"}</button>
            </div>
          </>
        )}

        {screen === "start" && (
          <section className="screen-overlay start-screen">
            <div className="start-copy">
              <div className="eyebrow"><span>NEW SHIFT</span><i /> NO MORE SYNERGY</div>
              <h1>CORPORATE<br /><em>WARS</em></h1>
              <p>Clock in. Pick a lane. Slap your way through the org chart before Security connects the dots.</p>
              <button className="primary-btn" onClick={startGame}><span>START THE SHIFT</span><small>ENTER / SPACE</small></button>
              <div className="control-strip">
                <div><kbd>1–5</kbd><span>SLAP LANE</span></div>
                <div><kbd>← →</kbd><span>SELECT</span></div>
                <div><kbd>SPACE</kbd><span>SLAP</span></div>
                <div><kbd>ESC</kbd><span>PAUSE</span></div>
              </div>
            </div>
            <aside className="briefing-card">
              <span className="stamp">CONFIDENTIAL</span>
              <h2>THE FLOOR PLAN</h2>
              <div className="role-row safe"><b>10</b><span><strong>COLLEAGUE</strong>Safe. Generous timing.</span></div>
              <div className="role-row manager"><b>50</b><span><strong>MANAGER</strong>Quick. May counter.</span></div>
              <div className="role-row risky"><b>150</b><span><strong>HR</strong>Huge points. Raises suspicion.</span></div>
              <div className="role-row ceo"><b>500</b><span><strong>CEO</strong>Rare. Blink and miss it.</span></div>
              <div className="best-score"><span>PERSONAL BEST</span><strong>{best.toLocaleString()}</strong></div>
            </aside>
          </section>
        )}

        {screen === "paused" && (
          <section className="screen-overlay pause-screen">
            <div className="pause-card"><span className="eyebrow">UNSCHEDULED BREAK</span><h2>SHIFT<br />PAUSED</h2><p>The office stopped moving. Suspicion and timers are frozen.</p><button className="primary-btn" onClick={togglePause}><span>BACK TO WORK</span><small>ESC</small></button></div>
          </section>
        )}

        {screen === "summary" && (
          <section className="screen-overlay summary-screen">
            <div className="summary-card">
              <span className="eyebrow">END OF SHIFT REPORT</span>
              <h2>{gameRef.current.suspicion >= 100 ? "ESCORTED\nOUT." : "CLOCKED\nOUT."}</h2>
              {summary.newBest && <div className="new-record">NEW OFFICE RECORD</div>}
              <div className="final-score"><span>PRODUCTIVITY</span><strong>{summary.score.toLocaleString()}</strong></div>
              <div className="summary-stats"><div><span>BEST COMBO</span><b>×{summary.bestCombo.toFixed(1)}</b></div><div><span>HIGH SCORE</span><b>{summary.highScore.toLocaleString()}</b></div></div>
              <button className="primary-btn" onClick={startGame}><span>RUN IT BACK</span><small>ENTER</small></button>
            </div>
          </section>
        )}
      </div>
      <footer className="game-footer"><span>CLICK OR KEYBOARD • NO DRAG CONTROLS</span><span>100 SECOND ARCADE RUN</span></footer>
    </main>
  );
}
