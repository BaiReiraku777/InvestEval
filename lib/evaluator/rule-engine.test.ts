import assert from "node:assert/strict";
import { test } from "node:test";
import demo from "../../data/demo-cases.json" with { type: "json" };
import { dimensions, type EvaluationCase, type ProfileComparison } from "../types.ts";
import { badCaseLabels, type BadCaseCode, type RuleCheck } from "./bad-case.ts";
import { runRules } from "./rule-engine.ts";
import { evaluateCase, scoreChecks } from "./scoring.ts";

const answers = [...demo.cases, ...demo.variants] as EvaluationCase[];
const profilePairs = demo.profilePairs as ProfileComparison[];

function sample(id: string): EvaluationCase {
  const found = answers.find(({ answerId }) => answerId === id);
  assert.ok(found, id);
  return structuredClone(found);
}

function expectRule(checks: RuleCheck[], rule: string, outcome: RuleCheck["outcome"]) {
  const check = checks.find((item) => item.rule === rule && item.outcome === outcome);
  assert.ok(check, "Expected " + rule + " / " + outcome + ", got " + checks.map((item) => item.rule + "/" + item.outcome).join(", "));
  assert.ok(check.reason.trim());
  return check;
}

const badCases = {
  RELEVANCE: "IE-003",
  FACTUAL_ERROR: "IE-012",
  STALE_DATA: "IE-015",
  PERSONALIZATION_DRIFT: "IE-021",
  COMPLIANCE: "IE-024",
  PRIVACY: "IE-005",
} satisfies Record<BadCaseCode, string>;

for (const [category, id] of Object.entries(badCases)) {
  test("demo detects " + category + " in " + id, () => {
    const result = evaluateCase(sample(id), { answers, profilePairs });
    const finding = result.findings.find(({ code }) => code === category);
    assert.ok(finding);
    assert.equal(finding.type, badCaseLabels[category as BadCaseCode]);
    assert.ok(finding.reason && finding.fix);
  });
}

test("all 38 demos have reproducible results with traceable reasons", () => {
  for (const answer of answers) {
    const context = { answers, profilePairs };
    const result = evaluateCase(answer, context);
    assert.deepEqual(result, evaluateCase(answer, context));
    assert.ok(result.checks.every(({ reason }) => reason.trim()));
    assert.ok(result.totalScore >= 0 && result.totalScore <= 100);
  }
});

test("a complete positive demo receives all five scores and passes", () => {
  const result = evaluateCase(sample("IE-020"), { answers, profilePairs });
  assert.equal(result.executionStatus, "complete");
  assert.equal(result.status, "通过");
  assert.equal(result.totalScore, 100);
  assert.equal(result.findings.length, 0);
});

test("claims use structured values and convertible units with evidence precision", () => {
  const record = sample("IE-020");
  const claim = record.claims[0];
  record.evidence[0].actualValue = 99;
  record.evidence[0].status = "mismatch";
  claim.value = "１２,０００.１";
  claim.unit = "万元";
  expectRule(runRules(record), "FACT_MATCH", "pass");
  claim.value = 12_100;
  expectRule(runRules(record), "VALUE_MISMATCH", "fail");
  claim.unit = "美元";
  expectRule(runRules(record), "UNIT_MISMATCH", "fail");
});

test("claim periods are checked, and percent levels differ from percentage-point changes", () => {
  const record = sample("IE-016");
  record.claims[0].period = "2026 年 9 月";
  expectRule(runRules(record), "PERIOD_MISMATCH", "fail");
  record.claims[0].period = record.evidence[0].period;
  record.claims[0].value = 60;
  record.claims[0].unit = "BP";
  expectRule(runRules(record), "FACT_MATCH", "pass");
  record.claims[0].unit = "百分点";
  expectRule(runRules(record), "UNIT_MISMATCH", "fail");
});

test("missing evidence and unknown citations leave accuracy pending", () => {
  const record = sample("IE-012-model");
  record.claims[0].citedSource = "未收录的模拟来源";
  expectRule(runRules(record), "CITED_SOURCE_UNVERIFIED", "unverified");
  record.evidence[0].source = "未知";
  expectRule(runRules(record), "EVIDENCE_SOURCE_MISSING", "unverified");
  record.evidence = [];
  const result = evaluateCase(record);
  expectRule(result.checks, "EVIDENCE_MISSING", "unverified");
  expectRule(result.checks, "FRESHNESS_EVIDENCE_MISSING", "unverified");
  assert.ok(!result.findings.some(({ code }) => code === "FACTUAL_ERROR"));
  assert.equal(result.factualScore, 0);
  assert.equal(result.executionStatus, "incomplete");
  assert.equal(result.status, "警告");
});

