import type { BadCaseType, Finding, ScoreDimension } from "../types";

export const badCaseLabels = {
  RELEVANCE: "答非所问",
  FACTUAL_ERROR: "事实错误",
  STALE_DATA: "时效过期",
  PERSONALIZATION_DRIFT: "个性化失真",
  COMPLIANCE: "合规违规",
  PRIVACY: "隐私泄露",
} as const satisfies Record<string, BadCaseType>;

export type BadCaseCode = keyof typeof badCaseLabels;
export type RuleOutcome = "pass" | "fail" | "unverified" | "not_applicable";

interface RuleBasis {
  rule: string;
  dimension: ScoreDimension;
  reason: string;
  evidenceIds?: string[];
  claimIndex?: number;
  peerAnswerId?: string;
}

export type RuleCheck = RuleBasis & (
  | { outcome: Exclude<RuleOutcome, "fail"> }
  | {
    outcome: "fail";
    category: BadCaseCode;
    severity?: Finding["severity"];
    excerpt: string;
    fix: string;
  }
);

export interface RuleFinding extends Finding {
  code: BadCaseCode;
  rule: string;
  claimIndex?: number;
  peerAnswerId?: string;
}

export function classifyBadCases(checks: readonly RuleCheck[]): RuleFinding[] {
  return checks.flatMap((check) => {
    if (check.outcome !== "fail") return [];
    return [{
      code: check.category,
      rule: check.rule,
      type: badCaseLabels[check.category],
      severity: check.severity ?? "warning",
      excerpt: check.excerpt,
      reason: check.reason,
      fix: check.fix,
      evidenceIds: check.evidenceIds ?? [],
      claimIndex: check.claimIndex,
      peerAnswerId: check.peerAnswerId,
    }];
  });
}

export function isHighRiskFinding({ severity, code }: RuleFinding): boolean {
  return severity === "high" && (code === "COMPLIANCE" || code === "PRIVACY");
}
