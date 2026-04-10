"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Brain,
  LayoutDashboard,
  FileText,
  Search,
  ShieldCheck,
  Copy,
  PlusCircle,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { RestrictedToggle } from "@/components/RestrictedToggle";
import { ThemeToggle } from "@/components/ThemeToggle";

const nav: { href: string; label: string; icon: LucideIcon }[] = [
  { href: "/", label: "Dashboard", icon: LayoutDashboard },
  { href: "/thoughts", label: "Thoughts", icon: FileText },
  { href: "/search", label: "Search", icon: Search },
  { href: "/audit", label: "Audit", icon: ShieldCheck },
  { href: "/duplicates", label: "Duplicates", icon: Copy },
  { href: "/ingest", label: "Add", icon: PlusCircle },
];

export function Sidebar({ brainName }: { brainName?: string }) {
  const pathname = usePathname();

  if (pathname === "/login") return null;

  return (
    <aside className="fixed left-0 top-0 h-screen w-56 bg-bg-surface border-r border-border flex flex-col z-40">
      <div className="px-5 py-6 border-b border-border">
        <Link href="/" className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-lg bg-purple flex items-center justify-center">
            <Brain className="w-[18px] h-[18px] text-white" strokeWidth={1.5} />
          </div>
          <span className="text-text-primary font-medium text-lg tracking-tight">
            Open Brain
          </span>
        </Link>
      </div>

      <nav className="flex-1 px-3 py-4 space-y-1">
        {nav.map(({ href, label, icon: Icon }) => {
          const active =
            href === "/" ? pathname === "/" : pathname.startsWith(href);
          return (
            <Link
              key={href}
              href={href}
              className={`flex items-center gap-3 px-3 py-2.5 rounded-md text-sm font-medium transition-colors ${
                active
                  ? "bg-purple-surface text-purple border border-purple/20"
                  : "text-text-secondary hover:text-text-primary hover:bg-bg-hover"
              }`}
            >
              <Icon
                className={`w-[18px] h-[18px] ${active ? "text-purple" : "text-text-secondary"}`}
                strokeWidth={1.5}
              />
              {label}
            </Link>
          );
        })}
      </nav>

      <div className="px-3 py-3 border-t border-border space-y-2">
        <RestrictedToggle />
        <ThemeToggle />
        {brainName && (
          <div className="px-3 py-1.5">
            <p className="text-xs text-text-muted">Signed in as</p>
            <p className="text-sm text-text-primary font-medium truncate">{brainName}</p>
          </div>
        )}
        <form action="/api/logout" method="POST">
          <button
            type="submit"
            className="text-sm text-text-muted hover:text-danger transition-colors px-3 py-1"
          >
            Sign out
          </button>
        </form>
      </div>
    </aside>
  );
}
