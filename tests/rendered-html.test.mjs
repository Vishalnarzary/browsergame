import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

async function loadWorker() {
  const workerUrl = new URL("../dist/server/index.js", import.meta.url);
  workerUrl.searchParams.set("test", `${process.pid}-${Date.now()}`);
  return (await import(workerUrl.href)).default;
}

const env = { ASSETS: { fetch: async () => new Response("Not found", { status: 404 }) } };
const context = { waitUntil() {}, passThroughOnException() {} };

test("server-renders the finished game shell", async () => {
  const worker = await loadWorker();
  const response = await worker.fetch(new Request("http://localhost/", { headers: { accept: "text/html" } }), env, context);
  assert.equal(response.status, 200);
  assert.match(response.headers.get("content-type") ?? "", /^text\/html\b/i);
  const html = await response.text();
  assert.match(html, /<title>Corporate Wars — Run Smart\. Slap Clean\.<\/title>/i);
  assert.match(html, /CORPORATE/);
  assert.match(html, /START RUNNING/);
  assert.match(html, /PERSONAL BEST/);
  assert.match(html, /REAL 3D OFFICE RUNNER/);
  assert.doesNotMatch(html, /codex-preview|Your site is taking shape|react-loading-skeleton/i);
});

test("ships the strategic 3D loop and keeps the Groq key server-side", async () => {
  const [game, scene, route, envExample] = await Promise.all([
    readFile(new URL("../app/components/CorporateWarsGame.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/components/OfficeRunner3D.ts", import.meta.url), "utf8"),
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
  assert.match(game, /THROTTLE \/ BRAKE \/ JUMP/);
  assert.match(game, /FLOW STATE/);
  assert.match(game, /CLEAN BACK HIT/);
  assert.match(game, /"cart" \| "coffee"/);
  assert.match(game, /"table"/);
  assert.match(game, /DEADLINE DASH/);
  assert.match(game, /const resolveSlap/);
  assert.match(game, /corporate-wars-career/);
  assert.match(game, /CONTRACTS/);
  assert.match(game, /RANKS/);
  assert.match(game, /SIDE HIT — PURSUER JOINED/);
  assert.match(game, /PURSUER BAITED INTO CART/);
  assert.match(game, /CLEAN_COMMIT_Z/);
  assert.match(game, /Digit/);
  assert.match(game, /ArrowLeft/);
  assert.match(game, /KeyW/);
  assert.match(game, /KeyS/);
  assert.match(game, /triggerJump/);
  assert.match(game, /TABLE VAULT/);
  assert.match(game, /hitStopUntil/);
  assert.match(scene, /"desk" \| "chatting" \| "phone" \| "presenting"/);
  assert.match(scene, /new THREE\.WebGLRenderer/);
  assert.match(scene, /new THREE\.PerspectiveCamera/);
  assert.match(scene, /animateRig/);
  assert.match(scene, /makeImpact/);
  assert.match(scene, /speedMarkers/);
  assert.match(scene, /scene\.rotation\.y = Math\.PI/);
  assert.match(scene, /new THREE\.PlaneGeometry\(0\.98, 0\.36\)/);
  assert.match(scene, /roleTexture/);
  assert.match(scene, /new THREE\.CapsuleGeometry/);
  assert.match(scene, /new THREE\.SphereGeometry/);
  assert.match(scene, /segment\.position\.z = -108 \+ cycle/);
  assert.match(scene, /this\.camera\.position\.set\(0, 8\.8, 22\.5\)/);
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
