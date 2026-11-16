export const intents = ["行情问答", "基金问答", "财务解释", "个性化问答", "合规问答"] as const;
export const findingTypes = ["答非所问", "事实错误", "时效过期", "个性化失真", "合规违规", "隐私泄露"] as const;
export const statuses = ["通过", "警告", "失败"] as const;

export type Intent = (typeof intents)[number];
export type BadCaseType = (typeof findingTypes)[number];
export type Status = (typeof statuses)[number];
export type RiskLevel = "low" | "medium" | "high";

export interface Versions {
  modelVersion: string;
  promptVersion: string;
  datasetVersion: string;
}

export interface UserProfile {
  id: string;
  riskTolerance: "保守型" | "稳健型" | "进取型";
  investmentHorizon: "1 年以内" | "1–3 年" | "3 年以上";
  experienceLevel: "入门" | "有基金投资经验" | "有权益投资经验";
}

export interface HotContext {
  title: string;
  source: string;
  publishedAt: string;
  expiresAt: string;
  content: string;
}

export type EvidenceStatus = "match" | "mismatch" | "stale" | "missing-source";

export type FreshnessPolicy = "intraday" | "market-close" | "fund-nav" | "product" | "historical";

export interface Evidence {
  id: string;
  entity: string;
  field: string;
  expectedValue: string | number;
  actualValue: string | number | null;
  unit?: string;
  precision?: number;
  period?: string;
  source: string;
  asOf: string;
  updatedAt?: string;
  actualAsOf?: string;
  expiresAt?: string;
  freshness?: FreshnessPolicy;
  status: EvidenceStatus;
}

export interface Claim {
  evidenceId: string;
  excerpt: string;
  value: string | number;
  unit?: string;
  period?: string;
  asOf?: string;
  citedSource?: string;
}

export interface RelevanceCriterion {
  label: string;
  anyOf: string[];
}

export interface EvaluationCase extends Versions {
  /** Stable question ID shared by its answer variants. */
  id: string;
  /** Unique answer record within the dataset, including version and profile variants. */
  answerId: string;
  intent: Intent;
  question: string;
  answer: string;
  createdAt: string;
  profile: UserProfile;
  hotContext: HotContext | null;
  evidence: Evidence[];
  claims: Claim[];
  relevanceCriteria?: RelevanceCriterion[];
  riskDisclosureRequired?: boolean;
}

export const dimensions = [
  { key: "relevanceScore", label: "回答相关性", weight: 20 },
  { key: "factualScore", label: "事实准确性", weight: 25 },
  { key: "timelinessScore", label: "时效性", weight: 15 },
  { key: "personalizationScore", label: "个性化一致性", weight: 15 },
  { key: "complianceScore", label: "合规与隐私", weight: 25 },
] as const;

export type ScoreDimension = (typeof dimensions)[number]["key"];

export interface Finding {
  type: BadCaseType;
  severity: "warning" | "high";
  excerpt: string;
  reason: string;
  fix: string;
  evidenceIds: string[];
}

export interface EvaluationResult extends Versions {
  id: string;
  caseId: string;
  answerId: string;
  evaluatedAt: string;
  source: "preset" | "run";
  status: Status;
  relevanceScore: number;
  factualScore: number;
  timelinessScore: number;
  personalizationScore: number;
  complianceScore: number;
  totalScore: number;
  badCaseType: BadCaseType | null;
  riskLevel: RiskLevel;
  explanation: string;
  findings: Finding[];
}

export interface ReviewRecord {
  resultId: string;
  status: "待复核" | "确认问题" | "驳回问题";
  reviewerNote: string;
  reviewedAt: string | null;
}

export interface UserFeedback {
  answerId: string;
  helpful: boolean;
  feedbackAt: string;
}

export interface ProfileComparison {
  caseId: string;
  answerIds: [string, string];
  invariantEvidenceIds: string[];
}

export type EvaluatedCase = EvaluationCase & { result: EvaluationResult };

export interface VersionComparison {
  field: keyof Versions;
  label: string;
  version: string;
  description: string;
}
