"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Database,
  History,
  LayoutDashboard,
  ListChecks,
  PanelLeft,
  Sparkles,
  WandSparkles,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";

type NavigationItem = {
  href: string;
  label: string;
  icon: LucideIcon;
};

const navigation: NavigationItem[] = [
  { href: "/dashboard", label: "대시보드", icon: LayoutDashboard },
  { href: "/context", label: "개인 맥락", icon: Database },
  { href: "/workflows", label: "작업 유형", icon: ListChecks },
  { href: "/generate", label: "결과 생성", icon: WandSparkles },
  { href: "/history", label: "작업 기록", icon: History },
];

export function AppShell({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-screen bg-[var(--canvas)] text-[var(--ink)]">
      <Sidebar />
      <div className="min-h-screen lg:pl-72">
        <header className="sticky top-0 z-20 border-b border-[var(--line)] bg-[var(--canvas)]/95 backdrop-blur lg:hidden">
          <div className="flex h-16 items-center justify-between px-4">
            <Link href="/dashboard" className="flex min-w-0 items-center gap-3">
              <span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-[var(--ink)] text-white">
                <Sparkles size={18} />
              </span>
              <span className="truncate text-sm font-semibold">Hyunwoo WorkOS</span>
            </Link>
            <PanelLeft size={20} aria-hidden />
          </div>
          <nav className="flex gap-2 overflow-x-auto px-4 pb-3">
            {navigation.map((item) => (
              <NavPill key={item.href} item={item} compact />
            ))}
          </nav>
        </header>
        <main className="mx-auto w-full max-w-7xl px-4 py-6 sm:px-6 lg:px-10 lg:py-10">{children}</main>
      </div>
    </div>
  );
}

export function Sidebar() {
  return (
    <aside className="fixed inset-y-0 left-0 z-30 hidden w-72 border-r border-[var(--line)] bg-[var(--panel)] lg:block">
      <div className="flex h-full flex-col">
        <div className="border-b border-[var(--line)] px-6 py-6">
          <Link href="/dashboard" className="flex items-center gap-3">
            <span className="grid h-10 w-10 place-items-center rounded-lg bg-[var(--ink)] text-white">
              <Sparkles size={19} />
            </span>
            <span>
              <span className="block text-base font-semibold">Hyunwoo WorkOS</span>
              <span className="block text-xs text-[var(--muted)]">내 프로젝트와 이력을 기억하는 AI 작업비서</span>
            </span>
          </Link>
        </div>
        <nav className="flex flex-1 flex-col gap-1 px-4 py-5">
          {navigation.map((item) => (
            <NavPill key={item.href} item={item} />
          ))}
        </nav>
        <div className="border-t border-[var(--line)] px-6 py-5">
          <div className="rounded-lg border border-[var(--line)] bg-white px-4 py-3 text-sm">
            <p className="font-medium text-[var(--ink)]">MVP 모드</p>
            <p className="mt-1 text-xs leading-5 text-[var(--muted)]">
              localStorage와 mock 응답만으로 전체 흐름을 체험합니다.
            </p>
          </div>
        </div>
      </div>
    </aside>
  );
}

function NavPill({ item, compact = false }: { item: NavigationItem; compact?: boolean }) {
  const pathname = usePathname();
  const isActive = pathname === item.href || (item.href === "/dashboard" && pathname === "/");
  const Icon = item.icon;

  return (
    <Link
      href={item.href}
      className={[
        "inline-flex items-center gap-3 rounded-lg border px-3 py-2 text-sm font-medium transition",
        compact ? "shrink-0" : "w-full",
        isActive
          ? "border-[var(--ink)] bg-[var(--ink)] text-white shadow-sm"
          : "border-transparent text-[var(--muted)] hover:border-[var(--line)] hover:bg-white hover:text-[var(--ink)]",
      ].join(" ")}
    >
      <Icon size={17} />
      <span>{item.label}</span>
    </Link>
  );
}