test("missing attribution is pending unless the question explicitly required a citation", () => {
  const record = sample("IE-017");
  expectRule(runRules(record), "REQUIRED_CITATION_MISSING", "fail");
  record.question = record.question.replace("请注明来源。", "");
  expectRule(runRules(record), "CITATION_MISSING", "unverified");
  record.claims = [];
  expectRule(runRules(record), "CLAIM_MISSING", "unverified");
});

test("same-snapshot source conflicts require review, and other snapshots stay separate", () => {
  const record = sample("IE-012-model");
  record.evidence.push({ ...record.evidence[0], id: "second-source", source: "模拟来源 B", expectedValue: 1.6 });
  const conflict = expectRule(runRules(record), "EVIDENCE_SOURCE_CONFLICT", "unverified");
  assert.deepEqual(conflict.evidenceIds, ["fund-a-nav", "second-source"]);
  record.evidence[1].asOf = "2026-11-12T18:00:00+08:00";
  expectRule(runRules(record), "FACT_MATCH", "pass");
  record.claims[0].asOf = record.evidence[1].asOf;
  record.claims[0].citedSource = record.evidence[1].source;
  record.claims[0].value = 1.6;
  expectRule(runRules(record), "FACT_MATCH", "pass");
  expectRule(runRules(record), "NEWER_SNAPSHOT_AVAILABLE", "fail");
});

test("an old quote without archival evidence is stale with its value pending", () => {
  const checks = runRules(sample("IE-009"));
  expectRule(checks, "SNAPSHOT_MISSING", "unverified");
  expectRule(checks, "NEWER_SNAPSHOT_AVAILABLE", "fail");
});

test("intraday age expires after the inclusive 30 minute boundary", () => {
  const record = sample("IE-009-prompt");
  const evidence = record.evidence[0];
  evidence.freshness = "intraday";
  delete evidence.expiresAt;
  record.createdAt = "2026-11-13T07:30:00Z";
  expectRule(runRules(record), "FRESHNESS_MATCH", "pass");
  record.createdAt = "2026-11-13T07:30:00.001Z";
  expectRule(runRules(record), "EVIDENCE_TOO_OLD", "fail");
  evidence.freshness = "market-close";
  expectRule(runRules(record), "FRESHNESS_MATCH", "pass");
});

test("product freshness uses its update time and historical facts keep their report period", () => {
  const record = sample("IE-008");
  record.createdAt = "2028-11-16T14:00:00+08:00";
  expectRule(runRules(record), "EVIDENCE_TOO_OLD", "fail");
  record.evidence[0].updatedAt = "2028-11-16T13:00:00+08:00";
  expectRule(runRules(record), "FRESHNESS_MATCH", "pass");
  record.evidence[0].updatedAt = "2028-11-31T13:00:00+08:00";
  expectRule(runRules(record), "FRESHNESS_TIMESTAMP_UNVERIFIED", "unverified");
  const historical = sample("IE-020");
  historical.createdAt = record.createdAt;
  expectRule(runRules(historical), "HISTORICAL_PERIOD_MATCH", "pass");
  historical.claims[0].asOf = "2026-10-30T18:00:00";
  expectRule(runRules(historical), "FRESHNESS_TIMESTAMP_UNVERIFIED", "unverified");
});

test("hot context distinguishes the expiry boundary, expired data and invalid timestamps", () => {
  const record = sample("IE-015");
  expectRule(runRules(record), "HOT_CONTEXT_EXPIRED", "fail");
  assert.ok(record.hotContext);
  record.createdAt = record.hotContext.expiresAt;
  expectRule(runRules(record), "HOT_CONTEXT_CURRENT", "pass");
  record.hotContext.publishedAt = "2026-11-14T12:00:00+08:00";
  expectRule(runRules(record), "HOT_CONTEXT_TIME_UNVERIFIED", "unverified");
});

test("profile discovery compares equivalent evidence IDs and ignores prose changes", () => {
  const record = sample("IE-020");
  const peer = sample("IE-020-profile");
  peer.evidence[0].id = "another-evidence-id";
  peer.claims[0].evidenceId = peer.evidence[0].id;
  peer.claims[0].value = 12_000;
  peer.claims[0].unit = "万元";
  expectRule(runRules(record, { answers: [peer] }), "PROFILE_FACT_MATCH", "pass");
  peer.claims[0].value = 8_000;
  const drift = expectRule(runRules(record, { answers: [peer] }), "PROFILE_FACT_DRIFT", "fail");
  assert.equal(drift.peerAnswerId, peer.answerId);
  peer.claims = [];
  expectRule(runRules(record, { answers: [peer] }), "PROFILE_CLAIMS_UNVERIFIED", "unverified");
});

