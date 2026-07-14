type ClientContext = {
  score?: number;
  elapsedSec?: number;
  difficultyTier?: number;
  recentEventTypes?: string[];
};

type RawEvent = {
  event_type: "spawn_modifier" | "score_modifier" | "hazard_toggle" | "flavor_only";
  duration_sec: number;
  params: {
    spawn_rate_multiplier: number | null;
    target_type: "colleague" | "manager" | "hr" | "intern" | "ceo" | "any" | null;
    score_multiplier: number | null;
    suspicion_decay_multiplier: number | null;
    hr_suspicion_multiplier: number | null;
  };
  flavor_text: string;
  rarity: "common" | "rare" | "legendary";
};

const EVENT_TYPES = new Set(["spawn_modifier", "score_modifier", "hazard_toggle", "flavor_only"]);
const RARITIES = new Set(["common", "rare", "legendary"]);
const TARGET_TYPES = new Set(["colleague", "manager", "hr", "intern", "ceo", "any"]);

function cleanEvent(value: unknown) {
  if (!value || typeof value !== "object") return null;
  const event = value as RawEvent;
  if (!EVENT_TYPES.has(event.event_type) || !RARITIES.has(event.rarity)) return null;
  if (!Number.isFinite(event.duration_sec) || event.duration_sec < 10 || event.duration_sec > 20) return null;
  if (typeof event.flavor_text !== "string" || !event.flavor_text.trim() || event.flavor_text.length > 140) return null;
  if (!event.params || typeof event.params !== "object") return null;

  const params: Record<string, number | string> = {};
  const numericKeys = ["spawn_rate_multiplier", "score_multiplier", "suspicion_decay_multiplier", "hr_suspicion_multiplier"] as const;
  for (const key of numericKeys) {
    const item = event.params[key];
    if (typeof item === "number" && Number.isFinite(item)) params[key] = item;
  }
  if (typeof event.params.target_type === "string" && TARGET_TYPES.has(event.params.target_type)) params.target_type = event.params.target_type;

  if (event.event_type === "spawn_modifier" && !("spawn_rate_multiplier" in params)) return null;
  if (event.event_type === "score_modifier" && !("score_multiplier" in params)) return null;
  if (event.event_type === "hazard_toggle" && !("suspicion_decay_multiplier" in params) && !("hr_suspicion_multiplier" in params)) return null;

  return {
    event_type: event.event_type,
    duration_sec: Math.round(event.duration_sec),
    params,
    flavor_text: event.flavor_text.replace(/[<>]/g, "").trim().slice(0, 140),
    rarity: event.rarity,
  };
}

export async function POST(request: Request) {
  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) return Response.json({ error: "Novelty service is using local fallbacks." }, { status: 503 });

  let context: ClientContext = {};
  try {
    const input = (await request.json()) as ClientContext;
    context = {
      score: Math.max(0, Math.min(10_000_000, Number(input.score) || 0)),
      elapsedSec: Math.max(0, Math.min(600, Number(input.elapsedSec) || 0)),
      difficultyTier: Math.max(1, Math.min(3, Number(input.difficultyTier) || 1)),
      recentEventTypes: Array.isArray(input.recentEventTypes) ? input.recentEventTypes.filter((item) => typeof item === "string").slice(-4) : [],
    };
  } catch {
    return Response.json({ error: "Invalid request." }, { status: 400 });
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 2200);
  try {
    const response = await fetch("https://api.groq.com/openai/v1/chat/completions", {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      signal: controller.signal,
      body: JSON.stringify({
        model: process.env.GROQ_MODEL || "openai/gpt-oss-20b",
        temperature: 0.9,
        max_completion_tokens: 180,
        reasoning_effort: "low",
        messages: [
          {
            role: "system",
            content: "You create short, surprising modifiers for a PG office-comedy arcade game. Never mention real people, brands, politics, violence beyond cartoon slaps, or workplace protected traits. Be punchy and playful. Choose params that match the event type. Avoid the recently used event types when possible.",
          },
          { role: "user", content: JSON.stringify(context) },
        ],
        response_format: {
          type: "json_schema",
          json_schema: {
            name: "corporate_wars_novelty_event",
            strict: true,
            schema: {
              type: "object",
              additionalProperties: false,
              properties: {
                event_type: { type: "string", enum: ["spawn_modifier", "score_modifier", "hazard_toggle", "flavor_only"] },
                duration_sec: { type: "integer", minimum: 10, maximum: 20 },
                params: {
                  type: "object",
                  additionalProperties: false,
                  properties: {
                    spawn_rate_multiplier: { type: ["number", "null"], minimum: 0.75, maximum: 1.8 },
                    target_type: { type: ["string", "null"], enum: ["colleague", "manager", "hr", "intern", "ceo", "any", null] },
                    score_multiplier: { type: ["number", "null"], minimum: 1, maximum: 4 },
                    suspicion_decay_multiplier: { type: ["number", "null"], minimum: 1, maximum: 4 },
                    hr_suspicion_multiplier: { type: ["number", "null"], minimum: 0.35, maximum: 1.5 },
                  },
                  required: ["spawn_rate_multiplier", "target_type", "score_multiplier", "suspicion_decay_multiplier", "hr_suspicion_multiplier"],
                },
                flavor_text: { type: "string", minLength: 12, maxLength: 140 },
                rarity: { type: "string", enum: ["common", "rare", "legendary"] },
              },
              required: ["event_type", "duration_sec", "params", "flavor_text", "rarity"],
            },
          },
        },
      }),
    });
    if (!response.ok) return Response.json({ error: "Novelty provider unavailable." }, { status: 502 });
    const payload = (await response.json()) as { choices?: { message?: { content?: string } }[] };
    const content = payload.choices?.[0]?.message?.content;
    if (!content) return Response.json({ error: "Empty novelty response." }, { status: 502 });
    const event = cleanEvent(JSON.parse(content));
    if (!event) return Response.json({ error: "Invalid novelty response." }, { status: 502 });
    return Response.json(event, { headers: { "Cache-Control": "no-store" } });
  } catch {
    return Response.json({ error: "Novelty request timed out." }, { status: 504 });
  } finally {
    clearTimeout(timeout);
  }
}
