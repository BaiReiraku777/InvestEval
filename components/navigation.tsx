"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Icon } from "./icon";

const navigation = [
  { href: "/", label: "评测总览", icon: "dashboard" },
  { href: "/cases", label: "问答评测", icon: "cases" },
  { href: "/comparison", label: "版本对比", icon: "compare" },
] as const;

export function Navigation() {
  const pathname = usePathname();
  const current = navigation.find(({ href }) => pathname === href || pathname.startsWith(href + "/"));

  return (
    <>
      <aside className="sidebar">
        <Link className="brand" href="/" aria-label="InvestEval 首页">
          <span className="brand-icon"><Icon name="logo" size={22} /></span>
          <span>
            <strong>InvestEval</strong>
            <small>Agent 质量治理</small>
          </span>
        </Link>
        <nav className="sidebar-nav" aria-label="主导航">
          <div className="nav-label">工作台</div>
          {navigation.map(({ href, label, icon }) => (
            <Link key={href} href={href} className="nav-link" data-active={current?.href === href}
              aria-current={pathname === href ? "page" : undefined}>
              <Icon name={icon} />
              <span>{label}</span>
            </Link>
          ))}
        </nav>
        <div className="sidebar-footer">
          <span className="environment-icon"><Icon name="evidence" size={16} /></span>
          <span><strong>演示环境</strong><small>静态模拟数据</small></span>
        </div>
      </aside>
      <header className="topbar">
        <div className="breadcrumb">
          <Icon name="grid" size={17} />
          <span>工作台</span>
          {current && <><Icon name="chevron" size={13} /><strong>{current.label}</strong></>}
          {pathname.startsWith("/cases/") && <><Icon name="chevron" size={13} /><strong>案例详情</strong></>}
        </div>
        <span className="demo-label"><span className="dot" />DEMO 模拟数据</span>
      </header>
    </>
  );
}
