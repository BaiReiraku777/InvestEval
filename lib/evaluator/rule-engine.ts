import type { Claim, EvaluationCase, Evidence, ProfileComparison } from "../types.ts";
import type { RuleCheck } from "./bad-case.ts";
import { checkHotContext, compareValues, evidenceKey, factualCheck, freshnessCheck, normalize, timestamp, validValue } from "./evidence.ts";
import { checkCompliance, checkRelevance } from "./text-rules.ts";

export interface RuleContext {
  answers?: readonly EvaluationCase[];
  profilePairs?: readonly ProfileComparison[];
}

function sameEvidence(left: Evidence, right: Evidence): boolean {
  return evidenceKey(left) === evidenceKey(right) && timestamp(left.asOf) !== undefined &&
    normalize(left.source) === normalize(right.source) && validValue(left.expectedValue) && validValue(right.expectedValue) &&
    compareValues(left.expectedValue, right.expectedValue, left.unit, right.unit) === "match";
}

function sameEvidenceSet(left: readonly Evidence[], right: readonly Evidence[]): boolean {
  const remaining = [...right];
  for (const evidence of left) {
    const index = remaining.findIndex((candidate) => sameEvidence(evidence, candidate));
    if (index === -1) return false;
    remaining.splice(index, 1);
  }
  return remaining.length === 0;
}

function comparableAnswer(record: EvaluationCase, peer: EvaluationCase): boolean {
  const left = record.profile;
  const right = peer.profile;
  return record.answerId !== peer.answerId && left.id !== right.id &&
    (left.riskTolerance !== right.riskTolerance || left.investmentHorizon !== right.investmentHorizon || left.experienceLevel !== right.experienceLevel) &&
    normalize(record.question) === normalize(peer.question) &&
    record.modelVersion === peer.modelVersion && record.promptVersion === peer.promptVersion &&
    record.datasetVersion === peer.datasetVersion && sameEvidenceSet(record.evidence, peer.evidence);
}

function claimsFor(record: EvaluationCase, evidence: Evidence): Claim[] {
  const ids = new Set(record.evidence.filter((candidate) => evidenceKey(candidate) === evidenceKey(evidence)).map(({ id }) => id));
  return record.claims.filter(({ evidenceId }) => ids.has(evidenceId));
}

function compareProfileFact(record: EvaluationCase, peer: EvaluationCase, evidence: Evidence): RuleCheck {
  const basis = { dimension: "personalizationScore" as const, evidenceIds: [evidence.id], peerAnswerId: peer.answerId };
  const label = evidence.entity + "／" + evidence.field + "（对照 " + peer.answerId + "）";
  const peerEvidence = peer.evidence.find((candidate) => sameEvidence(evidence, candidate));
  const leftClaims = claimsFor(record, evidence);
  const rightClaims = peerEvidence ? claimsFor(peer, peerEvidence) : [];
  if (!peerEvidence || leftClaims.length !== 1 || rightClaims.length !== 1) {
    return { ...basis, rule: "PROFILE_CLAIMS_UNVERIFIED", outcome: "unverified",
      reason: label + "缺少唯一可比较的客观声明。" };
  }
  const [left] = leftClaims;
  const [right] = rightClaims;
  const leftDate = timestamp(left.asOf ?? evidence.actualAsOf ?? evidence.asOf);
  const rightDate = timestamp(right.asOf ?? peerEvidence.actualAsOf ?? peerEvidence.asOf);
  const leftUnit = left.unit ?? evidence.unit;
  const rightUnit = right.unit ?? peerEvidence.unit;
  const values = compareValues(left.value, right.value, leftUnit, rightUnit);
  if (values === "unverified" || leftDate === undefined || rightDate === undefined) {
    return { ...basis, rule: "PROFILE_CLAIMS_UNVERIFIED", outcome: "unverified", reason: label + "的声明值或日期无法比较。" };
  }
  const leftPeriod = left.period ?? evidence.period ?? "";
  const rightPeriod = right.period ?? peerEvidence.period ?? "";
  if (values === "match" && leftDate === rightDate && normalize(leftPeriod) === normalize(rightPeriod)) {
    return { ...basis, rule: "PROFILE_FACT_MATCH", outcome: "pass", reason: label + "的值、单位和数据期一致。" };
  }
  return {
    ...basis, rule: "PROFILE_FACT_DRIFT", outcome: "fail", category: "PERSONALIZATION_DRIFT", excerpt: left.excerpt,
    reason: label + "的客观声明发生变化。本回答为 " + left.value + (leftUnit ?? "") + "（" +
      (leftPeriod ? leftPeriod + "，" : "") + new Date(leftDate).toISOString() + "），对照回答为 " +
      right.value + (rightUnit ?? "") + "（" + (rightPeriod ? rightPeriod + "，" : "") + new Date(rightDate).toISOString() + "）。",
    fix: "两种画像使用相同的原始证据与数据口径，按画像调整解释深度和表达。",
  };
}

