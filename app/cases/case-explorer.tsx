"use client";

import { useState } from "react";
import { CaseTable } from "@/components/evaluation-ui";
import { EvaluationRunCard, useEvaluationRunner } from "@/components/evaluation-runner";
import { Icon } from "@/components/icon";
import { allAnswers, cases } from "@/data/demo";
import { useEvaluationState } from "@/lib/evaluation-store";
import { evaluationFor, riskLabels } from "@/lib/evaluation-view";
import { intents, findingTypes, statuses } from "@/lib/types";
import { MAX_EVALUATION_CASES } from "@/lib/evaluator/evaluation-run";

function Filter({ label, choices, value, onChange }: {
  label: string; choices: readonly string[]; value: string; onChange: (value: string) => void;
}) {
  return (
    <label className="select-wrap">
      <span className="sr-only">{label}</span>
      <select value={value} onChange={(event) => onChange(event.target.value)}>
        <option value="">{label}</option>
        {choices.map((choice) => <option key={choice}>{choice}</option>)}
      </select>
      <Icon name="down" size={14} />
    </label>
  );
}

export function CaseExplorer() {
  const [query, setQuery] = useState("");
  const [intent, setIntent] = useState("");
  const [finding, setFinding] = useState("");
  const [status, setStatus] = useState("");
  const [score, setScore] = useState("");
  const [risk, setRisk] = useState("");
  const [scope, setScope] = useState("基准问答");
  const [selected, setSelected] = useState<string[]>([]);
  const { runs } = useEvaluationState();
  const { tasks, pending, run } = useEvaluationRunner();
  const records = scope === "基准问答" ? cases : allAnswers;
  const search = query.trim().toLowerCase();
  const hasFilters = Boolean(query || intent || finding || status || score || risk);
  const finished = tasks.filter(({ status }) => status !== "pending").length;
  const failed = tasks.filter(({ status }) => status === "failed").length;
  const incomplete = tasks.filter(({ answerId, status }) => status === "returned" && runs[answerId]?.executionStatus === "incomplete").length;
  const visible = records.filter((record) => {
    const result = evaluationFor(record, runs[record.answerId]);
    const band = result.score === null ? "无有效分数" : result.score < 60 ? "低于 60 分" : result.score < 80 ? "60 至低于 80 分" : "80 分及以上";
    return (record.answerId.toLowerCase().includes(search) || record.question.toLowerCase().includes(search)) &&
      (!intent || record.intent === intent) &&
      (!finding || result.findingTypes.some((type) => type === finding)) &&
      (!status || result.status === status) &&
      (!risk || riskLabels[result.riskLevel] === risk) && (!score || band === score);
  });

  function reset() {
    setQuery("");
    setIntent("");
    setFinding("");
    setStatus("");
    setScore("");
    setRisk("");
  }

  return (
    <section className="panel table-panel" aria-label="评测记录">
      <div className="filter-bar">
        <label className="search-field">
          <Icon name="search" size={17} />
          <span className="sr-only">搜索 Case ID 或问题</span>
          <input type="search" placeholder="搜索 Case ID 或问题" value={query} onChange={(event) => setQuery(event.target.value)} />
        </label>
        <Filter label="全部意图" choices={intents} value={intent} onChange={setIntent} />
        <Filter label="全部错误类型" choices={findingTypes} value={finding} onChange={setFinding} />
        <Filter label="全部状态" choices={statuses} value={status} onChange={setStatus} />
        <Filter label="全部评分" choices={["80 分及以上", "60 至低于 80 分", "低于 60 分", "无有效分数"]} value={score} onChange={setScore} />
        <Filter label="全部风险等级" choices={Object.values(riskLabels)} value={risk} onChange={setRisk} />
        <label className="select-wrap">
          <span className="sr-only">样例范围</span>
          <select value={scope} onChange={(event) => setScope(event.target.value)}>
            <option>基准问答</option><option>含版本及画像变体</option>
          </select><Icon name="down" size={14} />
        </label>
        {hasFilters && <button className="text-link" type="button" onClick={reset}>清除筛选</button>}
      </div>
      <div className="evaluation-toolbar">
        <div><strong>模拟问答 · 优先展示最近一次实时评测</strong><p className="muted">已选 {selected.length} 条 · 每次最多 {MAX_EVALUATION_CASES} 条</p></div>
        <div className="badge-group">
          {selected.length > 0 && <button className="text-link" type="button" disabled={pending} onClick={() => setSelected([])}>清空选择</button>}
          <button className="button primary" type="button" disabled={pending || !selected.length} onClick={() => run(selected)}>
            {pending ? "评测中…" : "运行评测"}
          </button>
        </div>
      </div>
      {tasks.length > 0 && <section className="evaluation-batch" aria-label="本次评测结果">
        <div className="panel-heading"><h2>本次评测结果</h2></div>
        <div className="panel-body evaluation-results">
          <div className="batch-progress">
            <p role="status">已处理 {finished} / {tasks.length} 条 · {failed} 条请求失败 · {incomplete} 条评测不完整</p>
            <progress aria-label="评测进度" max={tasks.length} value={finished} />
          </div>
          {tasks.map(({ answerId, status, message }) => {
            const result = runs[answerId];
            return status === "returned" && result ? <EvaluationRunCard key={answerId} run={result} link />
              : <p key={answerId} className={message ? "evaluation-error" : "muted"} role={message ? "alert" : undefined}>
                {answerId} · {message ?? "正在评测…"}
              </p>;
          })}
        </div>
      </section>}
      {visible.length ? <CaseTable records={visible} pendingIds={tasks.filter(({ status }) => status === "pending").map(({ answerId }) => answerId)} selection={{
        ids: selected, limit: MAX_EVALUATION_CASES, pending,
        toggle: (id) => setSelected((ids) => ids.includes(id) ? ids.filter((value) => value !== id)
          : ids.length < MAX_EVALUATION_CASES ? [...ids, id] : ids),
      }} /> : (
        <div className="empty-state">
          <span className="metric-icon accent"><Icon name="search" size={20} /></span>
          <h2>没有匹配的记录</h2>
          <p>换一个搜索词，或清除筛选查看全部问答。</p>
        </div>
      )}
      <div className="table-footer numeric" aria-live="polite">显示 {visible.length} 条 · 共 {records.length} 条记录</div>
    </section>
  );
}
