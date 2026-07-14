import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

async function loadWorker() {
  const workerUrl = new URL("../dist/server/index.js", import.meta.url);
  workerUrl.searchParams.set("test", `${process.pid}-${Date.now()}`);
  return (await import(workerUrl.href)).default;
}

const env = {
  ASSETS: { fetch: async () => new Response("Not found", { status: 404 }) },
};
const context = { waitUntil() {}, passThroughOnException() {} };

test("server-renders the finished game shell", async () => {
  const worker = await loadWorker();
  const response = await worker.fetch(new Request("http://localhost/", { headers: { accept: "text/html" } }), env, context);
  assert.equal(response.status, 200);
  assert.match(response.headers.get("content-type") ?? "", /^text\/html\b/i);
  const html = await response.text();
  assert.match(html, /<title>Corporate Wars — Clock In\. Slap Out\.<\/title>/i);
  assert.match(html, /CORPORATE/);
  assert.match(html, /START RUNNING/);
  assert.match(html, /PERSONAL BEST/);
  assert.doesNotMatch(html, /codex-preview|Your site is taking shape|react-loading-skeleton/i);
});

test("ships the full loop and keeps the Groq key server-side", async () => {
  const [game, route, envExample] = await Promise.all([
    readFile(new URL("../app/components/CorporateWarsGame.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/api/novelty-event/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../.env.example", import.meta.url), "utf8"),
  ]);
  assert.match(game, /const RUN_SECONDS = 100/);
  assert.match(game, /const SLAP_MIN = 0\.68/);
  assert.match(game, /"start" \| "playing" \| "paused" \| "summary"/);
  assert.match(game, /FALLBACK_EVENTS/);
  assert.match(game, /attendance bonus/i);
  assert.match(game, /playerLane/);
  assert.match(game, /runDistance/);
  assert.match(game, /AUTO-RUN/);
  assert.match(game, /Digit/);
  assert.match(game, /ArrowLeft/);
  assert.match(route, /process\.env\.GROQ_API_KEY/);
  assert.match(route, /openai\/gpt-oss-20b/);
  assert.doesNotMatch(game, /GROQ_API_KEY|NEXT_PUBLIC/);
  assert.doesNotMatch(envExample, /NEXT_PUBLIC_GROQ/);
});

test("novelty endpoint fails fast without a secret so the client can use local fallbacks", async () => {
  const worker = await loadWorker();
  const response = await worker.fetch(new Request("http://localhost/api/novelty-event", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ score: 100, elapsedSec: 60, difficultyTier: 2, recentEventTypes: [] }),
  }), env, context);
  assert.equal(response.status, 503);
});
