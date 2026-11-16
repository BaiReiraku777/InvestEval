import type { Claim, Evidence, EvaluationCase, FreshnessPolicy } from "../types.ts";
import type { RuleCheck } from "./bad-case.ts";

const units = new Map<string, readonly [string, number]>([
  ["元", ["CNY", 1]], ["人民币元", ["CNY", 1]], ["CNY", ["CNY", 1]],
  ["千元", ["CNY", 1_000]], ["万元", ["CNY", 10_000]], ["百万元", ["CNY", 1_000_000]], ["亿元", ["CNY", 100_000_000]],
  ["%", ["ratio", 0.01]], ["‰", ["ratio", 0.001]], ["比例", ["ratio", 1]],
  ["基点", ["ratio", 0.0001]], ["BP", ["ratio", 0.0001]], ["BPS", ["ratio", 0.0001]],
  ["百分点", ["percentage-point", 1]], ["点", ["index-point", 1]],
]);

export function normalize(value: string): string {
  return value.normalize("NFKC").trim().replace(/\s+/gu, " ").toLowerCase();
}

function unitInfo(unit = ""): readonly [string, number] {
  const label = unit.normalize("NFKC").trim().toUpperCase();
  return units.get(label) ?? [label, 1];
}

function numbers(value: string | number): number | undefined {
  if (typeof value === "number") return Number.isFinite(value) ? value : undefined;
  const text = normalize(value);
  if (!/^[+-]?(?:\d+|\d{1,3}(?:,\d{3})+)(?:\.\d+)?$/u.test(text)) return undefined;
  const parsed = Number(text.replaceAll(",", ""));
  return Number.isFinite(parsed) ? parsed : undefined;
}

export function compareValues(
  actual: string | number, expected: string | number, actualUnit?: string, expectedUnit?: string, precision?: number,
): "match" | "unit" | "value" | "unverified" {
  const [actualDimension, actualScale] = unitInfo(actualUnit);
  const [expectedDimension, expectedScale] = unitInfo(expectedUnit);
  if (actualDimension !== expectedDimension) return "unit";
  const left = numbers(actual);
  const right = numbers(expected);
  if (left === undefined || right === undefined) {
    if (typeof actual !== "string" || typeof expected !== "string" || !normalize(actual) || !normalize(expected)) return "unverified";
    if (left !== undefined || right !== undefined) return "unverified";
    return normalize(actual) === normalize(expected) ? "match" : "value";
  }

  const converted = left * (actualScale / expectedScale);
  if (!Number.isFinite(converted)) return "unverified";
  const tolerance = precision !== undefined && Number.isInteger(precision) && precision >= 0 && precision <= 12
    ? 0.5 * 10 ** -precision
    : 0;
  const roundingError = Number.EPSILON * Math.max(Math.abs(converted), Math.abs(right)) * 2;
  return Math.abs(converted - right) <= tolerance + roundingError ? "match" : "value";
}

export function timestamp(value?: string): number | undefined {
  if (!value || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?(?:Z|[+-]\d{2}:\d{2})$/u.test(value)) return undefined;
  const date = Date.parse(value);
  const day = Date.parse(value.slice(0, 10));
  if (!Number.isFinite(date) || !Number.isFinite(day) || value.slice(11, 13) === "24") return undefined;
  return new Date(day).toISOString().slice(0, 10) === value.slice(0, 10) ? date : undefined;
}

export function evidenceKey(evidence: Evidence): string {
  return JSON.stringify([
    normalize(evidence.entity), normalize(evidence.field), normalize(evidence.period ?? ""),
    timestamp(evidence.asOf) ?? evidence.asOf,
  ]);
}

export function validValue(value: string | number | null | undefined): value is string | number {
  return typeof value === "number" ? Number.isFinite(value) : typeof value === "string" && Boolean(value.trim());
}

function knownSource(source?: string): boolean {
  return Boolean(source && !/^(?:未知(?:来源)?|不详|无|unknown|n\/a|—|-)?$/u.test(normalize(source)));
}

function claimTime(claim: Claim, evidence: Evidence): string {
  return claim.asOf ?? evidence.actualAsOf ?? evidence.asOf;
}

