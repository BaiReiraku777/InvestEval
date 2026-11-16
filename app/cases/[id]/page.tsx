import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { CaseAssessment, CaseBadges, CaseReview } from "@/components/case-assessment";
import { SingleEvaluationRunner } from "@/components/evaluation-runner";
import { Icon } from "@/components/icon";
import { allAnswers, formatDateTime, getAnswer, profilePairs } from "@/data/demo";
import type { Evidence, EvidenceStatus } from "@/lib/types";

export const metadata: Metadata = { title: "案例详情" };
export const dynamicParams = false;

export function generateStaticParams() {
  return allAnswers.map(({ answerId }) => ({ id: answerId }));
}

const evidenceStatuses: Record<EvidenceStatus, string> = {
  match: "一致",
  mismatch: "与原始证据不符",
  stale: "数据已过期",
  "missing-source": "数值一致，回答缺少来源",
};

function formatEvidenceValue(value: Evidence["actualValue"], { unit, precision }: Evidence) {
  if (value === null) return "未引用";
  const display = typeof value === "number" && precision !== undefined ? value.toFixed(precision) : value;
  return unit ? `${display}${unit === "%" ? "" : " "}${unit}` : String(display);
}

export default async function CaseDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const record = getAnswer(id);
  if (!record) notFound();

  const { profile, hotContext, evidence } = record;
  const profilePair = profilePairs.find(({ answerIds }) => answerIds.includes(record.answerId));
  const pairedAnswer = profilePair?.answerIds.find((answerId) => answerId !== record.answerId);
  const counterpart = pairedAnswer ? getAnswer(pairedAnswer) : undefined;

  return (
    <>
      <Link href="/cases" className="text-link back-link"><Icon name="back" size={16} /> 返回问答评测</Link>
      <div className="page-heading detail-heading">
        <div><h1>案例详情 <span className="heading-id mono">{record.id}</span></h1><p>{record.modelVersion} · {record.promptVersion} · {record.datasetVersion}</p></div>
        <CaseBadges record={record} />
      </div>
      <SingleEvaluationRunner answerId={record.answerId} />
      <div className="detail-grid">
        <div className="detail-column">
          <section className="panel">
            <div className="panel-heading panel-heading-row">
              <h2>原始问答</h2><span className="intent-label">{record.intent}</span>
            </div>
            <div className="qa-body">
              <div className="qa-block">
                <h3>用户问题</h3>
                <p className="question-text">{record.question}</p>
              </div>
              <div className="qa-block answer-block">
                <div className="qa-label"><h3>Agent 回答</h3><span className="muted numeric">{formatDateTime(record.createdAt)}（UTC+8）</span></div>
                <p>{record.answer}</p>
              </div>
            </div>
          </section>
          <section className="panel">
            <div className="panel-heading"><h2><Icon name="evidence" size={18} />原始数据证据</h2><p>模拟证据 · 实时核验结论见规则引擎</p></div>
            {evidence.length ? evidence.map((entry) => (
              <div className="panel-body" key={entry.id}>
                <h3 className="evidence-name">{entry.entity} · {entry.field}</h3>
                <dl className="evidence-values">
                  <div><dt>原始值</dt><dd>{formatEvidenceValue(entry.expectedValue, entry)}</dd></div>
                  <div><dt>Agent 引用值</dt><dd>{formatEvidenceValue(entry.actualValue, entry)}</dd></div>
                </dl>
                <dl className="inline-metadata">
                  <div><dt>来源</dt><dd>{entry.source}</dd></div>
                  <div><dt>数据时间</dt><dd className="numeric">{formatDateTime(entry.asOf)}（UTC+8）</dd></div>
                  {entry.updatedAt && <div><dt>更新时间</dt><dd className="numeric">{formatDateTime(entry.updatedAt)}（UTC+8）</dd></div>}
                  {entry.period && <div><dt>数据期间</dt><dd>{entry.period}</dd></div>}
                  {entry.actualAsOf && entry.actualAsOf !== entry.asOf && (
                    <div><dt>引用数据时间</dt><dd className="numeric">{formatDateTime(entry.actualAsOf)}（UTC+8）</dd></div>
                  )}
                  {entry.expiresAt && <div><dt>有效期至</dt><dd className="numeric">{formatDateTime(entry.expiresAt)}（UTC+8）</dd></div>}
                  <div><dt>样例证据标注</dt><dd>{evidenceStatuses[entry.status]}</dd></div>
                </dl>
              </div>
            )) : <p className="panel-body empty-note">此记录未附结构化证据。</p>}
          </section>
          <CaseReview record={record} />
        </div>
        <div className="detail-column">
          <CaseAssessment record={record} />
          <section className="panel">
            <div className="panel-heading panel-heading-row"><h2><Icon name="person" size={18} />匿名用户画像</h2><span className="muted mono">{profile.id}</span></div>
            <dl className="profile-grid panel-body">
              <div><dt>风险偏好</dt><dd>{profile.riskTolerance}</dd></div>
              <div><dt>投资期限</dt><dd>{profile.investmentHorizon}</dd></div>
              <div><dt>投资经验</dt><dd>{profile.experienceLevel}</dd></div>
            </dl>
          </section>
          {profilePair && counterpart && (
            <section className="panel">
              <div className="panel-heading panel-heading-row">
                <h2>画像对照</h2>
                <Link className="text-link" href={`/cases/${counterpart.answerId}`}>查看{counterpart.profile.riskTolerance}回答</Link>
              </div>
              <dl className="panel-body inline-metadata">
                {evidence.filter(({ id }) => profilePair.invariantEvidenceIds.includes(id)).map((entry) => {
                  const pairedEvidence = counterpart.evidence.find(({ id }) => id === entry.id);
                  if (!pairedEvidence) return null;
                  return (
                    <div key={entry.id}><dt>{entry.field}</dt><dd>{profile.riskTolerance} {formatEvidenceValue(entry.actualValue, entry)} · {counterpart.profile.riskTolerance} {formatEvidenceValue(pairedEvidence.actualValue, pairedEvidence)}</dd></div>
                  );
                })}
              </dl>
            </section>
          )}
          <section className="panel">
            <div className="panel-heading"><h2><Icon name="context" size={18} />热点上下文</h2></div>
            {hotContext ? (
              <div className="panel-body">
                <h3 className="evidence-name">{hotContext.title}</h3>
                <p>{hotContext.content}</p>
                <dl className="inline-metadata">
                  <div><dt>来源</dt><dd>{hotContext.source}</dd></div>
                  <div><dt>发布时间</dt><dd className="numeric">{formatDateTime(hotContext.publishedAt)}（UTC+8）</dd></div>
                  <div><dt>有效期至</dt><dd className="numeric">{formatDateTime(hotContext.expiresAt)}（UTC+8）</dd></div>
                </dl>
              </div>
            ) : <p className="panel-body empty-note">此记录未关联热点样例。</p>}
          </section>
        </div>
      </div>
    </>
  );
}
