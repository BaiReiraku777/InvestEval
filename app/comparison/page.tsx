import type { Metadata } from "next";
import { PageHeading } from "@/components/evaluation-ui";
import { ComparisonView } from "./comparison-view";

export const metadata: Metadata = { title: "版本对比" };

export default function ComparisonPage() {
  return (
    <>
      <PageHeading title="版本对比" description="在相同案例上比较模型、Prompt 和数据集版本的评分、Bad Case 和高风险数量。" />
      <ComparisonView />
    </>
  );
}
