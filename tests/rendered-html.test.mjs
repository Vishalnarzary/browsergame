import assert from "node:assert/strict";
import { readFile, stat } from "node:fs/promises";
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

test("ships the strategic 3D loop and keeps AI keys server-side", async () => {
  const [game, scene, route, powerupRoute, chatterRoute, envExample] = await Promise.all([
    readFile(new URL("../app/components/CorporateWarsGame.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/components/OfficeRunner3D.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/api/novelty-event/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/api/powerup-batch/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/api/office-chatter/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../.env.example", import.meta.url), "utf8"),
  ]);
  assert.doesNotMatch(game, /RUN_SECONDS/);
  assert.match(game, /ENDLESS SHIFT/);
  assert.match(game, /if \(game\.suspicion >= 100\) finishGame\(\)/);
  assert.doesNotMatch(game, /remaining <= 0/);
  assert.match(game, /type RunStyle = "planner" \| "sprinter" \| "trickster"/);
  assert.match(game, /DAILY_CONTRACT_TARGET = 2/);
  assert.match(game, /DAILY_REWARD = 300/);
  assert.match(game, /PB PACE/);
  assert.match(game, /CHOOSE YOUR RUN STYLE/);
  assert.match(game, /MASTERY CHAIN/);
  assert.match(game, /NEXT RUN/);
  assert.match(game, /no missed-day penalty/);
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
  assert.match(game, /game\.speedFactor >= 1\.12/);
  assert.match(game, /PURSUER OUTRUN/);
  assert.match(game, /triggerJump/);
  assert.match(game, /TABLE VAULT/);
  assert.match(game, /hitStopUntil/);
  assert.match(game, /"launch" \| "arm_break" \| "leg_break"/);
  assert.match(game, /\/audio\/slap1\.mp3/);
  assert.match(game, /\/audio\/slap2\.mp3/);
  assert.match(game, /\/audio\/bone-break\.mp3/);
  assert.match(game, /playSlapImpact/);
  assert.match(game, /playNoiseBurst/);
  assert.match(game, /lastPowerSoundAt/);
  assert.match(game, /kind === "long_leg" \? "leg_break" : "launch"/);
  assert.match(game, /fetchPowerupBatch/);
  assert.match(game, /nextPowerupBatchAt \+= 60/);
  assert.match(game, /titan/);
  assert.match(game, /laser/);
  assert.match(game, /long_leg/);
  assert.match(game, /phase/);
  assert.match(game, /clone/);
  assert.match(game, /powerLanes/);
  assert.match(game, /AI DROP/);
  assert.match(game, /fetchChatterBatch/);
  assert.match(game, /CHATTER_INTERVAL_SECONDS = 30/);
  assert.match(game, /nextChatterBatchAt \+= CHATTER_INTERVAL_SECONDS/);
  assert.match(game, /nextChatterBatchAt: 0/);
  assert.match(game, /candidate\.sentences\.length === 7/);
  assert.match(game, /FALLBACK_CHATTER_BATCHES/);
  assert.match(game, /CHATTER_HISTORY_KEY/);
  assert.match(game, /chatterCursor < game\.chatterLines\.length/);
  assert.match(game, /game\.nextChatterDisplayAt = game\.elapsed \+ 5/);
  assert.match(game, /for \(const target of game\.targets\) target\.message = undefined/);
  assert.doesNotMatch(game, /chatterCursor\+\+ % game\.chatterLines\.length/);
  assert.match(game, /\/audio\/running\.mp3/);
  assert.match(game, /running\.loop = true/);
  assert.match(scene, /"desk" \| "chatting" \| "phone" \| "presenting"/);
  assert.match(scene, /new THREE\.WebGLRenderer/);
  assert.match(scene, /new THREE\.PerspectiveCamera/);
  assert.match(scene, /animateRig/);
  assert.match(scene, /makeImpact/);
  assert.match(scene, /target\.hitOutcome === "arm_break"/);
  assert.match(scene, /target\.hitOutcome === "leg_break"/);
  assert.match(scene, /boneShard/);
  assert.match(scene, /rightArm\.position\.set/);
  assert.match(scene, /leftLeg\.position\.set/);
  assert.match(scene, /age \* 12\.2/);
  assert.match(scene, /speedMarkers/);
  assert.match(scene, /scene\.rotation\.y = Math\.PI/);
  assert.match(scene, /new THREE\.SpriteMaterial/);
  assert.match(scene, /updateRoleLabels/);
  assert.match(scene, /depthTest: false/);
  assert.match(scene, /strokeText/);
  assert.match(scene, /backed = false/);
  assert.match(scene, /true, ""/);
  assert.doesNotMatch(scene, /mateB/);
  assert.doesNotMatch(scene, /\bmateA\b/);
  assert.match(scene, /addSpeechBubble/);
  assert.match(scene, /speechTexture/);
  assert.match(scene, /updateSpeechBubble/);
  assert.match(scene, /speechText/);
  assert.match(scene, /destroyEmployeeProps/);
  assert.match(scene, /employeeProp/);
  assert.match(scene, /enragePursuer/);
  assert.match(scene, /animateAngerSteam/);
  assert.match(scene, /0xff3028/);
  assert.match(scene, /roleTexture/);
  assert.match(scene, /new THREE\.CapsuleGeometry/);
  assert.match(scene, /new THREE\.SphereGeometry/);
  assert.match(scene, /segment\.position\.z = -108 \+ cycle/);
  assert.match(scene, /this\.camera\.position\.set\(0, 8\.8, 22\.5\)/);
  assert.match(scene, /makePowerup/);
  assert.match(scene, /makeStrike/);
  assert.match(scene, /POWERUP_STYLE/);
  assert.match(route, /process\.env\.GROQ_API_KEY/);
  assert.match(route, /openai\/gpt-oss-20b/);
  assert.match(powerupRoute, /process\.env\.GROQ_API_KEY/);
  assert.match(powerupRoute, /strict: true/);
  assert.match(powerupRoute, /maxItems: 4/);
  assert.match(powerupRoute, /additionalProperties: false/);
  assert.match(chatterRoute, /process\.env\.GEMINI_API_KEY/);
  assert.match(chatterRoute, /gemini-2\.5-flash/);
  assert.match(chatterRoute, /generativelanguage\.googleapis\.com/);
  assert.match(chatterRoute, /x-goog-api-key/);
  assert.match(chatterRoute, /minItems: 7/);
  assert.match(chatterRoute, /maxItems: 7/);
  assert.match(chatterRoute, /sentences\.length !== 7/);
  assert.match(chatterRoute, /"motivation"/);
  assert.match(chatterRoute, /responseMimeType: "application\/json"/);
  assert.match(chatterRoute, /responseJsonSchema/);
  assert.match(chatterRoute, /slice\(-300\)/);
  assert.match(chatterRoute, /seen\.has\(normalized\)/);
  assert.doesNotMatch(chatterRoute, /api\.groq\.com|GROQ_API_KEY/);
  assert.doesNotMatch(game, /GROQ_API_KEY|GEMINI_API_KEY|NEXT_PUBLIC/);
  assert.doesNotMatch(envExample, /NEXT_PUBLIC_(GROQ|GEMINI)/);
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

test("powerup planner fails fast without a secret so scheduled fallback drops stay available", async () => {
  const worker = await loadWorker();
  const response = await worker.fetch(new Request("http://localhost/api/powerup-batch", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ score: 100, elapsedSec: 0, difficultyTier: 1, activePowerups: [], recentKinds: [] }),
  }), env, context);
  assert.equal(response.status, 503);
});

test("office chatter planner fails fast without a secret so fallback lines stay available", async () => {
  const worker = await loadWorker();
  const response = await worker.fetch(new Request("http://localhost/api/office-chatter", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ score: 100, elapsedSec: 0, recentLines: [] }),
  }), env, context);
  assert.equal(response.status, 503);
});

test("includes the running loop, both randomized slaps, and the bone-break recording", async () => {
  const sizes = await Promise.all([
    stat(new URL("../public/audio/running.mp3", import.meta.url)),
    stat(new URL("../public/audio/slap1.mp3", import.meta.url)),
    stat(new URL("../public/audio/slap2.mp3", import.meta.url)),
    stat(new URL("../public/audio/bone-break.mp3", import.meta.url)),
  ]);
  assert.ok(sizes.every((file) => file.size > 1_000));
});
