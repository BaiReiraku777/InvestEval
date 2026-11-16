import type { Metadata } from "next";
import type { ReactNode } from "react";
import { Navigation } from "@/components/navigation";
import { StorageNotice } from "@/components/storage-notice";
import "./globals.css";

export const metadata: Metadata = {
  title: {
    default: "评测总览 | InvestEval",
    template: "%s | InvestEval",
  },
  description: "面向投资产品团队的投资 Agent 回答质量评测平台。",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="zh-CN">
      <body>
        <a className="skip-link" href="#main">跳转到内容</a>
        <div className="app-shell">
          <Navigation />
          <main id="main" className="main-content" tabIndex={-1}><StorageNotice />{children}</main>
        </div>
      </body>
    </html>
  );
}
