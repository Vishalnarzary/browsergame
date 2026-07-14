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
  const openings = new Set<string>();
  const sentences = batch.sentences.map((line) => {
    if (!line || typeof line.text !== "string" || !KINDS.has(line.kind)) return null;
    let text = line.text
      .replace(/[\u2018\u2019]/g, "'")
      .replace(/[\u201c\u201d]/g, '"')
      .replace(/[\u2013\u2014]/g, "-")
      .replace(/[^\x20-\x7e]/g, "")
      .replace(/[<>]/g, "")
      .replace(/\s+/g, " ")
      .trim()
      .replace(/^(?:warning|plot twist|reminder|quick update|breaking news|status|tiny request|heads up|update|note|today(?:'s|s) plan|good news|bad news)\s*:\s*/i, "");
    if (text.length > 90) text = `${text.slice(0, 87).replace(/\s+\S*$/, "").trimEnd()}...`;
    if (text.length < 8) return null;
    const normalized = normalizeLine(text);
    const opening = normalized.split(" ").slice(0, 2).join(" ");
    if (!normalized || normalized.startsWith("finish the") || seen.has(normalized) || openings.has(opening)) return null;
    seen.add(normalized);
    openings.add(opening);
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

  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) {
    const fallback = buildFreshOfficeChatterFallback(context.recentLines, context.elapsedSec);
    return fallback
      ? Response.json(fallback, { headers: { "Cache-Control": "no-store", "X-Chatter-Source": "fallback" } })
      : Response.json({ error: "Office chatter fallback exhausted." }, { status: 503 });
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 9000);
  try {
    const response = await fetch("https://api.groq.com/openai/v1/chat/completions", {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      signal: controller.signal,
      body: JSON.stringify({
        model: process.env.GROQ_CHATTER_MODEL || process.env.GROQ_MODEL || "openai/gpt-oss-20b",
        temperature: 0.95,
        max_completion_tokens: 800,
        reasoning_effort: "low",
        messages: [
          {
            role: "system",
            content: "You write short, funny, recognizable office dialogue for a PG arcade game. Return exactly 7 completely new, distinct sentences. Make the office lines playful, with light jokes about deadlines, meetings, spreadsheets, printers, coffee, inboxes, or corporate buzzwords. Every sentence must use a noticeably different natural opening and structure: mix questions, observations, requests, reactions, and punchlines. Return only the dialogue itself. Do not add category labels or announcement prefixes such as 'Warning:', 'Plot twist:', 'Reminder:', 'Quick update:', 'Breaking news:', 'Status:', 'Note:', 'Heads up:', or 'Today's plan:'. Never begin an office sentence with 'Finish the' and do not repeat an opening phrase within the batch. Each office line needs a small punchline without becoming mean. At least one line must be an encouraging motivational quote about persistence, confidence, or doing great work. Keep every line natural, standalone, under 90 characters, and avoid insults, threats, or sensitive topics. Use ASCII punctuation only: straight apostrophes and hyphens, with no smart quotes, em dashes, or emoji. Never copy, lightly rewrite, or reuse the premise of anything in recentLines.",
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
        },
      }),
    });
    if (!response.ok) {
      const fallback = buildFreshOfficeChatterFallback(context.recentLines, context.elapsedSec);
      return fallback ? Response.json(fallback, { headers: { "Cache-Control": "no-store", "X-Chatter-Source": "fallback" } }) : Response.json({ error: "Office chatter provider unavailable." }, { status: 502 });
    }
    const payload = await response.json() as { choices?: { message?: { content?: string } }[] };
    const content = payload.choices?.[0]?.message?.content;
    if (!content) {
      const fallback = buildFreshOfficeChatterFallback(context.recentLines, context.elapsedSec);
      return fallback ? Response.json(fallback, { headers: { "Cache-Control": "no-store", "X-Chatter-Source": "fallback" } }) : Response.json({ error: "Empty office chatter response." }, { status: 502 });
    }
    const batch = cleanBatch(JSON.parse(content), context.recentLines);
    if (!batch) {
      const fallback = buildFreshOfficeChatterFallback(context.recentLines, context.elapsedSec);
      return fallback ? Response.json(fallback, { headers: { "Cache-Control": "no-store", "X-Chatter-Source": "fallback" } }) : Response.json({ error: "Invalid office chatter batch." }, { status: 502 });
    }
    return Response.json(batch, { headers: { "Cache-Control": "no-store", "X-Chatter-Source": "groq" } });
  } catch {
    const fallback = buildFreshOfficeChatterFallback(context.recentLines, context.elapsedSec);
    return fallback ? Response.json(fallback, { headers: { "Cache-Control": "no-store", "X-Chatter-Source": "fallback" } }) : Response.json({ error: "Office chatter planning timed out." }, { status: 504 });
  } finally {
    clearTimeout(timeout);
  }
}
