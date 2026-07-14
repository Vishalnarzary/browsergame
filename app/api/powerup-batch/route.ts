type PowerupKind = "titan" | "laser" | "long_leg" | "phase" | "clone";

type ClientContext = {
  score?: number;
  elapsedSec?: number;
  difficultyTier?: number;
  activePowerups?: string[];
  recentKinds?: string[];
};

type RawPowerup = {
  kind: PowerupKind;
  lane: number;
  spawn_offset_sec: number;
  pickup_window_sec: number;
  active_duration_sec: number;
  rarity: "common" | "rare" | "legendary";
};

type RawBatch = { batch_flavor: string; powerups: RawPowerup[] };

const KINDS = new Set<PowerupKind>(["titan", "laser", "long_leg", "phase", "clone"]);
const RARITIES = new Set(["common", "rare", "legendary"]);

function cleanBatch(value: unknown) {
  if (!value || typeof value !== "object") return null;
  const batch = value as RawBatch;
  if (typeof batch.batch_flavor !== "string" || !batch.batch_flavor.trim() || batch.batch_flavor.length > 100) return null;
  if (!Array.isArray(batch.powerups) || batch.powerups.length < 1 || batch.powerups.length > 4) return null;
  const powerups = batch.powerups.map((powerup) => {
    if (!powerup || !KINDS.has(powerup.kind) || !RARITIES.has(powerup.rarity)) return null;
    if (!Number.isInteger(powerup.lane) || powerup.lane < 0 || powerup.lane > 2) return null;
    if (!Number.isFinite(powerup.spawn_offset_sec) || powerup.spawn_offset_sec < 4 || powerup.spawn_offset_sec > 52) return null;
    if (!Number.isFinite(powerup.pickup_window_sec) || powerup.pickup_window_sec < 7 || powerup.pickup_window_sec > 16) return null;
    if (!Number.isFinite(powerup.active_duration_sec) || powerup.active_duration_sec < 6 || powerup.active_duration_sec > 18) return null;
    return {
      kind: powerup.kind,
      lane: powerup.lane,
      spawn_offset_sec: Math.round(powerup.spawn_offset_sec),
      pickup_window_sec: Math.round(powerup.pickup_window_sec),
      active_duration_sec: Math.round(powerup.active_duration_sec),
      rarity: powerup.rarity,
    };
  });
  if (powerups.some((powerup) => powerup === null)) return null;
  return { batch_flavor: batch.batch_flavor.replace(/[<>]/g, "").trim().slice(0, 100), powerups };
}

export async function POST(request: Request) {
  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) return Response.json({ error: "Powerup planner is using a local safety batch." }, { status: 503 });

  let context: Required<ClientContext>;
  try {
    const input = (await request.json()) as ClientContext;
    context = {
      score: Math.max(0, Math.min(10_000_000, Number(input.score) || 0)),
      elapsedSec: Math.max(0, Math.min(3600, Number(input.elapsedSec) || 0)),
      difficultyTier: Math.max(1, Math.min(5, Number(input.difficultyTier) || 1)),
      activePowerups: Array.isArray(input.activePowerups) ? input.activePowerups.filter((item) => typeof item === "string").slice(0, 5) : [],
      recentKinds: Array.isArray(input.recentKinds) ? input.recentKinds.filter((item) => typeof item === "string").slice(-8) : [],
    };
  } catch {
    return Response.json({ error: "Invalid powerup context." }, { status: 400 });
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 3500);
  const maxSpawnOffset = context.elapsedSec >= 58 ? 35 : 52;
  try {
    const response = await fetch("https://api.groq.com/openai/v1/chat/completions", {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      signal: controller.signal,
      body: JSON.stringify({
        model: process.env.GROQ_MODEL || "openai/gpt-oss-20b",
        temperature: 0.82,
        max_completion_tokens: 650,
        reasoning_effort: "low",
        messages: [
          {
            role: "system",
            content: `You are the powerup director for a fast PG office-comedy 3D runner. Plan 1 to 4 powerup drops for the next minute. You alone choose each kind, lane (0 left, 1 center, 2 right), spawn offset, visible pickup window, active duration, and rarity. Use varied lanes and staggered times. This run has 100 seconds total, so every spawn offset in this batch must be at most ${maxSpawnOffset} seconds. Avoid repeating recent kinds when possible. titan makes the hero huge and crushes two lanes; laser fires at distant targets; long_leg kicks across two lanes; phase passes through hazards and pursuers; clone covers the mirrored lane. Keep the batch useful but not trivial.`,
          },
          { role: "user", content: JSON.stringify(context) },
        ],
        response_format: {
          type: "json_schema",
          json_schema: {
            name: "corporate_wars_powerup_batch",
            strict: true,
            schema: {
              type: "object",
              additionalProperties: false,
              properties: {
                batch_flavor: { type: "string", minLength: 8, maxLength: 100 },
                powerups: {
                  type: "array", minItems: 1, maxItems: 4,
                  items: {
                    type: "object", additionalProperties: false,
                    properties: {
                      kind: { type: "string", enum: ["titan", "laser", "long_leg", "phase", "clone"] },
                      lane: { type: "integer", minimum: 0, maximum: 2 },
                      spawn_offset_sec: { type: "integer", minimum: 4, maximum: maxSpawnOffset },
                      pickup_window_sec: { type: "integer", minimum: 7, maximum: 16 },
                      active_duration_sec: { type: "integer", minimum: 6, maximum: 18 },
                      rarity: { type: "string", enum: ["common", "rare", "legendary"] },
                    },
                    required: ["kind", "lane", "spawn_offset_sec", "pickup_window_sec", "active_duration_sec", "rarity"],
                  },
                },
              },
              required: ["batch_flavor", "powerups"],
            },
          },
        },
      }),
    });
    if (!response.ok) return Response.json({ error: "Powerup provider unavailable." }, { status: 502 });
    const payload = (await response.json()) as { choices?: { message?: { content?: string } }[] };
    const content = payload.choices?.[0]?.message?.content;
    if (!content) return Response.json({ error: "Empty powerup response." }, { status: 502 });
    const batch = cleanBatch(JSON.parse(content));
    if (!batch) return Response.json({ error: "Invalid powerup batch." }, { status: 502 });
    return Response.json(batch, { headers: { "Cache-Control": "no-store" } });
  } catch {
    return Response.json({ error: "Powerup planning timed out." }, { status: 504 });
  } finally {
    clearTimeout(timeout);
  }
}
