"use client";

import Link from "next/link";
import { CaseTable, Meter, PageHeading } from "@/components/evaluation-ui";
import { Icon } from "@/components/icon";
import { average, baseline, cases, formatScore } from "@/data/demo";
import { useEvaluationState } from "@/lib/evaluation-store";
import { evaluationFor } from "@/lib/evaluation-view";
import { dimensions, findingTypes } from "@/lib/types";

export default function DashboardPage() {
  const { runs, reviews, feedback } = useEvaluationState();
  const records = cases.map((record) => ({ record, evaluation: evaluationFor(record, runs[record.answerId]) }));
  const findings = records.flatMap(({ evaluation }) => evaluation.findingTypes);
  const highRisk = records.filter(({ evaluation }) => evaluation.riskLevel === "high").length;
  const pendingReview = records.filter(({ evaluation }) => evaluation.isBadCase &&
    (reviews[evaluation.result.id]?.status ?? "待复核") === "待复核").length;
  const scores = records.flatMap(({ evaluation }) => evaluation.score === null ? [] : [evaluation.score]);
  const liveCount = records.filter(({ evaluation }) => evaluation.result.source === "run").length;
  const recent = [...records].sort((a, b) =>
    Date.parse(b.evaluation.result.evaluatedAt) - Date.parse(a.evaluation.result.evaluatedAt))
    .slice(0, 5).map(({ record }) => record);
  const votes = Object.values(feedback);
  const helpful = votes.filter((vote) => vote.helpful).length;
  const metrics = [
    { label: "已评测数量", value: cases.length, unit: "条", icon: "checked", tone: "accent", caption: "当前数据集的样例问答" },
    { label: "平均质量评分", value: formatScore(average(scores)), unit: "/ 100", icon: "score", tone: "mint", caption: `${scores.length} 条记录有有效分数` },
    { label: "高风险数量", value: highRisk, unit: "条", icon: "risk", tone: "rose", caption: "规则或 Judge 判定高风险" },
    { label: "待人工复核", value: pendingReview, unit: "条", icon: "clock", tone: "amber", caption: "当前结果中尚未处理的问题" },
  ] as const;

  return (
    <>
      <PageHeading title="评测总览" description="查看投资 Agent 的回答质量、风险分布和最近评测记录。" action={
        <Link className="button primary" href="/cases">查看问答评测 <Icon name="arrow" size={16} /></Link>
      } />
      <div className="scope-line">
        <span>{baseline.datasetVersion} · {cases.length} 条基准问答</span><span className="separator" />
        <span>实时评测 {liveCount} 条 · DEMO 预置 {cases.length - liveCount} 条</span>
      </div>
      <div className="metric-grid">
        {metrics.map(({ label, value, unit, icon, tone, caption }) => (
          <section className="panel metric" key={label}>
            <div className="metric-header"><h2>{label}</h2><span className={`metric-icon ${tone}`}><Icon name={icon} size={19} /></span></div>
            <p className="metric-value numeric">{value} <span>{unit}</span></p>
            <p className="metric-caption">{caption}</p>
          </section>
        ))}
      </div>
      <div className="chart-grid">
        <section className="panel chart-panel">
          <div className="panel-heading"><h2>五维质量评分</h2><p>各维按有效得分取均值 · 满分 100</p></div>
          <div className="dimension-chart">
            {dimensions.map(({ key, label, weight }) => {
              const values = records.flatMap(({ evaluation }) => {
                const score = evaluation.dimension(key);
                return score === null ? [] : [score];
              });
              const score = average(values);
              return (
                <div className="dimension-row" key={key}>
                  <span>{label} <small>{weight}% · {values.length} 条</small></span>
                  <Meter value={score} />
                  <strong className="numeric">{formatScore(score)}</strong>
                </div>
              );
            })}
          </div>
        </section>
        <section className="panel chart-panel">
          <div className="panel-heading"><h2>Bad Case 类型分布</h2><p>每条回答同类归因计一次 · 共 {findings.length} 项分类</p></div>
          <ul className="distribution">
            {findingTypes.map((type, index) => {
              const count = findings.filter((finding) => finding === type).length;
              return (
                <li key={type}>
                  <span className={`distribution-label category-${index}`}><span className="dot" />{type}</span>
                  <Meter value={findings.length ? count / findings.length * 100 : 0} tone={`category-${index}`} />
                  <strong className="numeric">{count}</strong>
                </li>
              );
            })}
          </ul>
        </section>
      </div>
      <section className="panel feedback-summary" aria-label="用户反馈统计">
        <div className="panel-heading"><h2>用户反馈</h2><p>基准与变体回答 · 每条回答保留最新反馈</p></div>
        <div className="panel-body feedback-stats">
          <span>反馈总数 <strong>{votes.length}</strong></span><span>有帮助 <strong>{helpful}</strong></span>
          <span>无帮助 <strong>{votes.length - helpful}</strong></span>
          <span>有帮助率 <strong>{votes.length ? `${(helpful / votes.length * 100).toFixed(0)}%` : "—"}</strong></span>
        </div>
      </section>
      <section className="panel table-panel">
        <div className="panel-heading panel-heading-row">
          <div><h2>最近评测记录</h2><p>按评测时间从新到旧排列</p></div>
          <Link className="text-link" href="/cases">全部记录 <Icon name="arrow" size={15} /></Link>
        </div>
        <CaseTable records={recent} recent />
      </section>
    </>
  );
}