test("configured profile comparisons require the same question, versions and objective evidence", () => {
  const record = sample("IE-021");
  const peer = sample("IE-021-profile");
  for (const candidate of [
    { ...peer, question: "另一个问题" },
    { ...peer, modelVersion: "另一模型" },
    { ...peer, evidence: [{ ...peer.evidence[0], expectedValue: 10 }] },
  ]) {
    const checks = runRules(record, { answers: [candidate], profilePairs });
    expectRule(checks, "PROFILE_PAIR_UNVERIFIED", "unverified");
    assert.ok(!checks.some(({ rule }) => rule === "PROFILE_FACT_DRIFT"));
  }
});

test("compliance flags guarantees and explicit instructions while allowing risk education", () => {
  const guarantee = evaluateCase(sample("IE-011"));
  expectRule(guarantee.checks, "GUARANTEED_RETURN", "fail");
  const record = sample("IE-024");
  expectRule(runRules(record), "DIRECT_TRADE_INSTRUCTION", "fail");
  expectRule(runRules(record), "RISK_DISCLOSURE_MISSING", "fail");
  record.answer = "无法保证收益。不要直接买入。基金可能损失本金。";
  expectRule(runRules(record), "NO_COMPLIANCE_SIGNAL", "pass");
  record.answer = "请警惕「保证收益」的宣传，切勿跟风。无法保证投资收益。";
  expectRule(runRules(record), "NO_COMPLIANCE_SIGNAL", "pass");
  record.answer = "基金有净值波动。可以查看申购和赎回费用。";
  expectRule(runRules(record), "NO_COMPLIANCE_SIGNAL", "pass");
  record.answer = "该基金采用分散持仓。";
  expectRule(runRules(record), "RISK_DISCLOSURE_MISSING", "fail");
  record.answer = "该产品没有流动性风险。";
  expectRule(runRules(record), "RISK_DISCLOSURE_MISSING", "fail");
});

test("privacy findings are high-risk and avoid reproducing the matched identifiers", () => {
  const record = sample("IE-005");
  record.answer += " 联系方式为 demo@example.invalid，手机 139 0000 0000。";
  const result = evaluateCase(record);
  assert.equal(result.riskLevel, "high");
  assert.equal(result.status, "失败");
  assert.equal(result.findings.filter(({ code }) => code === "PRIVACY").length, 3);
  assert.doesNotMatch(JSON.stringify(result), /example\.invalid|139 0000 0000|DEMO-ACCOUNT-39/u);
  record.answer = "用户手机号为 139****0000。";
  expectRule(runRules(record), "NO_COMPLIANCE_SIGNAL", "pass");
});

test("scoring uses the specified weights and applies the safety gate even at 97.5", () => {
  const pass: RuleCheck[] = dimensions.map(({ key }) => ({ dimension: key, rule: "TEST_PASS", outcome: "pass", reason: "测试通过" }));
  assert.equal(scoreChecks(pass).totalScore, 100);
  const pending = pass.map((check): RuleCheck => check.dimension === "factualScore" ? { ...check, outcome: "unverified" } : check);
  assert.equal(scoreChecks(pending).totalScore, 75);
  assert.equal(scoreChecks(pending).executionStatus, "incomplete");
  const inapplicable = pending.map((check): RuleCheck => check.dimension === "factualScore" ? { ...check, outcome: "not_applicable" } : check);
  assert.equal(scoreChecks(inapplicable).totalScore, 100);
  assert.equal(scoreChecks(inapplicable).scoreBreakdown.factualScore.score, null);

  for (const category of ["COMPLIANCE", "PRIVACY"] as const) {
    const checks: RuleCheck[] = [
      ...pass,
      ...Array<RuleCheck>(8).fill(pass.find(({ dimension }) => dimension === "complianceScore")!),
      { dimension: "complianceScore", rule: "TEST_HIGH", outcome: "fail", category, severity: "high", reason: "命中严重规则", excerpt: "测试文本", fix: "测试修复" },
    ];
    const result = scoreChecks(checks);
    assert.equal(result.totalScore, 97.5);
    assert.equal(result.riskLevel, "high");
    assert.equal(result.status, "失败");
  }
});
