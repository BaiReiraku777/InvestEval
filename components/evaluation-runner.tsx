"use client";

import { useState } from "react";
import Link from "next/link";
import { formatDateTime, formatScore } from "@/data/demo";
import { MAX_EVALUATION_CASES, type EvaluationRun } from "@/lib/evaluator/evaluation-run";
import { isRun, saveRun, useEvaluationState } from "@/lib/evaluation-store";
import { evaluationExecutionLabel } from "@/lib/evaluation-view";
import { dimensions } from "@/lib/types";
import { StatusBadge } from "./evaluation-ui";

type Task = { answerId: string; status: "pending" | "returned" | "failed"; message?: string };

export function useEvaluationRunner() {
  const [tasks, setTasks] = useState<Task[]>([]);
  const pending = tasks.some(({ status }) => status === "pending");

  async function run(answerIds: string[]) {
    const ids = [...new Set(answerIds)];
    if (pending || !ids.length || ids.length > MAX_EVALUATION_CASES) return;
    setTasks(ids.map((answerId) => ({ answerId, status: "pending" })));
    await Promise.all(ids.map(async (answerId) => {
      let task: Task;
      try {
        const response = await fetch("/api/evaluate", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ answerId }),
          signal: AbortSignal.timeout(45_000),
        });
        const data = await response.json().catch(() => null);
        if (!response.ok) {
          task = { answerId, status: "failed", message: data?.error?.message ?? `评测请求失败（HTTP ${response.status}），请重试。` };
        } else if (!isRun(data?.results?.[0], answerId)) {
          task = { answerId, status: "failed", message: "评测接口返回无效结果，请重试。" };
        } else {
          saveRun(data.results[0]);
          task = { answerId, status: "returned" };
        }
      } catch (error) {
        task = { answerId, status: "failed", message: error instanceof Error && error.name === "TimeoutError"
          ? "评测请求超时，请重试。" : "未能取得评测结果，请检查网络后重试。" };
      }
      setTasks((current) => current.map((entry) => entry.answerId === answerId ? task : entry));
    }));
  }

  return { tasks, pending, run };
}

const riskLabels = { low: "低", medium: "中", high: "高" };
const ruleOutcomes = { pass: "通过", fail: "失败", unverified: "待核验", not_applicable: "不适用" };

export function EvaluationRunCard({ run, link = false }: { run: EvaluationRun; link?: boolean }) {
  const { judgeResult, ruleResult } = run;
  const assessment = judgeResult.status === "complete" ? judgeResult.assessment : null;
  const factProblems = ruleResult.checks.filter(({ dimension, outcome }) =>
    dimension === "factualScore" && (outcome === "fail" || outcome === "unverified"));

  return (
    <article className="evaluation-run">
      <div className="evaluation-run-title">
        <h3>{link ? <Link className="text-link" href={`/cases/${run.answerId}`}>{run.answerId}</Link> : run.answerId}</h3>
        <span className="intent-label">实时评测</span>
        <span className="muted numeric">{formatDateTime(ruleResult.evaluatedAt)}（UTC+8）</span>
        <span className={`status ${run.executionStatus === "complete" ? "success" : "warning"}`}>
          {evaluationExecutionLabel(run)}
        </span>
        {run.highRisk && <span className="status danger">高风险 · 失败</span>}
      </div>
      <div className="evaluation-run-columns">
        <div>
          <h4>规则引擎 <span className="numeric">{formatScore(ruleResult.totalScore)} 分</span></h4>
          <StatusBadge status={ruleResult.status} />
          <p>{ruleResult.explanation}</p>
          <details>
            <summary>规则得分与核验依据</summary>
            <dl className="run-metadata">
              {dimensions.map(({ key, label }) => (
                <div key={key}><dt>{label}</dt><dd>{formatScore(ruleResult.scoreBreakdown[key].score)}</dd></div>
              ))}
            </dl>
            {ruleResult.findings.map(({ rule, type, reason, fix, evidenceIds }, i) => (
              <p key={`${rule}:${i}`}><strong>{type}：</strong>{reason} {fix}{evidenceIds.length ? `（证据：${evidenceIds.join("、")}）` : ""}</p>
            ))}
            {ruleResult.checks.filter(({ outcome }) => outcome !== "fail").map(({ rule, outcome, reason, evidenceIds }, i) => (
              <p key={`${rule}:${i}`}><strong>{ruleOutcomes[outcome]}：</strong>
                {reason}{evidenceIds?.length ? `（证据：${evidenceIds.join("、")}）` : ""}</p>
            ))}
          </details>
          {factProblems.map(({ rule, outcome, reason }, i) => (
            <p className="muted" key={`${rule}:${i}`}>
              <strong>{outcome === "unverified" ? "事实待核验" : rule === "REQUIRED_CITATION_MISSING" ? "缺少来源" : "与证据不符"}：</strong>{reason}
            </p>
          ))}
        </div>
        <div>
          <h4>LLM Judge · 语义评测</h4>
          {judgeResult.status === "complete" && assessment ? <>
            <p className="muted">评测模型：{judgeResult.model}</p>
            {judgeResult.modelEvaluatedAt && <p className="muted">模型生成时间：{formatDateTime(judgeResult.modelEvaluatedAt)}</p>}
            <dl className="run-metadata">
              <div><dt>相关性</dt><dd>{assessment.relevanceScore} / 100</dd></div>
              <div><dt>完整性</dt><dd>{assessment.completenessScore} / 100</dd></div>
              <div><dt>语义合规风险</dt><dd>{riskLabels[assessment.complianceRisk]}</dd></div>
              <div><dt>辅助归因</dt><dd>{assessment.badCaseType ?? "未发现"}</dd></div>
            </dl>
            <p><strong>个性化：</strong>{assessment.personalizationAssessment}</p>
            <p><strong>评测说明：</strong>{assessment.explanation}</p>
            <p className="muted">金融事实以规则核验和原始证据为准。</p>
          </> : <p className={judgeResult.status === "failed" ? "evaluation-error" : undefined}>
            {judgeResult.status === "failed" && `评测异常（${judgeResult.code}）：`}
            {judgeResult.status !== "complete" && judgeResult.message}
          </p>}
        </div>
      </div>
    </article>
  );
}

export function SingleEvaluationRunner({ answerId }: { answerId: string }) {
  const { tasks, pending, run } = useEvaluationRunner();
  const current = useEvaluationState().runs[answerId];
  const error = tasks[0]?.message;
  return (
    <section className="panel evaluation-panel" aria-label="实时评测" aria-busy={pending}>
      <div className="panel-heading panel-heading-row">
        <div><h2>实时评测</h2><p role="status">{pending ? "正在运行评测（0 / 1），请稍候…" : "查看本条回答的规则核验和语义评测。"}</p></div>
        <button className="button primary" type="button" disabled={pending} onClick={() => run([answerId])}>
          {pending ? "评测中…" : "运行评测"}
        </button>
      </div>
      {error && <p className="panel-body evaluation-error" role="alert">{error}{current && " 下方为上次运行的结果。"}</p>}
      {!current && !pending && <p className="panel-body empty-note">此回答尚无实时规则或 LLM Judge 记录，下方展示 DEMO 预置结果。</p>}
      {current && !pending && <div className="panel-body"><EvaluationRunCard run={current} /></div>}
    </section>
  );
}
