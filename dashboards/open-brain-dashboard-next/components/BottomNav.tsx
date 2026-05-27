"use client";

import { useState, useEffect, useRef } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard,
  FileText,
  Search,
  PlusCircle,
  MoreHorizontal,
  ShieldCheck,
  Copy,
  Kanban,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { ThemeToggle } from "@/components/ThemeToggle";
import { RestrictedToggle } from "@/components/RestrictedToggle";

const tabs: { href: string; label: string; icon: LucideIcon }[] = [
  { href: "/", label: "Dashboard", icon: LayoutDashboard },
  { href: "/thoughts", label: "Thoughts", icon: FileText },
  { href: "/search", label: "Search", icon: Search },
  { href: "/ingest", label: "Add", icon: PlusCircle },
];

export function BottomNav({ brainName }: { brainName?: string }) {
  const pathname = usePathname();
  const [moreOpen, setMoreOpen] = useState(false);
  const moreRef = useRef<HTMLDivElement>(null);

  const closeMore = () => setMoreOpen(false);

  // Close popover on outside click
  useEffect(() => {
    if (!moreOpen) return;
    function handleClick(e: MouseEvent) {
      if (moreRef.current && !moreRef.current.contains(e.target as Node)) {
        closeMore();
      }
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [moreOpen]);

  if (pathname === "/login") return null;

  const isMoreActive =
    pathname.startsWith("/audit") ||
    pathname.startsWith("/duplicates") ||
    pathname.startsWith("/kanban");
  const moreHighlighted = isMoreActive || moreOpen;

  function menuLinkClass(href: string): string {
    const active = pathname.startsWith(href);
    return `flex items-center gap-3 px-4 py-3 text-sm transition-colors ${
      active
        ? "text-purple bg-purple-surface"
        : "text-text-secondary hover:text-text-primary hover:bg-bg-hover"
    }`;
  }

  return (
    <nav
      className="fixed bottom-0 inset-x-0 md:hidden z-40 bg-bg-surface border-t border-border pb-[env(safe-area-inset-bottom,0px)]"
      aria-label="Mobile navigation"
    >
      <div className="flex items-stretch h-14">
        {tabs.map(({ href, label, icon: Icon }) => {
          const active =
            href === "/" ? pathname === "/" : pathname.startsWith(href);
          return (
            <Link
              key={href}
              href={href}
              className={`flex-1 flex flex-col items-center justify-center gap-0.5 text-xs font-medium transition-colors ${
                active
                  ? "text-purple"
                  : "text-text-muted hover:text-text-secondary"
              }`}
            >
              <Icon
                className={`w-5 h-5 ${active ? "text-purple" : "text-text-muted"}`}
                strokeWidth={1.5}
              />
              <span>{label}</span>
            </Link>
          );
        })}

        {/* More tab */}
        <div ref={moreRef} className="flex-1 relative">
          <button
            onClick={() => setMoreOpen((v) => !v)}
            className={`w-full h-full flex flex-col items-center justify-center gap-0.5 text-xs font-medium transition-colors ${
              moreHighlighted
                ? "text-purple"
                : "text-text-muted hover:text-text-secondary"
            }`}
            aria-label="More options"
            aria-expanded={moreOpen}
          >
            <MoreHorizontal
              className={`w-5 h-5 ${moreHighlighted ? "text-purple" : "text-text-muted"}`}
              strokeWidth={1.5}
            />
            <span>More</span>
          </button>

          {/* Popover panel */}
          {moreOpen && (
            <>
              {/* Backdrop */}
              <div
                className="fixed inset-0 z-40"
                aria-hidden="true"
                onClick={closeMore}
              />
              <div className="absolute bottom-full right-0 mb-2 w-56 z-50 bg-bg-surface border border-border rounded-xl shadow-2xl overflow-hidden">
                <div className="py-1">
                  <Link
                    href="/kanban"
                    onClick={closeMore}
                    className={menuLinkClass("/kanban")}
                  >
                    <Kanban className="w-4 h-4" strokeWidth={1.5} />
                    Workflow
                  </Link>
                  <Link
                    href="/audit"
                    onClick={closeMore}
                    className={menuLinkClass("/audit")}
                  >
                    <ShieldCheck className="w-4 h-4" strokeWidth={1.5} />
                    Audit
                  </Link>
                  <Link
                    href="/duplicates"
                    onClick={closeMore}
                    className={menuLinkClass("/duplicates")}
                  >
                    <Copy className="w-4 h-4" strokeWidth={1.5} />
                    Duplicates
                  </Link>
                </div>
                <div className="border-t border-border py-1 px-1 space-y-0.5">
                  <ThemeToggle />
                  <RestrictedToggle />
                </div>
                {brainName && (
                  <div className="border-t border-border px-4 py-3">
                    <p className="text-xs text-text-muted">Signed in as</p>
                    <p className="text-sm text-text-primary font-medium truncate">
                      {brainName}
                    </p>
                  </div>
                )}
                <div className="border-t border-border px-4 py-2">
                  <form action="/api/logout" method="POST">
                    <button
                      type="submit"
                      className="text-sm text-text-muted hover:text-danger transition-colors py-1"
                    >
                      Sign out
                    </button>
                  </form>
                </div>
              </div>
            </>
          )}
        </div>
      </div>
    </nav>
  );
}
