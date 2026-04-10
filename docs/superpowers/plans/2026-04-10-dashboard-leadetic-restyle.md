# Dashboard Leadetic Restyle — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Restyle the Open Brain Next.js dashboard with Leadetic's visual identity (colors, typography, icons) and add light/dark mode support.

**Architecture:** Pure theming change — no structural layout, routing, or business logic changes. Rewrite CSS custom properties in `globals.css` to Leadetic palette, swap fonts from Geist to Noto Serif + Inter, replace custom SVG icons with Lucide, and add a `ThemeToggle` client component. Dark mode uses `.dark` class on `<html>` with a no-flash inline script.

**Tech Stack:** Next.js 16, React 19, Tailwind CSS v4 (`@theme inline`), `lucide-react`, `next/font/google` (Noto Serif, Inter, Geist Mono)

**Design spec:** `docs/superpowers/specs/2026-04-10-dashboard-design-review.md`

**Security note:** Task 3 uses an inline `<script>` in `<head>` for the dark mode no-flash pattern. The script content is a static string literal with zero user input — this is a well-established Next.js pattern (used by next-themes, Tailwind docs, etc.) with no XSS risk.

---

## File Map

| File | Action | Responsibility |
|------|--------|----------------|
| `package.json` | Modify | Add `lucide-react` dependency |
| `app/globals.css` | Rewrite | Leadetic color tokens (light default), `.dark {}` overrides, font variables, scrollbar/selection |
| `app/layout.tsx` | Modify | Swap font imports, no-flash script, CSS variable classes on `<html>` |
| `components/ThemeToggle.tsx` | Create | Dark mode toggle client component (Moon/Sun icon, localStorage, `.dark` class) |
| `components/Sidebar.tsx` | Rewrite | Brain icon, Lucide nav icons, remove 6 inline SVG functions, integrate ThemeToggle |
| `components/ThoughtCard.tsx` | Modify | Remap `typeColors` to Leadetic palette with light/dark variants, update card classes |
| `components/StatsWidget.tsx` | Modify | Card border-radius, font classes |
| `components/SearchBar.tsx` | Modify | Input/button token renames, border-radius |
| `components/AddToBrain.tsx` | Modify | Textarea/button token renames, border-radius |
| `components/ThoughtEditor.tsx` | Modify | Token renames |
| `components/ThoughtsFilter.tsx` | Modify | Token renames |
| `components/DeleteModal.tsx` | Modify | Token renames, border-radius |
| `components/ReflectionComposer.tsx` | Modify | Token renames |
| `components/ConnectionsPanel.tsx` | Modify | Token renames |
| `components/ThoughtDeleteButton.tsx` | Modify | Token renames |
| `components/RestrictedToggle.tsx` | Modify | Lucide Lock/LockOpen icons, token renames |
| `components/FormattedDate.tsx` | No change | — |
| `app/page.tsx` | Modify | Heading font classes, spacing |
| `app/login/page.tsx` | Modify | Brain icon, heading font classes |
| `app/login/LoginForm.tsx` | Modify | Token renames |
| `app/thoughts/page.tsx` | Modify | Heading font classes, table header classes |
| `app/thoughts/[id]/page.tsx` | Modify | Heading font classes |
| `app/search/page.tsx` | Modify | Heading font classes |
| `app/duplicates/page.tsx` | Modify | Heading font classes, token renames |
| `app/ingest/page.tsx` | Modify | Heading font classes |
| `app/audit/page.tsx` | Modify | Heading font classes |

---

### Task 1: Install lucide-react

**Files:**
- Modify: `dashboards/open-brain-dashboard-next/package.json`

- [ ] **Step 1: Install lucide-react**

```bash
cd dashboards/open-brain-dashboard-next && npm install lucide-react
```

Expected: `lucide-react` added to `dependencies` in `package.json` and `package-lock.json` updated.

- [ ] **Step 2: Commit**

```bash
cd dashboards/open-brain-dashboard-next && git add package.json package-lock.json && git commit -m "[dashboards] Add lucide-react dependency for icon standardization"
```

---

### Task 2: Rewrite globals.css with Leadetic theme

**Files:**
- Rewrite: `dashboards/open-brain-dashboard-next/app/globals.css`

