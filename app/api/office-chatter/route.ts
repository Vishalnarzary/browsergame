import { buildFreshOfficeChatterFallback } from "../../lib/officeChatterFallback";

type ChatterKind = "office" | "motivation";
type ChatterLine = { text: string; kind: ChatterKind };
type ChatterBatch = { sentences: ChatterLine[] };

const KINDS = new Set<ChatterKind>(["office", "motivation"]);

function normalizeLine(text: string) {
  return text.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

function cleanBatch(value: unknown, recentLines: string[]): ChatterBatch | null {
  if (!value || typeof value !== "object") return null;
  const batch = value as ChatterBatch;
  if (!Array.isArray(batch.sentences) || batch.sentences.length !== 7) return null;
  const seen = new Set(recentLines.map(normalizeLine));
  const sentences = batch.sentences.map((line) => {
    if (!line || typeof line.text !== "string" || !KINDS.has(line.kind)) return null;
    const text = line.text.replace(/[<>]/g, "").replace(/\s+/g, " ").trim();
    if (text.length < 8 || text.length > 90) return null;
    const normalized = normalizeLine(text);
    if (!normalized || seen.has(normalized)) return null;
    seen.add(normalized);
    return { text, kind: line.kind };
  });
  if (sentences.some((line) => line === null) || !sentences.some((line) => line?.kind === "motivation")) return null;
  return { sentences: sentences as ChatterLine[] };
}

export async function POST(request: Request) {
  let context: { elapsedSec: number; score: number; recentLines: string[] };
  try {
    const input = await request.json() as { elapsedSec?: number; score?: number; recentLines?: unknown };
    context = {
      elapsedSec: Math.max(0, Math.min(3600, Number(input.elapsedSec) || 0)),
      score: Math.max(0, Math.min(10_000_000, Number(input.score) || 0)),
      recentLines: Array.isArray(input.recentLines) ? input.recentLines.filter((line): line is string => typeof line === "string").slice(-300) : [],
    };
  } catch {
    return Response.json({ error: "Invalid chatter context." }, { status: 400 });
  }

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    const fallback = buildFreshOfficeChatterFallback(context.recentLines, context.elapsedSec);
    return fallback
      ? Response.json(fallback, { headers: { "Cache-Control": "no-store", "X-Chatter-Source": "fallback" } })
      : Response.json({ error: "Office chatter fallback exhausted." }, { status: 503 });
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 18000);
  try {
    const model = process.env.GEMINI_CHATTER_MODEL || "gemini-2.5-flash";
    const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`, {
      method: "POST",
      headers: { "x-goog-api-key": apiKey, "Content-Type": "application/json" },
      signal: controller.signal,
      body: JSON.stringify({
        contents: [
          {
            role: "user",
            parts: [
              {
                text: `You write short, funny, recognizable office dialogue for a PG arcade game. Return exactly 7 completely new, distinct sentences. Make the office lines genuinely playful, with light jokes about deadlines, meetings, spreadsheets, printers, coffee, inboxes, or corporate buzzwords. Each office line should contain a small punchline or amusing twist without becoming mean. At least one line must be an encouraging motivational quote about persistence, confidence, or doing great work; it may also be gently funny. Keep every line natural, standalone, under 90 characters, and avoid insults, threats, or sensitive topics. Never copy, lightly rewrite, or reuse the premise of anything in recentLines. Context: ${JSON.stringify(context)}`,
              },
            ],
          },
        ],
        generationConfig: {
          temperature: 0.95,
          maxOutputTokens: 700,
          thinkingConfig: { thinkingBudget: 0 },
          responseMimeType: "application/json",
          responseJsonSchema: {
            type: "object",
            additionalProperties: false,
            properties: {
              sentences: {
                type: "array",
                minItems: 7,
                maxItems: 7,
                items: {
                  type: "object",
                  additionalProperties: false,
                  properties: {
                    text: { type: "string", description: "A funny short office line or motivational quote under 90 characters." },
                    kind: { type: "string", enum: ["office", "motivation"] },
                  },
                  required: ["text", "kind"],
                },
              },
            },
            required: ["sentences"],
          },
        },
      }),
    });
    if (!response.ok) {
      const fallback = buildFreshOfficeChatterFallback(context.recentLines, context.elapsedSec);
      return fallback ? Response.json(fallback, { headers: { "Cache-Control": "no-store", "X-Chatter-Source": "fallback" } }) : Response.json({ error: "Office chatter provider unavailable." }, { status: 502 });
    }
    const payload = await response.json() as { candidates?: { content?: { parts?: { text?: string }[] } }[] };
    const content = payload.candidates?.[0]?.content?.parts?.find((part) => typeof part.text === "string")?.text;
    if (!content) {
      const fallback = buildFreshOfficeChatterFallback(context.recentLines, context.elapsedSec);
      return fallback ? Response.json(fallback, { headers: { "Cache-Control": "no-store", "X-Chatter-Source": "fallback" } }) : Response.json({ error: "Empty office chatter response." }, { status: 502 });
    }
    const batch = cleanBatch(JSON.parse(content), context.recentLines);
    if (!batch) {
      const fallback = buildFreshOfficeChatterFallback(context.recentLines, context.elapsedSec);
      return fallback ? Response.json(fallback, { headers: { "Cache-Control": "no-store", "X-Chatter-Source": "fallback" } }) : Response.json({ error: "Invalid office chatter batch." }, { status: 502 });
    }
    return Response.json(batch, { headers: { "Cache-Control": "no-store" } });
  } catch {
    const fallback = buildFreshOfficeChatterFallback(context.recentLines, context.elapsedSec);
    return fallback ? Response.json(fallback, { headers: { "Cache-Control": "no-store", "X-Chatter-Source": "fallback" } }) : Response.json({ error: "Office chatter planning timed out." }, { status: 504 });
  } finally {
    clearTimeout(timeout);
  }
}
