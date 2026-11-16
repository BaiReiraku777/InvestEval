import Link from "next/link";
import type { ReactNode } from "react";
import { formatDateTime, formatScore } from "@/data/demo";
import { useEvaluationState } from "@/lib/evaluation-store";
import { evaluationFor, riskLabels } from "@/lib/evaluation-view";
import type { EvaluatedCase, Status } from "@/lib/types";
import { Icon } from "./icon";

export function PageHeading({ title, description, action }: { title: string; description: string; action?: ReactNode }) {
  return (
    <div className="page-heading">
      <div><h1>{title}</h1><p>{description}</p></div>
      {action}
    </div>
  );
}

export function StatusBadge({ status }: { status: Status }) {
  const tones = { 通过: "success", 警告: "warning", 失败: "danger" };
  return <span className={`status ${tones[status]}`}><span className="dot" />{status}</span>;
}

export function Meter({ value, tone = "accent" }: { value: number | null; tone?: string }) {
  return <div className="meter" aria-hidden="true"><span className={tone} style={{ width: `${value ?? 0}%` }} /></div>;
}

export function CaseTable({ records, recent = false, selection, pendingIds = [] }: {
  records: EvaluatedCase[];
  recent?: boolean;
  selection?: { ids: string[]; limit: number; pending: boolean; toggle: (id: string) => void };
  pendingIds?: string[];
}) {
  const { runs, reviews } = useEvaluationState();
  return (
    <div className="table-scroll" tabIndex={0} role="region" aria-label={recent ? "最近评测记录表格" : "问答评测记录表格"}>
      <table className={recent ? "case-table recent-table" : "case-table"}>
        <thead>
          <tr>
            {selection && <th scope="col"><span className="sr-only">选择评测样例</span></th>}
            <th scope="col">Case ID</th><th scope="col">意图类型</th><th scope="col">问题</th>
            {recent ? <th scope="col">评测时间</th> : <><th scope="col">模型版本</th><th scope="col">Prompt 版本</th></>}
            <th scope="col">评分</th><th scope="col">评测状态</th><th scope="col"><span className="sr-only">查看详情</span></th>
          </tr>
        </thead>
        <tbody>
          {records.map((record) => {
            const evaluation = evaluationFor(record, runs[record.answerId]);
            return (
            <tr key={record.answerId}>
              {selection && <td>
                <input type="checkbox" aria-label={`选择 ${record.answerId}`} checked={selection.ids.includes(record.answerId)}
                  disabled={selection.pending || (selection.ids.length >= selection.limit && !selection.ids.includes(record.answerId))}
                  onChange={() => selection.toggle(record.answerId)} />
              </td>}
              <td>
                <Link href={`/cases/${record.answerId}`} className="case-link mono" aria-label={`查看 ${record.answerId}：${record.question}`}>
                  {record.id}
                </Link>
                {record.id !== record.answerId && <small className="table-secondary mono">{record.answerId}</small>}
              </td>
              <td><span className="intent-label">{record.intent}</span></td>
              <td className="question-cell">{record.question}</td>
              {recent ? <td className="muted nowrap numeric">{formatDateTime(evaluation.result.evaluatedAt)}</td> : (
                <><td className="muted nowrap">{record.modelVersion}</td><td className="muted nowrap">{record.promptVersion}</td></>
              )}
              <td className="numeric score-cell">{formatScore(evaluation.score)}<small className="table-secondary">{evaluation.sourceLabel}</small></td>
              <td>
                <span className="badge-group"><StatusBadge status={evaluation.status} />
                  <span className={evaluation.riskLevel === "high" ? "status danger" : "status muted"}>{riskLabels[evaluation.riskLevel]}</span>
                </span>
                <small className="table-secondary">{pendingIds.includes(record.answerId) ? "评测中…" : evaluation.executionLabel}
                  {evaluation.isBadCase && ` · ${reviews[evaluation.result.id]?.status ?? "待复核"}`}
                </small>
              </td>
              <td className="row-arrow"><Icon name="chevron" size={16} /></td>
            </tr>
          ); })}
        </tbody>
      </table>
    </div>
  );
}
