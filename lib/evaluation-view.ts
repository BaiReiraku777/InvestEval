import type { EvaluatedCase, ReviewRecord, RiskLevel, ScoreDimension, Status, UserFeedback } from "@/lib/types";
import type { EvaluationRun } from "@/lib/evaluator/evaluation-run";

export const riskLabels = { low: "低风险", medium: "中风险", high: "高风险" };

export function evaluationExecutionLabel(run: EvaluationRun) {
  if (run.mode === "rules_only") return run.executionStatus === "complete" ? "规则评测已完成" : "规则评测待核验";
  return run.executionStatus === "complete" ? "评测已完成" : "评测不完整";
}

export interface EvaluationState {
  runs: Record<string, EvaluationRun>;
  reviews: Record<string, ReviewRecord>;
  feedback: Record<string, UserFeedback>;
}

export function evaluationFor(record: EvaluatedCase, run?: EvaluationRun) {
  const result = run?.ruleResult ?? record.result;
  const judge = run?.judgeResult.status === "complete" ? run.judgeResult.assessment : null;
  const riskLevel: RiskLevel = run?.highRisk || result.riskLevel === "high" ? "high"
    : result.riskLevel === "medium" || judge?.complianceRisk === "medium" ? "medium" : "low";
  const findingTypes = [...new Set([
    ...result.findings.map(({ type }) => type),
    ...(judge?.badCaseType ? [judge.badCaseType] : []),
  ])];
  const status: Status = riskLevel === "high" ? "失败"
    : result.status === "通过" && (riskLevel === "medium" || findingTypes.length) ? "警告" : result.status;
  return {
    result,
    riskLevel,
    status,
    findingTypes,
    isBadCase: Boolean(findingTypes.length || riskLevel === "high"),
    score: run && Object.values(run.ruleResult.scoreBreakdown).every(({ score }) => score === null) ? null : result.totalScore,
    dimension: (key: ScoreDimension) => run ? run.ruleResult.scoreBreakdown[key].score : result[key],
    sourceLabel: run ? "实时评测" : "DEMO 预置",
    executionLabel: run ? evaluationExecutionLabel(run) : "预置结果",
  };
}

export type EvaluationView = ReturnType<typeof evaluationFor>;

export function pairedMean<T>(pairs: T[], measure: (pair: T) => [number | null, number | null]) {
  const values = pairs.map(measure).filter((pair): pair is [number, number] => pair[0] !== null && pair[1] !== null);
  const count = values.length;
  return {
    count,
    before: count ? values.reduce((sum, pair) => sum + pair[0], 0) / count : null,
    after: count ? values.reduce((sum, pair) => sum + pair[1], 0) / count : null,
  };
}
