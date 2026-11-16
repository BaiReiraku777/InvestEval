"use client";

import { useState } from "react";
import Link from "next/link";
import { Meter } from "@/components/evaluation-ui";
import { Icon } from "@/components/icon";
import { baseline, comparisons, formatScore } from "@/data/demo";
import { useEvaluationState } from "@/lib/evaluation-store";
import { evaluationFor, pairedMean } from "@/lib/evaluation-view";
import type { EvaluationRun } from "@/lib/evaluator/evaluation-run";
import { dimensions } from "@/lib/types";

const versionFields = [
  { key: "modelVersion", label: "模型版本" },
  { key: "promptVersion", label: "Prompt 版本" },
  { key: "datasetVersion", label: "数据集版本" },
] as const;

function signed(value: number, decimals = 1) {
  const rounded = Number(value.toFixed(decimals));
  return (rounded > 0 ? "+" : "") + rounded.toFixed(decimals);
}

function judgeMethod(run: EvaluationRun) {
  return run.judgeResult.status === "complete" ? `judge:${run.judgeResult.model}` : "rules-only";
}

export function ComparisonView() {
  const [selected, setSelected] = useState(0);
  const [reverse, setReverse] = useState(false);
  const [live, setLive] = useState(false);
  const { runs } = useEvaluationState();
  const { field, candidate, description, pairs: available } = comparisons[selected];
  const left = reverse ? candidate : baseline;
  const right = reverse ? baseline : candidate;

  const pairs = available.flatMap(({ record, variant }) => {
    const [before, after] = reverse ? [variant, record] : [record, variant];
    const beforeRun = runs[before.answerId];
    const afterRun = runs[after.answerId];
    if (live && (!beforeRun || !afterRun || judgeMethod(beforeRun) !== judgeMethod(afterRun))) return [];
    return [{ before: evaluationFor(before, live ? beforeRun : undefined), after: evaluationFor(after, live ? afterRun : undefined) }];
  });
  const score = pairedMean(pairs, ({ before, after }) => [before.score, after.score]);
  const counts = [
    { label: "Bad Case 数量", predicate: ({ isBadCase }: typeof pairs[number]["before"]) => isBadCase },
    { label: "高风险案例数量", predicate: ({ riskLevel }: typeof pairs[number]["before"]) => riskLevel === "high" },
  ];

  return (
    <>
      <div className="compare-toolbar">
        <div className="segmented" role="group" aria-label="对比维度">
          {comparisons.map(({ label }, index) => (
            <button type="button" aria-pressed={index === selected} onClick={() => { setSelected(index); setReverse(false); }} key={label}>{label}</button>
          ))}
        </div>
        <label className="select-wrap">
          <span className="sr-only">评测结果来源</span>
          <select value={live ? "live" : "preset"} onChange={(event) => setLive(event.target.value === "live")}>
            <option value="preset">DEMO 预置结果</option><option value="live">实时评测结果</option>
          </select><Icon name="down" size={14} />
        </label>
        <p>{description}</p>
      </div>
      <section className="panel table-panel">
            <div className="panel-heading panel-heading-row">
              <div><h2>对比版本</h2><p>仅配对同一 Case ID、同一画像；未配对记录不计入统计。</p></div>
              <span className="intent-label">{pairs.length} / {available.length} 组配对</span>
            </div>
            <div className="version-selectors">
              {[{ label: "基线版本", value: left[field], reversed: candidate[field] },
                { label: "对比版本", value: right[field], reversed: baseline[field] }].map(({ label, value, reversed }) => (
                <label className="version-selection" key={label}>{label}
                  <span className="select-wrap">
                    <select value={value} onChange={(event) => setReverse(event.target.value === reversed)}>
                      {[baseline[field], candidate[field]].map((version) => <option key={version}>{version}</option>)}
                    </select><Icon name="down" size={14} />
                  </span>
                </label>
              ))}
            </div>
            <div className="table-scroll" role="region" tabIndex={0} aria-label="对比版本表格">
              <table className="versions-table">
                <thead><tr><th scope="col">版本组合</th>{versionFields.map(({ key, label }) => <th key={key} scope="col">{label}</th>)}</tr></thead>
                <tbody>
                  <tr><th scope="row"><span className="legend-item base"><span className="dot" />基线版本</span></th>{versionFields.map(({ key }) => <td key={key}>{left[key]}</td>)}</tr>
                  <tr><th scope="row"><span className="legend-item candidate"><span className="dot" />对比版本</span></th>{versionFields.map(({ key }) => <td key={key} className={left[key] !== right[key] ? "changed-version" : ""}>{right[key]}</td>)}</tr>
                </tbody>
              </table>
            </div>
      </section>
      {pairs.length === 0 ? (
        <section className="panel compare-empty empty-state"><h2>暂无可配对的结果</h2><p>可从下方进入同一案例的两份回答，分别运行评测。</p></section>
      ) : (
          <div className="comparison-grid">
            <section className="panel chart-panel comparison-chart">
              <div className="panel-heading panel-heading-row">
                <div><h2>五维评分变化</h2><p>配对样本维度均分 · 满分 100</p></div>
                <div className="legend"><span className="legend-item base"><span className="dot" />基线</span><span className="legend-item candidate"><span className="dot" />对比</span></div>
              </div>
              <div className="paired-chart">
                {dimensions.map(({ key, label }) => {
                  const { before, after, count } = pairedMean(pairs, (pair) => [pair.before.dimension(key), pair.after.dimension(key)]);
                  return (
                    <div className="paired-row" key={key}>
                      <span>{label}<small className="table-secondary">{count} 组有效配对</small></span>
                      <div className="paired-meters">
                        <div><Meter value={before} tone="base-bar" /><span className="numeric"><span className="sr-only">基线 </span>{formatScore(before)}</span></div>
                        <div><Meter value={after} /><strong className="numeric"><span className="sr-only">对比 </span>{formatScore(after)}</strong></div>
                      </div>
                      <span className="delta numeric"><span className="sr-only">变化 </span>{before === null || after === null ? "—" : signed(after - before)}</span>
                    </div>
                  );
                })}
              </div>
            </section>
            <section className="panel chart-panel">
              <div className="panel-heading"><h2>综合表现</h2><p>仅含两侧共有的 {pairs.length} 条记录</p></div>
              <div className="comparison-summary">
                <div className="comparison-result">
                  <h3>平均综合评分 · {score.count} 组有效配对</h3>
                  <div className="comparison-values numeric"><span>{formatScore(score.before)}</span><Icon name="arrow" size={18} /><strong>{formatScore(score.after)}</strong>
                    {score.before !== null && score.after !== null && <span className="delta">{signed(score.after - score.before)} 分</span>}
                  </div>
                  <Meter value={score.before} tone="base-bar" /><Meter value={score.after} />
                </div>
                {counts.map(({ label, predicate }) => {
                  const before = pairs.filter((pair) => predicate(pair.before)).length;
                  const after = pairs.filter((pair) => predicate(pair.after)).length;
                  return <div className="comparison-result" key={label}>
                    <h3>{label}</h3>
                    <div className="comparison-values numeric"><span>{before}</span><Icon name="arrow" size={18} /><strong>{after}</strong><span className="delta">{signed(after - before, 0)} 条</span></div>
                    <Meter value={before / pairs.length * 100} tone="base-bar" /><Meter value={after / pairs.length * 100} />
                  </div>;
                })}
              </div>
            </section>
          </div>
      )}
      <div className="comparison-footnote">
            <div className="scope-line paired-scope">
              <span>可配对案例</span>
              {available.map(({ record, variant }) => (
                <span key={record.id}>
                  <Link className="mono" href={`/cases/${reverse ? variant.answerId : record.answerId}`}>{record.id} 基线</Link>
                  <Link className="mono" aria-label={`${record.id} 对比`} href={`/cases/${reverse ? record.answerId : variant.answerId}`}>对比</Link>
                </span>
              ))}
            </div>
            <p>{live ? "仅使用两侧都有实时结果且 Judge 评测方式一致的配对。实时综合分来自规则，可能含待核验项。" : "预置分数来自模拟样例。"}分差按四舍五入前的均分计算。</p>
      </div>
    </>
  );
}
