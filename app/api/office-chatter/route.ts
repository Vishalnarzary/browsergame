type ChatterKind = "office" | "motivation";
type ChatterLine = { text: string; kind: ChatterKind };
type ChatterBatch = { sentences: ChatterLine[] };

const KINDS = new Set<ChatterKind>(["office", "motivation"]);

function cleanBatch(value: unknown): ChatterBatch | null {
  if (!value || typeof value !== "object") return null;
  const batch = value as ChatterBatch;
  if (!Array.isArray(batch.sentences) || batch.sentences.length < 3 || batch.sentences.length > 5) return null;
  const sentences = batch.sentences.map((line) => {
    if (!line || typeof line.text !== "string" || !KINDS.has(line.kind)) return null;
    const text = line.text.replace(/[<>]/g, "").replace(/\s+/g, " ").trim();
    if (text.length < 8 || text.length > 90) return null;
    return { text, kind: line.kind };
  });
  if (sentences.some((line) => line === null) || !sentences.some((line) => line?.kind === "motivation")) return null;
  return { sentences: sentences as ChatterLine[] };
}

export async function POST(request: Request) {
  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) return Response.json({ error: "Office chatter is using local fallback lines." }, { status: 503 });

  let context: { elapsedSec: number; score: number; recentLines: string[] };
  try {
    const input = await request.json() as { elapsedSec?: number; score?: number; recentLines?: unknown };
    context = {
      elapsedSec: Math.max(0, Math.min(3600, Number(input.elapsedSec) || 0)),
      score: Math.max(0, Math.min(10_000_000, Number(input.score) || 0)),
      recentLines: Array.isArray(input.recentLines) ? input.recentLines.filter((line): line is string => typeof line === "string").slice(-10) : [],
    };
  } catch {
    return Response.json({ error: "Invalid chatter context." }, { status: 400 });
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 3500);
  try {
    const response = await fetch("https://api.groq.com/openai/v1/chat/completions", {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      signal: controller.signal,
      body: JSON.stringify({
        model: process.env.GROQ_MODEL || "openai/gpt-oss-20b",
        temperature: 0.9,
        max_completion_tokens: 520,
        reasoning_effort: "low",
        messages: [
          {
            role: "system",
            content: "You write short, funny, recognizable office dialogue for a PG arcade game. Return 3 to 5 distinct sentences. Most should sound like workplace reminders, deadline comments, meeting chatter, or productivity remarks. At least one must be an encouraging motivational quote such as a persistence or confidence message. Keep every line natural, standalone, under 90 characters, and avoid insults, threats, sensitive topics, or repeating recent lines.",
          },
          { role: "user", content: JSON.stringify(context) },
        ],
        response_format: {
          type: "json_schema",
          json_schema: {
            name: "corporate_wars_office_chatter",
            strict: true,
            schema: {
              type: "object",
              additionalProperties: false,
              properties: {
                sentences: {
                  type: "array",
                  minItems: 3,
                  maxItems: 5,
                  items: {
                    type: "object",
                    additionalProperties: false,
                    properties: {
                      text: { type: "string", minLength: 8, maxLength: 90 },
                      kind: { type: "string", enum: ["office", "motivation"] },
                    },
                    required: ["text", "kind"],
                  },
                },
              },
              required: ["sentences"],
            },
          },
        },
      }),
    });
    if (!response.ok) return Response.json({ error: "Office chatter provider unavailable." }, { status: 502 });
    const payload = await response.json() as { choices?: { message?: { content?: string } }[] };
    const content = payload.choices?.[0]?.message?.content;
    if (!content) return Response.json({ error: "Empty office chatter response." }, { status: 502 });
    const batch = cleanBatch(JSON.parse(content));
    if (!batch) return Response.json({ error: "Invalid office chatter batch." }, { status: 502 });
    return Response.json(batch, { headers: { "Cache-Control": "no-store" } });
  } catch {
    return Response.json({ error: "Office chatter planning timed out." }, { status: 504 });
  } finally {
    clearTimeout(timeout);
  }
}
