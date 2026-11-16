import { dimensions, type EvaluationCase, type EvaluationResult, type ScoreDimension } from "../types.ts";
import { classifyBadCases, isHighRiskFinding, type RuleCheck, type RuleFinding } from "./bad-case.ts";
import { runRules, type RuleContext } from "./rule-engine.ts";

interface DimensionScore {
  score: number | null;
  passed: number;
  failed: number;
  unverified: number;
}

export interface RuleEvaluationResult extends EvaluationResult {
  source: "run";
  executionStatus: "complete" | "incomplete";
  checks: RuleCheck[];
  scoreBreakdown: Record<ScoreDimension, DimensionScore>;
  findings: RuleFinding[];
}

function scoreDimension(checks: readonly RuleCheck[]): DimensionScore {
  const passed = checks.filter(({ outcome }) => outcome === "pass").length;
  const failed = checks.filter(({ outcome }) => outcome === "fail").length;
  const unverified = checks.filter(({ outcome }) => outcome === "unverified").length;
  const applicable = passed + failed + unverified;
  return { score: applicable ? 100 * passed / applicable : null, passed, failed, unverified };
}

export function scoreChecks(checks: RuleCheck[]) {
  const scoreBreakdown = {
    relevanceScore: scoreDimension(checks.filter(({ dimension }) => dimension === "relevanceScore")),
    factualScore: scoreDimension(checks.filter(({ dimension }) => dimension === "factualScore")),
    timelinessScore: scoreDimension(checks.filter(({ dimension }) => dimension === "timelinessScore")),
    personalizationScore: scoreDimension(checks.filter(({ dimension }) => dimension === "personalizationScore")),
    complianceScore: scoreDimension(checks.filter(({ dimension }) => dimension === "complianceScore")),
  };
  const applicable = dimensions.filter(({ key }) => scoreBreakdown[key].score !== null);
  const weight = applicable.reduce((sum, dimension) => sum + dimension.weight, 0);
  const weighted = applicable.reduce((sum, { key, weight }) => sum + weight * (scoreBreakdown[key].score ?? 0), 0);
  const totalScore = weight ? Math.round(weighted / weight * 10) / 10 : 0;

  const findings = classifyBadCases(checks);
  const highRisk = findings.find(isHighRiskFinding);
  const pending = checks.filter(({ outcome }) => outcome === "unverified").length;
  const incomplete = pending > 0 || !applicable.length;
  const status = highRisk || (!incomplete && totalScore < 60) ? "失败"
    : incomplete || findings.length || totalScore < 80 ? "警告" : "通过";
  const primary = highRisk ?? findings[0];
  const explanation = [
    highRisk ? "命中严重合规或隐私规则，评测判定为高风险失败。" : undefined,
    findings.length ? "发现 " + findings.length + " 项问题。" : undefined,
    pending ? "有 " + pending + " 项待核验，当前得分为已核验通过项的保守计分。" : undefined,
    !applicable.length ? "缺少适用规则，无法完成评测。" : undefined,
    !primary && !incomplete ? "适用规则均已执行，未发现问题。" : undefined,
  ].filter(Boolean).join("");
  return {
    scoreBreakdown, totalScore, findings, explanation,
    executionStatus: incomplete ? "incomplete" as const : "complete" as const,
    badCaseType: primary?.type ?? null,
    riskLevel: highRisk ? "high" as const : status === "通过" ? "low" as const : "medium" as const,
    status,
  } as const;
}

export function evaluateCase(
  record: EvaluationCase, context: RuleContext = {}, evaluatedAt = record.createdAt,
): RuleEvaluationResult {
  const checks = runRules(record, context);
  const result = scoreChecks(checks);
  const scores = result.scoreBreakdown;
  return {
    id: "rule:" + record.answerId + ":" + evaluatedAt,
    caseId: record.id,
    answerId: record.answerId,
    modelVersion: record.modelVersion,
    promptVersion: record.promptVersion,
    datasetVersion: record.datasetVersion,
    evaluatedAt,
    source: "run",
    // Numeric fields remain compatible with preset results. Applicability is in scoreBreakdown.
    relevanceScore: scores.relevanceScore.score ?? 0,
    factualScore: scores.factualScore.score ?? 0,
    timelinessScore: scores.timelinessScore.score ?? 0,
    personalizationScore: scores.personalizationScore.score ?? 0,
    complianceScore: scores.complianceScore.score ?? 0,
    checks,
    ...result,
  };
}