This is the foundation — all color tokens, font variables, and dark mode overrides. The token name changes from `violet` to `purple` here. All subsequent tasks will use the new token names.

- [ ] **Step 1: Replace globals.css with Leadetic theme**

Write this exact content to `dashboards/open-brain-dashboard-next/app/globals.css`:

```css
@import "tailwindcss";

@theme inline {
  /* === Light mode (default) === */

  /* Backgrounds */
  --color-bg-primary: #faf9f5;
  --color-bg-surface: #ffffff;
  --color-bg-elevated: #faf9f5;
  --color-bg-hover: #f0efeb;

  /* Borders */
  --color-border: #e8e7e9;
  --color-border-subtle: #f0efeb;

  /* Text */
  --color-text-primary: #061923;
  --color-text-secondary: #a3a0a6;
  --color-text-muted: #c0bec3;

  /* Purple accent (Leadetic #8257a3) */
  --color-purple: #8257a3;
  --color-purple-dim: #6d4590;
  --color-purple-glow: rgba(130, 87, 163, 0.15);
  --color-purple-surface: rgba(130, 87, 163, 0.08);

  /* Semantic */
  --color-success: #699595;
  --color-warning: #fdbf14;
  --color-danger: #dc2626;
  --color-info: #2563eb;

  /* Fonts */
  --font-serif: var(--font-noto-serif), Georgia, serif;
  --font-sans: var(--font-inter), system-ui, sans-serif;
  --font-mono: var(--font-geist-mono), monospace;
}

/* === Dark mode overrides === */
.dark {
  --color-bg-primary: #061923;
  --color-bg-surface: #0d2633;
  --color-bg-elevated: #143040;
  --color-bg-hover: #1a3a4d;

  --color-border: #1a2f3d;
  --color-border-subtle: #142430;

  --color-text-primary: #faf9f5;
  --color-text-secondary: #5a7a8a;
  --color-text-muted: #3d5a68;

  --color-purple: #8257a3;
  --color-purple-dim: #6d4590;
  --color-purple-glow: rgba(130, 87, 163, 0.25);
  --color-purple-surface: rgba(130, 87, 163, 0.15);

  --color-success: #82b0b0;
  --color-warning: #fdbf14;
  --color-danger: #f87171;
  --color-info: #60a5fa;
}

body {
  background: var(--color-bg-primary);
  color: var(--color-text-primary);
  font-family: var(--font-sans);
}

/* Scrollbar */
::-webkit-scrollbar {
  width: 6px;
  height: 6px;
}
::-webkit-scrollbar-track {
  background: var(--color-bg-primary);
}
::-webkit-scrollbar-thumb {
  background: var(--color-border);
  border-radius: 3px;
}
::-webkit-scrollbar-thumb:hover {
  background: var(--color-text-muted);
}

/* Selection */
::selection {
  background: var(--color-purple-glow);
  color: var(--color-text-primary);
}
```

- [ ] **Step 2: Rename violet to purple in all component files**

Run a project-wide find-and-replace. This is mechanical — every `violet` token reference in TSX files becomes `purple`:

```bash
cd dashboards/open-brain-dashboard-next
find . -name '*.tsx' -not -path './node_modules/*' -exec sed -i '' \
  -e 's/text-violet/text-purple/g' \
  -e 's/bg-violet/bg-purple/g' \
  -e 's/border-violet/border-purple/g' \
  -e 's/ring-violet/ring-purple/g' \
  -e 's/accent-violet/accent-purple/g' \
  -e 's/violet-dim/purple-dim/g' \
  -e 's/violet-glow/purple-glow/g' \
  -e 's/violet-surface/purple-surface/g' \
  {} +
```

After running, spot-check a few files to verify the replacements look correct. The CSS file already uses `purple` so it won't be affected.

- [ ] **Step 3: Verify no broken references**

```bash
cd dashboards/open-brain-dashboard-next
grep -r 'violet' --include='*.tsx' --include='*.css' . | grep -v node_modules | grep -v '.next'
```

Expected: No results (or only comments/string literals, not class names).

- [ ] **Step 4: Commit**

```bash
cd dashboards/open-brain-dashboard-next && git add -A && git commit -m "[dashboards] Restyle CSS foundation: Leadetic palette, dark mode, violet to purple rename"
```

---

### Task 3: Update layout.tsx — fonts and no-flash script

