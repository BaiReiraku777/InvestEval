import type { Metadata } from "next";
import { PageHeading } from "@/components/evaluation-ui";
import { baseline, cases } from "@/data/demo";
import { CaseExplorer } from "./case-explorer";

export const metadata: Metadata = { title: "问答评测中心" };

export default function CasesPage() {
  return (
    <>
      <PageHeading title="问答评测中心" description="选择样例运行评测，或打开详情查看原始问答与核验证据。" />
      <div className="scope-line"><span>{baseline.datasetVersion}</span><span className="separator" /><span>{cases.length} 条模拟记录</span></div>
      <CaseExplorer />
    </>
  );
}
