"use client";

import { useState } from "react";
import { formatDateTime, formatScore } from "@/data/demo";
import { saveFeedback, saveReview, useEvaluationState } from "@/lib/evaluation-store";
import { evaluationFor, riskLabels } from "@/lib/evaluation-view";
import { dimensions, type EvaluatedCase, type ReviewRecord } from "@/lib/types";
import { Meter, StatusBadge } from "./evaluation-ui";

export function CaseBadges({ record }: { record: EvaluatedCase }) {
  const evaluation = evaluationFor(record, useEvaluationState().runs[record.answerId]);
  return <div className="badge-group">
    <span className="intent-label">{evaluation.sourceLabel}</span>
    <StatusBadge status={evaluation.status} />
    <span className={evaluation.riskLevel === "high" ? "status danger" : "status muted"}>{riskLabels[evaluation.riskLevel]}</span>
  </div>;
}

export function CaseAssessment({ record }: { record: EvaluatedCase }) {
  const run = useEvaluationState().runs[record.answerId];
  const evaluation = evaluationFor(record, run);
  const judge = run?.judgeResult.status === "complete" ? run.judgeResult.assessment : null;
  return <>
    <section className="panel">
      <div className="panel-heading panel-heading-row">
        <div><h2>最终质量评分</h2><p>{run ? "实时规则综合分" : "DEMO 预置分数"} · 满分 100 · {evaluation.executionLabel}</p></div>
        <strong className="overall numeric">{formatScore(evaluation.score)}</strong>
      </div>
      <div className="dimension-chart">
        {dimensions.map(({ key, label, weight }) => {
          const score = evaluation.dimension(key);
          return <div className="dimension-row" key={key}><span>{label} <small>{weight}%</small></span>
            <Meter value={score} /><strong className="numeric" title={score === null ? "不适用" : undefined}>{formatScore(score)}</strong>
          </div>;
        })}
      </div>
    </section>
    <section className="panel">
      <div className="panel-heading"><h2>Bad Case 归因</h2><p>{evaluation.findingTypes.join("、") || (evaluation.isBadCase ? "高风险，未给出错误分类" : "暂无错误分类")}</p></div>
      {evaluation.result.findings.map((finding, index) => (
        <div className="panel-body finding-content" key={index}>
          <span className={`status ${finding.severity === "high" ? "danger" : "warning"}`}>
            <span className="dot" />{run ? "规则引擎" : "DEMO 预置"} · {finding.type}
          </span>
          <blockquote>「{finding.excerpt}」</blockquote>
          <dl><div><dt>错误原因</dt><dd>{finding.reason}</dd></div><div><dt>修复方向</dt><dd>{finding.fix}</dd></div>
            {finding.evidenceIds.length > 0 && <div><dt>证据引用</dt><dd>{finding.evidenceIds.join("、")}</dd></div>}
          </dl>
        </div>
      ))}
      {judge && (judge.badCaseType || judge.complianceRisk === "high") &&
        <div className="panel-body finding-content">
          <span className={`status ${judge.complianceRisk === "high" ? "danger" : "warning"}`}>
            LLM Judge · {judge.badCaseType ?? "高语义风险"}
          </span>
          <p>{judge.explanation}</p>
        </div>}
      {!evaluation.isBadCase && <p className="panel-body empty-note">{evaluation.result.explanation}</p>}
    </section>
  </>;
}

function ReviewForm({ resultId, review, storageError }: { resultId: string; review?: ReviewRecord; storageError: boolean }) {
  const [noteDraft, setNoteDraft] = useState<string | null>(null);
  const note = noteDraft ?? review?.reviewerNote ?? "";
  const status = review?.status ?? "待复核";

  function save(nextStatus: ReviewRecord["status"]) {
    saveReview(resultId, nextStatus, note.trim());
    setNoteDraft(null);
  }

  return <>
    <p role="status">复核状态：<strong>{status}</strong>{review?.reviewedAt && (storageError ? " · 仅本次会话" : ` · ${formatDateTime(review.reviewedAt)} 已保存`)}</p>
    <div className="badge-group review-actions">
      <button type="button" className="button secondary" aria-pressed={status === "确认问题"} onClick={() => save("确认问题")}>确认问题</button>
      <button type="button" className="button secondary" aria-pressed={status === "驳回问题"} onClick={() => save("驳回问题")}>驳回问题</button>
    </div>
    <label className="review-note">复核备注
      <textarea rows={3} maxLength={1000} value={note} placeholder="记录判断依据或后续处理建议" onChange={(event) => setNoteDraft(event.target.value)} />
    </label>
    <button className="button secondary" type="button" disabled={note === (review?.reviewerNote ?? "")} onClick={() => save(status)}>保存备注</button>
  </>;
}

export function CaseReview({ record }: { record: EvaluatedCase }) {
  const { runs, reviews, feedback, storageError } = useEvaluationState();
  const evaluation = evaluationFor(record, runs[record.answerId]);
  const { id } = evaluation.result;
  const vote = feedback[record.answerId];
  return <section className="panel">
    <div className="panel-heading"><h2>人工复核与用户反馈</h2></div>
    <div className="review-grid">
      <div>
        <h3>人工复核 · {evaluation.sourceLabel}</h3>
        {evaluation.isBadCase ? <ReviewForm key={id} resultId={id} review={reviews[id]} storageError={storageError} /> : <p>当前评测暂无待复核问题。</p>}
      </div>
      <div>
        <h3>用户反馈</h3>
        <p>这条回答有帮助吗？反馈用于体验统计。</p>
        <div className="badge-group review-actions" role="group" aria-label="用户反馈选项">
          <button type="button" className="button secondary" aria-pressed={vote?.helpful === true} onClick={() => saveFeedback(record.answerId, true)}>有帮助</button>
          <button type="button" className="button secondary" aria-pressed={vote?.helpful === false} onClick={() => saveFeedback(record.answerId, false)}>无帮助</button>
        </div>
        <p role="status">{vote ? `${storageError ? "仅本次会话" : "已保存"}：${vote.helpful ? "有帮助" : "无帮助"}` : "暂无反馈"}</p>
      </div>
    </div>
  </section>;
}