**Files:**
- Modify: `dashboards/open-brain-dashboard-next/app/layout.tsx`

- [ ] **Step 1: Replace layout.tsx font imports and add dark mode script**

Replace the full content of `dashboards/open-brain-dashboard-next/app/layout.tsx` with:

```tsx
import type { Metadata } from "next";
import { Noto_Serif, Inter } from "next/font/google";
import { Geist_Mono } from "next/font/google";
import "./globals.css";
import { Sidebar } from "@/components/Sidebar";
import { getSession } from "@/lib/auth";

const notoSerif = Noto_Serif({
  variable: "--font-noto-serif",
  subsets: ["latin"],
  weight: ["300"],
});

const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
  weight: ["300", "500", "700"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Open Brain",
  description: "Second brain dashboard",
};

// Static dark-mode bootstrap — runs before first paint to prevent flash.
// This is a hardcoded string literal with no user input (safe, no XSS risk).
// Same pattern used by next-themes, Tailwind docs, and Vercel templates.
const themeScript = [
  "(function(){",
  "var t=localStorage.getItem('theme');",
  "if(t==='dark'||(!t&&window.matchMedia('(prefers-color-scheme:dark)').matches)){",
  "document.documentElement.classList.add('dark')",
  "}",
  "})()",
].join("");

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const session = await getSession();
  const brainName = session.brainName;

  return (
    <html
      lang="en"
      className={`${notoSerif.variable} ${inter.variable} ${geistMono.variable} h-full antialiased`}
      suppressHydrationWarning
    >
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
      </head>
      <body className="min-h-screen flex bg-bg-primary text-text-primary font-sans font-light">
        <Sidebar brainName={brainName} />
        <main className="flex-1 ml-56 min-h-screen">
          <div className="max-w-6xl mx-auto px-8 py-8">
            {children}
          </div>
        </main>
      </body>
    </html>
  );
}
```

Key changes:
- `Geist` + `Geist_Mono` replaced with `Noto_Serif` + `Inter` + `Geist_Mono`
- CSS variable names match globals.css: `--font-noto-serif`, `--font-inter`, `--font-geist-mono`
- Inline script in `<head>` for no-flash dark mode
- `suppressHydrationWarning` on `<html>` because the script may add `.dark` before React hydrates
- Body gets `font-sans font-light` as default (Inter 300)

- [ ] **Step 2: Commit**

```bash
cd dashboards/open-brain-dashboard-next && git add app/layout.tsx && git commit -m "[dashboards] Swap to Noto Serif + Inter fonts, add no-flash dark mode script"
```

---

### Task 4: Create ThemeToggle component

**Files:**
- Create: `dashboards/open-brain-dashboard-next/components/ThemeToggle.tsx`

- [ ] **Step 1: Write ThemeToggle.tsx**

Create `dashboards/open-brain-dashboard-next/components/ThemeToggle.tsx`:

```tsx
"use client";

import { useEffect, useState } from "react";
import { Moon, Sun } from "lucide-react";

export function ThemeToggle() {
  const [dark, setDark] = useState(false);

  useEffect(() => {
    setDark(document.documentElement.classList.contains("dark"));
  }, []);

  function toggle() {
    const next = !dark;
    setDark(next);
    document.documentElement.classList.toggle("dark", next);
    localStorage.setItem("theme", next ? "dark" : "light");
  }

  return (
    <button
      onClick={toggle}
      className="flex items-center gap-2 px-3 py-2 rounded-md text-xs font-medium text-text-secondary hover:text-text-primary hover:bg-bg-hover transition-colors w-full"
    >
      {dark ? (
        <Sun className="w-4 h-4" strokeWidth={1.5} />
      ) : (
        <Moon className="w-4 h-4" strokeWidth={1.5} />
      )}
      {dark ? "Light mode" : "Dark mode"}
      <div
        className={`ml-auto w-9 h-5 rounded-full relative transition-colors ${
          dark ? "bg-purple" : "bg-border"
        }`}
      >
        <div
          className={`absolute top-0.5 w-4 h-4 rounded-full bg-white shadow-sm transition-transform ${
            dark ? "translate-x-4" : "translate-x-0.5"
          }`}
        />
      </div>
    </button>
  );
}
```

- [ ] **Step 2: Commit**

