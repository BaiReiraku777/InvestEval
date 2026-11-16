import Link from "next/link";
import { PageHeading } from "@/components/evaluation-ui";
import { Icon } from "@/components/icon";

export default function NotFound() {
  return (
    <PageHeading title="找不到该页面或案例" description="可返回问答评测，查看可用的模拟记录。" action={
      <Link className="button primary" href="/cases"><Icon name="back" size={16} />返回问答评测</Link>
    } />
  );
}
