import { allAnswers, getAnswer, profilePairs } from "@/data/demo";
import { MAX_EVALUATION_CASES, type EvaluationBatch, type EvaluationRun } from "@/lib/evaluator/evaluation-run";
import { runJudge } from "@/lib/evaluator/llm-judge";
import { evaluateCase } from "@/lib/evaluator/scoring";

export async function POST(request: Request) {
  const body: unknown = await request.json().catch(() => null);
  const single = body !== null && typeof body === "object" && "answerId" in body && !("answerIds" in body);
  const ids: unknown = single ? [body.answerId]
    : body !== null && typeof body === "object" && !("answerId" in body) && "answerIds" in body ? body.answerIds : null;
  if (!Array.isArray(ids) || ids.length === 0 || !ids.every((id): id is string => typeof id === "string" && id.trim().length > 0)) {
    return Response.json({ error: { code: "INVALID_REQUEST", message: "请提供有效的 answerId 或非空的 answerIds 数组。" } }, { status: 400 });
  }
  if (ids.length > MAX_EVALUATION_CASES) {
    return Response.json({ error: { code: "BATCH_LIMIT", message: `每次最多评测 ${MAX_EVALUATION_CASES} 条样例。` } }, { status: 400 });
  }
  const answers = [...new Set(ids.map((id) => id.trim()))].map(getAnswer);
  if (!answers.every((answer) => answer !== undefined)) {
    return Response.json({ error: { code: "ANSWER_NOT_FOUND", message: "找不到一条或多条指定的演示回答。" } }, { status: 404 });
  }
  const evaluatedAt = new Date().toISOString();
  const results = await Promise.all(answers.map(async (record): Promise<EvaluationRun> => {
    const ruleResult = evaluateCase(record, { answers: allAnswers, profilePairs }, evaluatedAt);
    const judgeResult = await runJudge(record, ruleResult);
    return {
      answerId: record.answerId,
      mode: judgeResult.status === "not_configured" ? "rules_only" : "rules_and_llm",
      executionStatus: judgeResult.status === "failed" ? "incomplete" : ruleResult.executionStatus,
      highRisk: ruleResult.riskLevel === "high" || (judgeResult.status === "complete" && judgeResult.assessment.complianceRisk === "high"),
      ruleResult,
      judgeResult,
    };
  }));
  const batch: EvaluationBatch = {
    executionStatus: results.every(({ executionStatus }) => executionStatus === "complete") ? "complete" : "incomplete",
    results,
  };
  // Keep the original single-answer rule result field for existing API clients.
  return Response.json(single ? { ...batch, result: results[0].ruleResult } : batch, {
    headers: { "Cache-Control": "no-store" },
  });
}