function checkPersonalization(record: EvaluationCase, context: RuleContext): RuleCheck[] {
  const dimension = "personalizationScore";
  const configured = context.profilePairs?.filter(({ answerIds }) => answerIds.includes(record.answerId)) ?? [];
  const byPeer = new Map(configured.map((pair) => [pair.answerIds.find((id) => id !== record.answerId), pair]));
  const peers = (context.answers ?? []).filter((peer) =>
    (!byPeer.size || byPeer.has(peer.answerId)) && comparableAnswer(record, peer),
  );
  if (!peers.length && !byPeer.size) {
    return [{ dimension, rule: "PROFILE_COMPARISON_NOT_APPLICABLE", outcome: "not_applicable", reason: "此案例未安排同版本、同证据的不同画像对照。" }];
  }
  const checks = peers.flatMap((peer) => {
    const ids = byPeer.get(peer.answerId)?.invariantEvidenceIds;
    const fields = record.evidence.filter((evidence) => !ids?.length || ids.some((id) =>
      [...record.evidence, ...peer.evidence].some((candidate) => candidate.id === id && sameEvidence(evidence, candidate)),
    ));
    const unique = [...new Map(fields.map((evidence) => [evidenceKey(evidence), evidence])).values()];
    return unique.map((evidence) => compareProfileFact(record, peer, evidence));
  });
  for (const [peerAnswerId, pair] of byPeer) {
    const peer = peers.find(({ answerId }) => peerAnswerId === answerId);
    if (!peer || pair.invariantEvidenceIds.some((id) =>
      ![...record.evidence, ...peer.evidence].some((evidence) => evidence.id === id),
    )) checks.push({
      dimension, rule: "PROFILE_PAIR_UNVERIFIED", outcome: "unverified", peerAnswerId,
      reason: "配置的画像对照缺少可比回答或必核客观字段（" + (peerAnswerId ?? "对照 ID 缺失") + "）。",
    });
  }
  return checks.length ? checks : [{
    dimension, rule: "PROFILE_PAIR_UNVERIFIED", outcome: "unverified", reason: "缺少相同问题、版本和客观证据的不同画像对照，或缺少可比较字段。",
  }];
}

export function runRules(record: EvaluationCase, context: RuleContext = {}): RuleCheck[] {
  const factualChecks = record.claims.map((claim, index) => factualCheck(record, claim, index));
  const claimedFields = new Set(record.claims.flatMap((claim) => {
    const evidence = record.evidence.find(({ id }) => id === claim.evidenceId);
    if (!evidence) return [];
    const claimedAt = claim.asOf ?? evidence.actualAsOf ?? evidence.asOf;
    return [evidenceKey(evidence), evidenceKey({ ...evidence, asOf: claimedAt })];
  }));
  for (const evidence of record.evidence) {
    if (!claimedFields.has(evidenceKey(evidence))) factualChecks.push({
      dimension: "factualScore", rule: "CLAIM_MISSING", outcome: "unverified", evidenceIds: [evidence.id],
      reason: "未提取到「" + evidence.entity + "／" + evidence.field + "」对应的结构化声明。",
    });
  }
  if (!factualChecks.length) factualChecks.push(record.factualScope === "conceptual" ? {
    dimension: "factualScore", rule: "CONCEPTUAL_QUESTION", outcome: "not_applicable",
    reason: "题目考查概念或风险说明，无需核对金融数据快照。表达与要点由语义和相关性评估覆盖。",
  } : {
    dimension: "factualScore", rule: "NO_STRUCTURED_FACTS", outcome: "unverified", reason: "没有可核对的结构化声明或证据，事实准确性待核验。",
  });
  const freshnessChecks = [...record.claims.map((claim, index) => freshnessCheck(record, claim, index)), ...checkHotContext(record)];
  if (!freshnessChecks.length) freshnessChecks.push({
    dimension: "timelinessScore", rule: record.evidence.length ? "NO_TIMED_CLAIMS" : "NO_TIME_SENSITIVE_INPUT",
    outcome: record.evidence.length ? "unverified" : "not_applicable",
    reason: record.evidence.length ? "有证据但缺少可核对的数据声明，时效待核验。" : "案例没有结构化数据声明、证据或热点上下文。",
  });
  return [
    ...checkRelevance(record),
    ...factualChecks,
    ...freshnessChecks,
    ...checkPersonalization(record, context),
    ...checkCompliance(record),
  ];
}
