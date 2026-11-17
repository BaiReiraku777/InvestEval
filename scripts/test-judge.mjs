import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { once } from "node:events";
import { readFile } from "node:fs/promises";
import { createServer } from "node:http";
import { setTimeout } from "node:timers/promises";

// Run after npm run build. Only the upstream is replaced; Next runs the production route.
const testKey = "integration-test-key-not-for-browser";
const records = JSON.parse(await readFile(new URL("../data/demo-cases.json", import.meta.url), "utf8")).cases;
const expected = Object.fromEntries(records.map((record) => [record.answer.normalize("NFKC"), record.answerId]));
let requests = 0;
let received = [];
let upstreamMode = "ok";
const assessment = {
  relevanceScore: 100, completenessScore: 95, personalizationAssessment: "解释深度合适。",
  complianceRisk: "low", badCaseType: null, explanation: "回答直接回应了问题。",
};

const mock = createServer(async (request, response) => {
  requests++;
  const chunks = [];
  for await (const chunk of request) chunks.push(chunk);
  const body = JSON.parse(Buffer.concat(chunks));
  const input = JSON.parse(body.messages[1].content);
  const answerId = expected[input.answer];
  received.push({ path: request.url, authorization: request.headers.authorization, body, input });
  if (upstreamMode === "timeout") {
    response.writeHead(200, { "Content-Type": "application/json" });
    response.flushHeaders();
    return;
  }
  if (upstreamMode === "mixed" && answerId === "IE-020") {
    response.writeHead(429).end(`private diagnostic ${testKey}`);
    return;
  }
  const result = answerId === "IE-012" ? { ...assessment, badCaseType: "事实错误" } : assessment;
  const content = upstreamMode === "markdown" ? "```json\n" + JSON.stringify(result) + "\n```"
    : JSON.stringify(upstreamMode === "unsupported_fact" ? { ...result, badCaseType: "事实错误" }
      : upstreamMode === "out_of_range" ? { ...result, relevanceScore: 101 } : result);
  response.setHeader("Content-Type", "application/json");
  response.end(JSON.stringify({ choices: [{ finish_reason: "stop", message: { content } }] }));
});
mock.listen(0, "127.0.0.1");
await once(mock, "listening");

const children = [];
async function startApp(key) {
  const app = spawn(process.execPath, ["node_modules/next/dist/bin/next", "start", "--hostname", "127.0.0.1", "--port", "0"], {
    env: { ...process.env, LLM_API_KEY: key, LLM_BASE_URL: `http://127.0.0.1:${mock.address().port}/v1/`, LLM_MODEL: "stub-model" },
    stdio: ["ignore", "pipe", "pipe"],
  });
  children.push(app);
  let output = "";
  app.stdout.on("data", (data) => { output += data; });
  app.stderr.on("data", (data) => { output += data; });
  for (let attempt = 0; attempt < 100 && app.exitCode === null; attempt++) {
    const address = output.match(/http:\/\/127\.0\.0\.1:\d+/)?.[0];
    if (address) {
      const ready = await fetch(`${address}/api/evaluate`).catch(() => null);
      if (ready?.status === 405) return address;
    }
    await setTimeout(100);
  }
  throw new Error(`Next did not start. Run npm run build first.\n${output}`);
}

async function evaluate(address, body, expectedStatus = 200) {
  const response = await fetch(`${address}/api/evaluate`, {
    method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
    signal: AbortSignal.timeout(40_000),
  });
  assert.equal(response.status, expectedStatus);
  const text = await response.text();
  assert.ok(!text.includes(testKey));
  return JSON.parse(text);
}

try {
  const address = await startApp(testKey);
  const rulesOnlyAddress = await startApp("");
  const rulesOnly = await evaluate(rulesOnlyAddress, { answerId: "IE-024" });
  assert.equal(rulesOnly.executionStatus, "complete");
  assert.equal(rulesOnly.results[0].mode, "rules_only");
  assert.equal(rulesOnly.results[0].judgeResult.status, "not_configured");
  assert.equal(rulesOnly.results[0].highRisk, true);
  assert.equal(rulesOnly.result.status, "失败");
  const needsEvidence = await evaluate(rulesOnlyAddress, { answerId: "IE-009" });
  assert.equal(needsEvidence.executionStatus, "incomplete");
  assert.ok(needsEvidence.result.checks.some(({ rule }) => rule === "SNAPSHOT_MISSING"));
  assert.equal(requests, 0);

  const limited = await evaluate(address, { answerIds: Array(6).fill("IE-020") }, 400);
  assert.equal(limited.error.code, "BATCH_LIMIT");
  await evaluate(address, { answerIds: ["IE-020", "unknown"] }, 404);
  assert.equal(requests, 0);

  const normal = await evaluate(address, { answerIds: ["IE-020", "IE-012", "IE-020"] });
  assert.equal(requests, 2);
  assert.deepEqual(normal.results.map(({ answerId }) => answerId), ["IE-020", "IE-012"]);
  assert.equal(normal.results[0].executionStatus, "complete");
  assert.deepEqual(normal.results[0].judgeResult.assessment, assessment);
  assert.ok(Number.isFinite(Date.parse(normal.results[0].judgeResult.modelEvaluatedAt)));
  assert.equal(normal.results[1].judgeResult.assessment.badCaseType, "事实错误");
  assert.ok(normal.results[1].ruleResult.findings.some(({ rule }) => rule === "VALUE_MISMATCH"));
  assert.equal(normal.results[1].executionStatus, normal.results[1].ruleResult.executionStatus);
  for (const { input, path, authorization, body } of received) {
    assert.equal(path, "/v1/chat/completions");
    assert.equal(authorization, `Bearer ${testKey}`);
    assert.deepEqual(body.response_format, { type: "json_object" });
    assert.ok(input.question && input.answer && input.intent && input.profile.riskTolerance && input.evidence.length);
    assert.ok(input.intentRubric && input.requiredPoints.length);
    assert.ok("hotContext" in input && !Object.hasOwn(input.profile, "id"));
  }
  assert.notEqual(received[0].input.intentRubric, received[1].input.intentRubric);
  assert.notDeepEqual(received[0].input.requiredPoints, received[1].input.requiredPoints);

  upstreamMode = "mixed";
  const mixed = await evaluate(address, { answerIds: ["IE-020", "IE-024"] });
  assert.equal(mixed.executionStatus, "incomplete");
  assert.equal(mixed.results[0].judgeResult.code, "UPSTREAM_ERROR");
  assert.equal(mixed.results[0].ruleResult.totalScore, 100);
  assert.equal(mixed.results[1].judgeResult.status, "complete");
  assert.equal(mixed.results[1].highRisk, true);

  received = [];
  await evaluate(address, { answerId: "IE-005" });
  assert.match(received[0].input.answer, /已隐藏账户或银行卡号码/);
  assert.doesNotMatch(received[0].input.answer, /DEMO-[A-Z0-9-]+/);

  for (const mode of ["markdown", "out_of_range", "unsupported_fact", "timeout"]) {
    upstreamMode = mode;
    const invalid = await evaluate(address, { answerIds: ["IE-020"] });
    assert.equal(invalid.executionStatus, "incomplete");
    assert.equal(invalid.results[0].judgeResult.code, mode === "timeout" ? "TIMEOUT" : "INVALID_RESPONSE");
    assert.equal(invalid.results[0].ruleResult.totalScore, 100);
  }
  console.log("Judge HTTP smoke passed: batch limit, rule-only, results, redaction, partial failure, invalid JSON/schema, and timeout.");
} finally {
  for (const child of children) child.kill();
  mock.closeAllConnections();
  mock.close();
}