```bash
cd dashboards/open-brain-dashboard-next && git add components/ThemeToggle.tsx && git commit -m "[dashboards] Add ThemeToggle component with localStorage persistence"
```

---

### Task 5: Rewrite Sidebar with Lucide icons and brain logo

**Files:**
- Rewrite: `dashboards/open-brain-dashboard-next/components/Sidebar.tsx`

This is the biggest single file change. Replaces all 6 custom SVG icon functions with Lucide imports, swaps the `OB` text mark for a Brain icon, and integrates the ThemeToggle.

- [ ] **Step 1: Replace Sidebar.tsx**

Replace the full content of `dashboards/open-brain-dashboard-next/components/Sidebar.tsx` with:

```tsx
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
```

Key changes:
- 6 inline SVG functions deleted, replaced by Lucide icon imports
- `OB` text mark replaced with `Brain` Lucide icon on purple square
- Nav items use `LucideIcon` type for the icon prop
- `ThemeToggle` integrated in sidebar footer
- `font-semibold` changed to `font-medium` on title (Inter 500)
- `rounded-lg` changed to `rounded-md` on nav items (6px)

- [ ] **Step 2: Commit**

```bash
cd dashboards/open-brain-dashboard-next && git add components/Sidebar.tsx && git commit -m "[dashboards] Sidebar: Brain icon, Lucide nav icons, ThemeToggle integration"
```

---

### Task 6: Update ThoughtCard type badges

**Files:**
- Modify: `dashboards/open-brain-dashboard-next/components/ThoughtCard.tsx`

The type badge colors need light/dark variants. Since CSS variables don't help here (each badge has unique colors), we use Tailwind `dark:` classes.

- [ ] **Step 1: Replace typeColors and update card classes in ThoughtCard.tsx**

Replace the full content of `dashboards/open-brain-dashboard-next/components/ThoughtCard.tsx` with:

```tsx
import Link from "next/link";
import type { Thought } from "@/lib/types";
import { FormattedDate } from "@/components/FormattedDate";

const typeColors: Record<string, string> = {
  idea: "bg-amber-500/10 text-amber-700 border-amber-500/25 dark:bg-amber-500/12 dark:text-amber-400 dark:border-amber-500/25",
  task: "bg-blue-500/8 text-blue-600 border-blue-500/20 dark:bg-blue-500/12 dark:text-blue-400 dark:border-blue-500/25",
  person_note: "bg-teal-500/10 text-teal-700 border-teal-500/25 dark:bg-teal-500/15 dark:text-teal-300 dark:border-teal-500/30",
  reference: "bg-gray-500/10 text-gray-600 border-gray-500/25 dark:bg-gray-500/12 dark:text-gray-400 dark:border-gray-500/25",
  decision: "bg-purple-surface text-purple border-purple/20 dark:bg-purple/15 dark:text-purple-300 dark:border-purple/30",
  lesson: "bg-orange-500/10 text-orange-700 border-orange-500/20 dark:bg-orange-500/12 dark:text-orange-400 dark:border-orange-500/25",
  meeting: "bg-teal-500/8 text-teal-600 border-teal-500/15 dark:bg-teal-500/12 dark:text-teal-300 dark:border-teal-500/20",
  journal: "bg-pink-500/10 text-pink-700 border-pink-500/20 dark:bg-pink-500/12 dark:text-pink-400 dark:border-pink-500/25",
};

export function TypeBadge({ type }: { type: string }) {
  const colors = typeColors[type] || typeColors.reference;
  return (
    <span
      className={`inline-flex items-center px-2 py-0.5 rounded-md text-xs font-medium border ${colors}`}
    >
      {type}
    </span>
  );
}

export function ThoughtCard({
  thought,
  showLink = true,
}: {
  thought: Thought;
  showLink?: boolean;
}) {
  const preview =
    thought.content.length > 200
      ? thought.content.slice(0, 200) + "..."
      : thought.content;

  const inner = (
    <div className="bg-bg-surface border border-border rounded-xl p-4 hover:border-purple/30 transition-colors">
      <div className="flex items-start justify-between gap-3 mb-2">
        <div className="flex items-center gap-2">
          <TypeBadge type={thought.type} />
          {thought.importance > 0 && (
            <span className="text-xs text-text-muted">
              imp: {thought.importance}
            </span>
          )}
        </div>
        <FormattedDate date={thought.created_at} className="text-xs text-text-muted whitespace-nowrap" />
      </div>
      <p className="text-sm text-text-secondary leading-relaxed">{preview}</p>
      {thought.source_type && (
        <span className="inline-block mt-2 text-xs text-text-muted">
          {thought.source_type}
        </span>
      )}
    </div>
  );

  if (showLink) {
    return <Link href={`/thoughts/${thought.id}`}>{inner}</Link>;
  }
  return inner;
}
```

