import type { BadCaseType, RiskLevel } from "../types";
import type { RuleEvaluationResult } from "./scoring";

export const MAX_EVALUATION_CASES = 5;

export interface JudgeAssessment {
  relevanceScore: number;
  completenessScore: number;
  personalizationAssessment: string;
  complianceRisk: RiskLevel;
  badCaseType: BadCaseType | null;
  explanation: string;
}

export type JudgeRun =
  | { status: "complete"; model: string; assessment: JudgeAssessment; modelEvaluatedAt?: string }
  | { status: "not_configured"; message: string }
  | { status: "failed"; code: "CONFIGURATION" | "TIMEOUT" | "UPSTREAM_ERROR" | "INVALID_RESPONSE"; message: string };

export interface EvaluationRun {
  answerId: string;
  mode: "rules_only" | "rules_and_llm";
  executionStatus: "complete" | "incomplete";
  highRisk: boolean;
  ruleResult: RuleEvaluationResult;
  judgeResult: JudgeRun;
}

export interface EvaluationBatch {
  executionStatus: EvaluationRun["executionStatus"];
  results: EvaluationRun[];
}
