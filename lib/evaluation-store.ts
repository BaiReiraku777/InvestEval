"use client";

import { useSyncExternalStore } from "react";
import { allAnswers } from "@/data/demo";
import type { EvaluationRun } from "@/lib/evaluator/evaluation-run";
import type { EvaluationState } from "@/lib/evaluation-view";
import { dimensions, findingTypes, statuses, type ReviewRecord } from "@/lib/types";

const storageKey = "investeval:workspace:v1";
const legacyKey = (answerId: string) => "investeval:evaluation:v1:" + answerId;
const empty: EvaluationState = { runs: {}, reviews: {}, feedback: {} };
const serverSnapshot = { ...empty, storageError: false };
let snapshot = serverSnapshot;
let initialized = false;
const listeners = new Set<() => void>();

function parse(raw: string | null): unknown {
  try { return raw ? JSON.parse(raw) : null; } catch { return null; }
}

function object(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function timestamp(value: unknown): value is string {
  return typeof value === "string" && Number.isFinite(Date.parse(value));
}

function strings(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((entry) => typeof entry === "string");
}

export function isRun(value: unknown, answerId: string): value is EvaluationRun {
  const run = object(value);
  const result = object(run.ruleResult);
  const judge = object(run.judgeResult);
  const assessment = object(judge.assessment);
  const scores = object(result.scoreBreakdown);
  return run.answerId === answerId && result.answerId === answerId && result.source === "run" &&
    typeof result.id === "string" && timestamp(result.evaluatedAt) &&
    typeof result.totalScore === "number" && Number.isFinite(result.totalScore) &&
    statuses.some((status) => status === result.status) &&
    ["low", "medium", "high"].includes(String(result.riskLevel)) && typeof result.explanation === "string" &&
    Array.isArray(result.findings) && result.findings.every((entry) => {
      const finding = object(entry);
      return findingTypes.some((type) => type === finding.type) && strings(finding.evidenceIds) &&
        ["excerpt", "reason", "fix"].every((key) => typeof finding[key] === "string");
    }) && Array.isArray(result.checks) && result.checks.every((entry) => {
      const check = object(entry);
      return typeof check.reason === "string" && ["pass", "fail", "unverified", "not_applicable"].includes(String(check.outcome)) &&
        (check.evidenceIds === undefined || strings(check.evidenceIds));
    }) &&
    dimensions.every(({ key }) => {
      const score = object(scores[key]).score;
      return score === null || (typeof score === "number" && Number.isFinite(score));
    }) &&
    (judge.status === "complete" ? typeof judge.model === "string" &&
      ["low", "medium", "high"].includes(String(assessment.complianceRisk)) &&
      (assessment.badCaseType === null || findingTypes.some((type) => type === assessment.badCaseType)) &&
      ["relevanceScore", "completenessScore"].every((key) => typeof assessment[key] === "number") &&
      ["explanation", "personalizationAssessment"].every((key) => typeof assessment[key] === "string") :
      ["failed", "not_configured"].includes(String(judge.status)) && typeof judge.message === "string") &&
    ["complete", "incomplete"].includes(String(run.executionStatus)) && typeof run.highRisk === "boolean";
}

function read(): EvaluationState {
  const raw = localStorage.getItem(storageKey);
  const saved = object(parse(raw));
  const storedRuns = object(saved.runs);
  const storedFeedback = object(saved.feedback);
  const state: EvaluationState = { runs: {}, reviews: {}, feedback: {} };
  for (const { answerId } of allAnswers) {
    const run = raw === null ? parse(localStorage.getItem(legacyKey(answerId))) : storedRuns[answerId];
    if (isRun(run, answerId)) state.runs[answerId] = run;
    const feedback = object(storedFeedback[answerId]);
    if (typeof feedback.helpful === "boolean" && timestamp(feedback.feedbackAt)) {
      state.feedback[answerId] = { answerId, helpful: feedback.helpful, feedbackAt: feedback.feedbackAt };
    }
  }
  state.reviews = Object.fromEntries(Object.entries(object(saved.reviews)).flatMap(([resultId, value]) => {
    const { status, reviewerNote, reviewedAt } = object(value);
    if ((status !== "待复核" && status !== "确认问题" && status !== "驳回问题") ||
        typeof reviewerNote !== "string" || (reviewedAt !== null && !timestamp(reviewedAt))) return [];
    return [[resultId, { resultId, status, reviewerNote, reviewedAt }]];
  }));
  return state;
}

function publish(state: EvaluationState, storageError = false) {
  snapshot = { ...state, storageError };
  listeners.forEach((listener) => listener());
}

function refresh() {
  initialized = true;
  try { publish(read()); } catch { publish(snapshot, true); }
}

function onStorage(event: StorageEvent) {
  if (event.storageArea === localStorage && (event.key === storageKey || event.key === null) && !snapshot.storageError) refresh();
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  if (listeners.size === 1) {
    window.addEventListener("storage", onStorage);
    if (!snapshot.storageError) refresh();
  }
  return () => {
    listeners.delete(listener);
    if (!listeners.size) window.removeEventListener("storage", onStorage);
  };
}

export function useEvaluationState() {
  return useSyncExternalStore(subscribe, () => snapshot, () => serverSnapshot);
}

function update(change: (state: EvaluationState) => EvaluationState) {
  if (!initialized) refresh();
  let previous: EvaluationState = snapshot;
  if (!snapshot.storageError) {
    try { previous = read(); } catch { /* Keep the in-memory workspace when storage is unavailable. */ }
  }
  const next = change(previous);
  const { runs, reviews, feedback } = next;
  try {
    const migrating = localStorage.getItem(storageKey) === null;
    localStorage.setItem(storageKey, JSON.stringify({ runs, reviews, feedback }));
    if (migrating) {
      for (const { answerId } of allAnswers) localStorage.removeItem(legacyKey(answerId));
    }
    publish(next);
  } catch {
    publish(next, true);
  }
}

export function saveRun(run: EvaluationRun) {
  update((state) => {
    const previous = state.runs[run.answerId];
    if (previous && Date.parse(previous.ruleResult.evaluatedAt) > Date.parse(run.ruleResult.evaluatedAt)) return state;
    return { ...state, runs: { ...state.runs, [run.answerId]: run } };
  });
}

export function saveReview(resultId: string, status: ReviewRecord["status"], reviewerNote: string) {
  update((state) => ({ ...state, reviews: { ...state.reviews,
    [resultId]: { resultId, status, reviewerNote, reviewedAt: new Date().toISOString() },
  } }));
}

export function saveFeedback(answerId: string, helpful: boolean) {
  update((state) => ({ ...state, feedback: { ...state.feedback,
    [answerId]: { answerId, helpful, feedbackAt: new Date().toISOString() },
  } }));
}