Key changes:
- `typeColors` remapped to Leadetic-aligned tones with `dark:` variants
- Card `rounded-lg` changed to `rounded-xl` (12px)
- Badge `rounded` changed to `rounded-md` (6px)

- [ ] **Step 2: Commit**

```bash
cd dashboards/open-brain-dashboard-next && git add components/ThoughtCard.tsx && git commit -m "[dashboards] Remap type badge colors to Leadetic palette with dark mode variants"
```

---

### Task 7: Update StatsWidget

**Files:**
- Modify: `dashboards/open-brain-dashboard-next/components/StatsWidget.tsx`

- [ ] **Step 1: Update card classes**

In `dashboards/open-brain-dashboard-next/components/StatsWidget.tsx`, apply these changes:

1. All three stat card divs have class `bg-bg-surface border border-border rounded-lg p-5`. Change `rounded-lg` to `rounded-xl` on all three.

2. On the topic name span with class `text-text-secondary truncate`, add `font-light`.

- [ ] **Step 2: Commit**

```bash
cd dashboards/open-brain-dashboard-next && git add components/StatsWidget.tsx && git commit -m "[dashboards] StatsWidget: card radius 12px, font-light on body text"
```

---

### Task 8: Update page headings

All page files need the same pattern: H1 gets `font-serif font-light tracking-tight`, H2 gets `font-serif font-light`. Cards get `rounded-xl`.

**Files:**
- Modify: `dashboards/open-brain-dashboard-next/app/page.tsx`
- Modify: `dashboards/open-brain-dashboard-next/app/thoughts/page.tsx`
- Modify: `dashboards/open-brain-dashboard-next/app/thoughts/[id]/page.tsx`
- Modify: `dashboards/open-brain-dashboard-next/app/search/page.tsx`
- Modify: `dashboards/open-brain-dashboard-next/app/duplicates/page.tsx`
- Modify: `dashboards/open-brain-dashboard-next/app/ingest/page.tsx`
- Modify: `dashboards/open-brain-dashboard-next/app/audit/page.tsx`

- [ ] **Step 1: Update app/page.tsx (Dashboard)**

In `app/page.tsx`, make these edits:

- `<h1 className="text-2xl font-semibold mb-1">` change to `<h1 className="text-2xl font-serif font-light tracking-tight mb-1">`
- `<h2 className="text-lg font-medium mb-1">Add to Brain</h2>` change to `<h2 className="text-lg font-serif font-light mb-1">Add to Brain</h2>`
- `<h2 className="text-lg font-medium mb-3">Recent Activity</h2>` change to `<h2 className="text-lg font-serif font-light mb-3">Recent Activity</h2>`

- [ ] **Step 2: Update app/thoughts/page.tsx**

- H1: `text-2xl font-semibold` change to `text-2xl font-serif font-light tracking-tight`
- Table container: `rounded-lg` change to `rounded-xl`

- [ ] **Step 3: Update app/thoughts/[id]/page.tsx**

- Reflections H3 `text-lg font-medium` change to `text-lg font-serif font-light`
- Metadata panel and reflections cards: `rounded-lg` change to `rounded-xl`

- [ ] **Step 4: Update app/search/page.tsx**

- H1: `text-2xl font-semibold` change to `text-2xl font-serif font-light tracking-tight`
- Search result cards: `rounded-lg` change to `rounded-xl`

- [ ] **Step 5: Update app/duplicates/page.tsx**

- H1: `text-2xl font-semibold` change to `text-2xl font-serif font-light tracking-tight`
- Pair container cards: `rounded-lg` change to `rounded-xl`

- [ ] **Step 6: Update app/ingest/page.tsx**

- H1: `text-2xl font-semibold` change to `text-2xl font-serif font-light tracking-tight`
- H2 "Recent Activity": `text-lg font-medium` change to `text-lg font-serif font-light`
- Job cards and AddToBrain container: `rounded-lg` change to `rounded-xl`