export function factualCheck(record: EvaluationCase, claim: Claim, claimIndex: number): RuleCheck {
  const evidence = record.evidence.find(({ id }) => id === claim.evidenceId);
  const basis = { dimension: "factualScore" as const, claimIndex, evidenceIds: [claim.evidenceId] };
  const pending = (rule: string, reason: string, evidenceIds = [claim.evidenceId]): RuleCheck =>
    ({ ...basis, evidenceIds, rule, outcome: "unverified", reason });
  const failure = (rule: string, reason: string, fix: string): RuleCheck =>
    ({ ...basis, rule, outcome: "fail", category: "FACTUAL_ERROR", reason, excerpt: claim.excerpt, fix });

  if (!evidence || !validValue(evidence.expectedValue)) {
    return pending("EVIDENCE_MISSING", "声明缺少可用的原始证据（" + claim.evidenceId + "）。");
  }
  const subject = evidence.entity + "／" + evidence.field;
  if (claim.period !== undefined && normalize(claim.period) !== normalize(evidence.period ?? "")) {
    if (!evidence.period || !claim.period.trim()) return pending("PERIOD_UNVERIFIED", subject + "缺少可比较的报告期。");
    return failure("PERIOD_MISMATCH", subject + "声明报告期为 " + claim.period + "，证据为 " + evidence.period + "。", "使用与问题和证据对应的报告期。");
  }
  const observed = timestamp(claimTime(claim, evidence));
  const reference = timestamp(evidence.asOf);
  if (observed === undefined || reference === undefined) {
    return pending("FACT_DATE_UNVERIFIED", subject + "缺少有效的带时区数据日期。");
  }
  // A claim from an older snapshot needs evidence for that snapshot before its value can be judged.
  const snapshotKey = evidenceKey({ ...evidence, asOf: claimTime(claim, evidence) });
  const candidates = record.evidence.filter((candidate) =>
    evidenceKey(candidate) === snapshotKey &&
    knownSource(candidate.source) && validValue(candidate.expectedValue),
  );
  if (!candidates.length) {
    return observed !== reference
      ? pending("SNAPSHOT_MISSING", subject + "缺少声明日期 " + claimTime(claim, evidence) + " 的同口径原始证据。")
      : pending("EVIDENCE_SOURCE_MISSING", subject + "的原始证据缺少可识别来源。");
  }

  for (const [index, left] of candidates.entries()) {
    const conflict = candidates.slice(index + 1).find((right) => {
      const result = compareValues(left.expectedValue, right.expectedValue, left.unit, right.unit);
      return result === "unit" || result === "value";
    });
    if (conflict) {
      return pending("EVIDENCE_SOURCE_CONFLICT",
        subject + "同日期、同口径的证据互相冲突，" + left.source + "记录 " + left.expectedValue +
        (left.unit ?? "") + "，" + conflict.source + "记录 " + conflict.expectedValue + (conflict.unit ?? "") + "。",
        [left.id, conflict.id]);
    }
  }
  const cited = candidates.find(({ source }) => claim.citedSource && normalize(source) === normalize(claim.citedSource));
  if (knownSource(claim.citedSource) && !cited) {
    return pending("CITED_SOURCE_UNVERIFIED", subject + "引用的来源「" + claim.citedSource + "」没有对应证据。", candidates.map(({ id }) => id));
  }
  const target = cited ?? candidates.find(({ id }) => id === evidence.id) ?? candidates[0];
  const unit = claim.unit ?? evidence.unit;
  const comparison = compareValues(claim.value, target.expectedValue, unit, target.unit, target.precision);
  if (comparison === "unverified") return pending("VALUE_UNVERIFIED", subject + "的声明值或证据值缺失或格式不可比较。", [target.id]);
  if (comparison !== "match") return {
    ...failure(comparison === "unit" ? "UNIT_MISMATCH" : "VALUE_MISMATCH",
      subject + "声明为 " + claim.value + (unit ?? "") + "，" + target.source + "记录为 " +
      target.expectedValue + (target.unit ?? "") + (comparison === "unit" ? "，单位口径不相容。" : "，标准化后的值不一致。"),
      "核对原始来源、数值和单位后更正回答。"),
    evidenceIds: [target.id],
  };
  if (!knownSource(claim.citedSource)) {
    if (/(?:注明|标注|列出|给出|提供|说明).{0,6}来源/u.test(record.question)) {
      return failure("REQUIRED_CITATION_MISSING", subject + "的值与证据一致，回答遗漏了问题明确要求注明的来源。", "注明所用数据的来源和日期。");
    }
    return pending("CITATION_MISSING", subject + "的值与证据一致，声明缺少引用来源，来源归属待核验。", [target.id]);
  }
  return { ...basis, evidenceIds: [target.id], rule: "FACT_MATCH", outcome: "pass",
    reason: subject + "声明为 " + claim.value + (unit ?? "") + "，与 " + target.source + " 在 " +
      target.asOf + " 记录的 " + target.expectedValue + (target.unit ?? "") + " 一致。" };
}

const hour = 60 * 60 * 1000;
const maxAgeHours = { intraday: 0.5, "market-close": 96, "fund-nav": 168, product: 365 * 24 };

function freshnessPolicy(record: EvaluationCase, evidence: Evidence): FreshnessPolicy | undefined {
  if (evidence.freshness !== undefined) {
    return evidence.freshness === "historical" || Object.hasOwn(maxAgeHours, evidence.freshness) ? evidence.freshness : undefined;
  }
  if (/盘中|实时/u.test(evidence.field)) return "intraday";
  if (evidence.period) return "historical";
  if (/风险等级|本金风险/u.test(evidence.field)) return "product";
  if (/最新|最近|现在|当前|今日|今天|实时|盘中/u.test(record.question)) {
    if (/净值/u.test(evidence.field)) return "fund-nav";
    if (/收盘|价格|点位|涨幅|跌幅/u.test(evidence.field)) return "market-close";
    return undefined;
  }
  if (/\d{1,2}\s*月|\d{4}-\d{2}-\d{2}/u.test(record.question)) return "historical";
  return undefined;
}

