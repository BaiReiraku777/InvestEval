import {
  type EvaluatedCase,
  type EvaluationCase,
  type EvaluationResult,
  type ProfileComparison,
  type VersionComparison,
  type Versions,
} from "@/lib/types";
import caseData from "./demo-cases.json";
import resultData from "./demo-results.json";
import versionData from "./demo-versions.json";

export const baseline: Versions = versionData.baseline;
const versionGroups = versionData.groups as VersionComparison[];
const results = new Map((resultData.results as EvaluationResult[]).map((result) => [result.answerId, result]));

function withResult(record: EvaluationCase): EvaluatedCase {
  const result = results.get(record.answerId);
  if (!result) throw new Error(`Missing demo result for ${record.answerId}`);
  return { ...record, result };
}

export const cases = (caseData.cases as EvaluationCase[]).map(withResult);
const variants = (caseData.variants as EvaluationCase[]).map(withResult);
export const allAnswers = [...cases, ...variants];
const answersById = new Map(allAnswers.map((record) => [record.answerId, record]));
export const profilePairs = caseData.profilePairs as ProfileComparison[];

export function getAnswer(answerId: string) {
  return answersById.get(answerId);
}

export const comparisons = versionGroups.map(({ field, label, version, description }) => {
  const candidate = { ...baseline, [field]: version };
  const pairs = cases.flatMap((record) => {
    const variant = variants.find((answer) =>
      answer.id === record.id && answer.profile.id === record.profile.id &&
      (field !== "datasetVersion" || (answer.question === record.question && answer.answer === record.answer)) &&
      answer.modelVersion === candidate.modelVersion &&
      answer.promptVersion === candidate.promptVersion &&
      answer.datasetVersion === candidate.datasetVersion,
    );
    return variant ? [{ record, variant }] : [];
  });
  return { field, label, candidate, description, pairs };
});

const dateTimeFormatter = new Intl.DateTimeFormat("sv-SE", {
  timeZone: "Asia/Shanghai",
  dateStyle: "short",
  timeStyle: "short",
});

export function formatDateTime(timestamp: string) {
  return dateTimeFormatter.format(new Date(timestamp));
}

export function average(values: number[]) {
  return values.length ? values.reduce((total, value) => total + value, 0) / values.length : null;
}

export function formatScore(value: number | null) {
  return value === null ? "—" : value.toFixed(1);
}