- [ ] **Step 7: Update app/audit/page.tsx**

- H1: `text-2xl font-semibold` change to `text-2xl font-serif font-light tracking-tight`
- Table container: `rounded-lg` change to `rounded-xl`

- [ ] **Step 8: Commit**

```bash
cd dashboards/open-brain-dashboard-next && git add app/page.tsx app/thoughts/page.tsx "app/thoughts/[id]/page.tsx" app/search/page.tsx app/duplicates/page.tsx app/ingest/page.tsx app/audit/page.tsx && git commit -m "[dashboards] Update page headings to Noto Serif Light, cards to 12px radius"
```

---

### Task 9: Update login page with brain icon

**Files:**
- Modify: `dashboards/open-brain-dashboard-next/app/login/page.tsx`
- Modify: `dashboards/open-brain-dashboard-next/app/login/LoginForm.tsx`

- [ ] **Step 1: Update login/page.tsx**

1. Add import at top: `import { Brain } from "lucide-react";`

2. Replace the `OB` span inside the logo div:

   Change `<span className="text-white text-2xl font-bold">OB</span>`
   to `<Brain className="w-7 h-7 text-white" strokeWidth={1.5} />`

3. H1: change `text-2xl font-semibold` to `text-2xl font-serif font-light tracking-tight`

- [ ] **Step 2: Update login/LoginForm.tsx**

Change `rounded-lg` to `rounded-md` on:
- The input element
- The submit button

- [ ] **Step 3: Commit**

```bash
cd dashboards/open-brain-dashboard-next && git add app/login/page.tsx app/login/LoginForm.tsx && git commit -m "[dashboards] Login page: Brain icon, Noto Serif heading, 6px button radius"
```

---

### Task 10: Update form components

**Files:**
- Modify: `dashboards/open-brain-dashboard-next/components/SearchBar.tsx`
- Modify: `dashboards/open-brain-dashboard-next/components/AddToBrain.tsx`
- Modify: `dashboards/open-brain-dashboard-next/components/ThoughtEditor.tsx`
- Modify: `dashboards/open-brain-dashboard-next/components/ThoughtsFilter.tsx`

These all need the same pattern: `rounded-lg` to `rounded-md` on buttons and inputs, `rounded-lg` to `rounded-xl` on cards/panels.

- [ ] **Step 1: Update SearchBar.tsx**

- Input: `rounded-lg` change to `rounded-md`
- Button: `rounded-lg` change to `rounded-md`

- [ ] **Step 2: Update AddToBrain.tsx**

- Textarea: `rounded-lg` change to `rounded-md`
- Submit button: `rounded-lg` change to `rounded-md`
- Mode selector buttons: `rounded-lg` change to `rounded-md`
- Job detail container card (`bg-bg-surface border border-border rounded-lg p-4`): change `rounded-lg` to `rounded-xl`
- Inner item cards (`border border-border rounded-md p-3`): keep `rounded-md` (correct)
- Execute button: `rounded-lg` change to `rounded-md`

- [ ] **Step 3: Update ThoughtEditor.tsx**

- Content display card: `rounded-lg` change to `rounded-xl`
- Edit form card: `rounded-lg` change to `rounded-xl`
- Textarea: `rounded-lg` change to `rounded-md`
- Select elements: `rounded-lg` change to `rounded-md`
- Save/Cancel buttons: `rounded-lg` change to `rounded-md`

- [ ] **Step 4: Update ThoughtsFilter.tsx**

- Filter container card: `rounded-lg` change to `rounded-xl`
- Select elements: `rounded-lg` change to `rounded-md`
- Input: `rounded-lg` change to `rounded-md`

- [ ] **Step 5: Commit**

```bash
cd dashboards/open-brain-dashboard-next && git add components/SearchBar.tsx components/AddToBrain.tsx components/ThoughtEditor.tsx components/ThoughtsFilter.tsx && git commit -m "[dashboards] Form components: 6px radius on inputs/buttons, 12px on cards"
```

---

### Task 11: Update remaining components