export function freshnessCheck(record: EvaluationCase, claim: Claim, claimIndex: number): RuleCheck {
  const basis = { dimension: "timelinessScore" as const, claimIndex, evidenceIds: [claim.evidenceId] };
  const evidence = record.evidence.find(({ id }) => id === claim.evidenceId);
  if (!evidence) return { ...basis, rule: "FRESHNESS_EVIDENCE_MISSING", outcome: "unverified", reason: "找不到声明对应的证据，无法确定数据更新时间。" };
  const label = evidence.entity + "／" + evidence.field;
  const policy = freshnessPolicy(record, evidence);
  const now = timestamp(record.createdAt);
  const observed = timestamp(claimTime(claim, evidence));
  const reference = timestamp(evidence.asOf);
  const update = observed === reference && evidence.updatedAt !== undefined ? timestamp(evidence.updatedAt) : observed;
  const expires = timestamp(evidence.expiresAt);
  if (now === undefined || reference === undefined || observed === undefined || update === undefined ||
      observed > now || reference > now || update > now || update < observed ||
      (evidence.expiresAt !== undefined && (expires === undefined || expires < update))) {
    return { ...basis, rule: "FRESHNESS_TIMESTAMP_UNVERIFIED", outcome: "unverified",
      reason: label + "的回答时间、数据时间、更新时间或有效期缺失、无效或顺序不一致。" };
  }
  const fail = (rule: string, reason: string): RuleCheck => ({
    ...basis, rule, reason, outcome: "fail", category: "STALE_DATA",
    excerpt: claim.excerpt, fix: "更新至回答时可用的同口径数据，并标注数据时间。",
  });
  if (expires !== undefined && now > expires) return fail("EVIDENCE_EXPIRED", label + "有效期截止 " + evidence.expiresAt + "，早于回答时间 " + record.createdAt + "。");
  if (policy === "historical") {
    if (observed !== reference || claim.period !== undefined && normalize(claim.period) !== normalize(evidence.period ?? "")) {
      return { ...basis, rule: "HISTORICAL_PERIOD_UNVERIFIED", outcome: "unverified",
        reason: label + "的声明日期或报告期无法与所需历史证据对齐。" };
    }
    return { ...basis, rule: "HISTORICAL_PERIOD_MATCH", outcome: "pass",
      reason: label + "符合指定历史口径（" + (evidence.period ?? evidence.asOf) + "）。" };
  }
  if (policy && observed < reference) return fail("NEWER_SNAPSHOT_AVAILABLE", label + "使用 " + claimTime(claim, evidence) + " 的数据，回答时已有 " + evidence.asOf + " 的更新证据。");
  if (!policy && expires === undefined) {
    return { ...basis, rule: "FRESHNESS_POLICY_UNKNOWN", outcome: "unverified", reason: label + "未配置可判定的时效策略或有效期。" };
  }
  // Publication/update time is used for products, observation time for time-sensitive market values.
  const dataTime = policy === "product" ? update : observed;
  if (policy && now - dataTime > maxAgeHours[policy] * hour) {
    return fail("EVIDENCE_TOO_OLD", label + "从 " + new Date(dataTime).toISOString() + " 到回答时间 " +
      record.createdAt + " 的数据年龄超过 " + policy + " 的 " + maxAgeHours[policy] + " 小时上限。");
  }
  if (observed > reference) {
    return { ...basis, rule: "NEWER_CLAIM_UNVERIFIED", outcome: "unverified", reason: label + "的声明比已知证据更新，尚无对应快照确认更新时间。" };
  }
  return { ...basis, rule: "FRESHNESS_MATCH", outcome: "pass",
    reason: label + "在回答时间 " + record.createdAt + " 符合" + (policy ? " " + policy + " 时效规则" : "已配置的有效期") + "。" };
}

export function checkHotContext(record: EvaluationCase): RuleCheck[] {
  const dimension = "timelinessScore";
  if (!record.hotContext) return [];
  const context = record.hotContext;
  const now = timestamp(record.createdAt);
  const published = timestamp(context.publishedAt);
  const expires = timestamp(context.expiresAt);
  if (now === undefined || published === undefined || expires === undefined || published > expires || published > now) {
    return [{ dimension, rule: "HOT_CONTEXT_TIME_UNVERIFIED", outcome: "unverified", reason: "热点「" + context.title + "」的发布时间、有效期或回答时间缺失、无效或顺序不一致。" }];
  }
  if (now > expires) return [{
    dimension, rule: "HOT_CONTEXT_EXPIRED", outcome: "fail", category: "STALE_DATA", excerpt: context.title,
    reason: context.source + "的热点有效期截止 " + context.expiresAt + "，早于回答时间 " + record.createdAt + "。",
    fix: "替换为仍有效的热点资料，或明确标注为历史背景。",
  }];
  return [{ dimension, rule: "HOT_CONTEXT_CURRENT", outcome: "pass", reason: "热点「" + context.title + "」在发布后且仍处于有效期内。" }];
}