**Files:**
- Modify: `dashboards/open-brain-dashboard-next/components/DeleteModal.tsx`
- Modify: `dashboards/open-brain-dashboard-next/components/ReflectionComposer.tsx`
- Modify: `dashboards/open-brain-dashboard-next/components/ConnectionsPanel.tsx`
- Modify: `dashboards/open-brain-dashboard-next/components/ThoughtDeleteButton.tsx`
- Modify: `dashboards/open-brain-dashboard-next/components/RestrictedToggle.tsx`

- [ ] **Step 1: Update DeleteModal.tsx**

- Modal panel: `rounded-xl` stays correct (12px)
- Cancel button: `rounded-lg` change to `rounded-md`
- Delete button: `rounded-lg` change to `rounded-md`

- [ ] **Step 2: Update ReflectionComposer.tsx**

- Form card: `rounded-lg` change to `rounded-xl`
- All inputs, selects, textareas: `rounded-lg` change to `rounded-md`
- Save/Cancel buttons: `rounded-lg` change to `rounded-md`
- Error text `text-red-400` change to `text-danger` (line ~279)
- Remove buttons `hover:text-red-400` change to `hover:text-danger`

- [ ] **Step 3: Update ConnectionsPanel.tsx**

- Outer panel: `rounded-lg` change to `rounded-xl`
- Inner connection link items: keep `rounded-lg` (these are small nested clickable items)

- [ ] **Step 4: Update ThoughtDeleteButton.tsx**

- Delete button: `rounded-lg` change to `rounded-md`

- [ ] **Step 5: Update RestrictedToggle.tsx**

1. Add import at top: `import { Lock, LockOpen } from "lucide-react";`

2. Replace the unlocked SVG block (the one inside the `unlocked ?` branch) with:
   `<LockOpen className="w-4 h-4 text-warning" strokeWidth={1.5} />`

3. Replace the locked SVG block (the one inside the `:` branch) with:
   `<Lock className="w-4 h-4 text-text-muted" strokeWidth={1.5} />`

4. Modal card `rounded-xl`: stays correct
5. Input: `rounded-lg` change to `rounded-md`
6. Unlock button: `rounded-lg` change to `rounded-md`
7. Toggle button: `rounded-lg` change to `rounded-md`

- [ ] **Step 6: Commit**

```bash
cd dashboards/open-brain-dashboard-next && git add components/DeleteModal.tsx components/ReflectionComposer.tsx components/ConnectionsPanel.tsx components/ThoughtDeleteButton.tsx components/RestrictedToggle.tsx && git commit -m "[dashboards] Remaining components: border-radius fixes, Lucide lock icons, error color tokens"
```

---

### Task 12: Build verification

**Files:** None (verification only)

- [ ] **Step 1: Run the build**

```bash
cd dashboards/open-brain-dashboard-next && npm run build
```

Expected: Build succeeds with no errors. Warnings about unused variables are acceptable but there should be no TypeScript errors or missing imports.

- [ ] **Step 2: Check for remaining violet references**

```bash
cd dashboards/open-brain-dashboard-next
grep -r 'violet' --include='*.tsx' --include='*.css' . | grep -v node_modules | grep -v '.next'
```

Expected: Zero results.

- [ ] **Step 3: Check for hardcoded colors that should use tokens**

```bash
cd dashboards/open-brain-dashboard-next
grep -rn '#000\b\|#fff\b\|#ffffff\|#000000\|bg-black\|text-black' --include='*.tsx' . | grep -v node_modules | grep -v '.next'
```

Review results: `text-white` on Brain icon and buttons is intentional (white on purple). `bg-black/60` on modal overlays is acceptable. Flag anything else.

- [ ] **Step 4: Start dev server and visual check**

```bash
cd dashboards/open-brain-dashboard-next && npm run dev
```

Open `http://localhost:3000` and verify:
1. Light mode: cream background, white cards, Noto Serif headings, purple accent
2. Dark mode toggle works in sidebar, no flash on reload
3. Login page shows brain icon, centered layout
4. Sidebar nav icons are Lucide, brain logo in header
5. Type badges have correct colors in both light and dark modes
6. All inputs and buttons use 6px radius, all cards use 12px radius

- [ ] **Step 5: Final commit if any fixes needed**

If the visual check reveals issues, fix them and commit:

```bash
cd dashboards/open-brain-dashboard-next && git add -A && git commit -m "[dashboards] Fix visual issues found during verification"
```
