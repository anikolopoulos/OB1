# Dashboard Design Review — Leadetic-Themed Restyle

**Date:** 2026-04-10
**Status:** Approved
**Scope:** Full retheme of `dashboards/open-brain-dashboard-next/` with Leadetic visual identity and dark mode support

## Summary

Apply the Leadetic visual style guide to the Open Brain dashboard while keeping the Open Brain identity (name, brain icon logo mark). Add light/dark mode toggle with light as default. Use Tailwind CSS v4 `dark:` variant with CSS custom properties.

## Decisions

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Branding depth | Leadetic-themed, OB identity | Keep Open Brain name + brain icon; use Leadetic colors, typography, spacing, icons |
| Default mode | Light (cream) | Aligns with Leadetic's primary aesthetic. Respects `prefers-color-scheme` on first visit |
| Dark mode tech | Tailwind `dark:` + CSS variables | Two sets of variables in `globals.css`, `.dark` class on `<html>`, `dark:` prefix for per-component overrides |
| Approach | Full retheme in one pass | ~15-20 files, mostly mechanical changes. One cohesive PR. |

## Color System

### Light Mode (Default)

| Token | Hex | Usage |
|-------|-----|-------|
| `--color-bg-primary` | `#faf9f5` | Page background (Cream) |
| `--color-bg-surface` | `#ffffff` | Cards, sidebar, elevated panels |
| `--color-bg-elevated` | `#faf9f5` | Input fields on white cards (recessed depth) |
| `--color-bg-hover` | `#f0efeb` | Hover state for interactive elements |
| `--color-border` | `#e8e7e9` | Card borders, dividers |
| `--color-border-subtle` | `#f0efeb` | Subtle separators |
| `--color-text-primary` | `#061923` | Headings, body text (Dark) |
| `--color-text-secondary` | `#a3a0a6` | Descriptions, labels (Mid Gray) |
| `--color-text-muted` | `#c0bec3` | Placeholder text, metadata (lighter than secondary) |
| `--color-purple` | `#8257a3` | Primary CTAs, links, active states |
| `--color-purple-dim` | `#6d4590` | Hover state for purple elements |
| `--color-purple-glow` | `rgba(130, 87, 163, 0.15)` | Selection highlight |
| `--color-purple-surface` | `rgba(130, 87, 163, 0.08)` | Active nav background |
| `--color-success` | `#699595` | Success states (Teal) |
| `--color-warning` | `#fdbf14` | Warning, highlights (Gold) |
| `--color-danger` | `#dc2626` | Error, delete actions |
| `--color-info` | `#2563eb` | Info states |

### Dark Mode

| Token | Hex | Usage |
|-------|-----|-------|
| `--color-bg-primary` | `#061923` | Page background (Dark) |
| `--color-bg-surface` | `#0d2633` | Cards, sidebar |
| `--color-bg-elevated` | `#143040` | Input fields, nested surfaces |
| `--color-bg-hover` | `#1a3a4d` | Hover state |
| `--color-border` | `#1a2f3d` | Card borders, dividers |
| `--color-border-subtle` | `#142430` | Subtle separators |
| `--color-text-primary` | `#faf9f5` | Headings, body text (Cream) |
| `--color-text-secondary` | `#5a7a8a` | Descriptions, labels |
| `--color-text-muted` | `#3d5a68` | Placeholder text, metadata (subtler than secondary) |
| `--color-purple` | `#8257a3` | Same as light — primary accent |
| `--color-purple-dim` | `#6d4590` | Hover state |
| `--color-purple-glow` | `rgba(130, 87, 163, 0.25)` | Selection highlight (slightly stronger) |
| `--color-purple-surface` | `rgba(130, 87, 163, 0.15)` | Active nav background (slightly stronger) |
| `--color-success` | `#82b0b0` | Success states (lighter teal) |
| `--color-warning` | `#fdbf14` | Warning, highlights (Gold — same) |
| `--color-danger` | `#f87171` | Error states (lighter red) |
| `--color-info` | `#60a5fa` | Info states (lighter blue) |

## Typography

### Font Loading

Replace Geist Sans/Mono with Noto Serif + Inter via `next/font/google` in `layout.tsx`. Keep Geist Mono for monospace.

```tsx
import { Noto_Serif, Inter, Geist_Mono } from "next/font/google";

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
```

### Font Mapping

| Element | Font | Weight | Class |
|---------|------|--------|-------|
| H1 (page titles) | Noto Serif | 300 (Light) | `font-serif font-light` |
| H2 (section headings like "Recent Activity") | Noto Serif | 300 (Light) | `font-serif font-light` |
| H3+ (subsections) | Inter | 500 (Medium) | `font-sans font-medium` |
| Body text | Inter | 300 (Light) | `font-sans font-light` |
| Bold body / buttons | Inter | 500 (Medium) | `font-sans font-medium` |
| Labels (uppercase) | Inter | 500 (Medium) | `font-sans font-medium uppercase tracking-wider` |
| Monospace (IDs, code) | Geist Mono | — | `font-mono` |

### Key Rules

- Noto Serif: ONLY H1 and H2. ONLY weight 300. Never bold. Never for H3 or below.
- Inter body text: weight 300 (Light), NOT 400 (Regular).
- Large display headings (H1 at 28px+): `tracking-tight` (letter-spacing: -0.02em).

## Layout

No structural changes to the sidebar + main content layout. Changes are cosmetic:

- **Sidebar:** White surface (`bg-surface`) on cream page (`bg-primary`) in light. Surface on dark in dark mode. Fixed left, `w-56`, `border-r border-border`.
- **Main content:** `flex-1 ml-56`, `max-w-6xl mx-auto px-8 py-8` — unchanged.
- **Login page:** Centered vertically/horizontally, no sidebar. Brain icon at 56px on 12px rounded purple square.

## Sidebar Changes

### Logo Mark

Replace the `OB` text avatar with a Lucide `Brain` icon:

```tsx
import { Brain } from "lucide-react";

<div className="w-8 h-8 rounded-lg bg-purple flex items-center justify-center">
  <Brain className="w-[18px] h-[18px] text-white" strokeWidth={1.5} />
</div>
```

### Nav Icons (Lucide)

| Page | Lucide Icon | Import |
|------|-------------|--------|
| Dashboard | `LayoutDashboard` | `lucide-react` |
| Thoughts | `FileText` | `lucide-react` |
| Search | `Search` | `lucide-react` |
| Audit | `ShieldCheck` | `lucide-react` |
| Duplicates | `Copy` | `lucide-react` |
| Add | `PlusCircle` | `lucide-react` |

All icons: `w-[18px] h-[18px]`, `strokeWidth={1.5}`.
Active color: `text-purple`. Inactive color: `text-text-secondary`.

### Dark Mode Toggle

New `ThemeToggle` client component in sidebar footer, above the "Signed in as" section:

- Moon icon (`Moon` from Lucide) + "Dark mode" label in light mode
- Sun icon (`Sun` from Lucide) + "Light mode" label in dark mode
- Toggle switch: gray track (light), purple track (dark)
- Toggles `.dark` class on `<html>` element
- Persists to `localStorage.theme`

## Dark Mode — No-Flash Strategy

Inline script in `<head>` of `layout.tsx`, executed before first paint:

1. Read `localStorage.getItem('theme')`
2. If `'dark'` → add `.dark` to `document.documentElement`
3. If `'light'` → do nothing (light is default)
4. If absent → check `window.matchMedia('(prefers-color-scheme: dark)').matches` → add `.dark` if true

This prevents the white-to-dark flash on page load. The script must be inline in `<head>`, not a module import.

### CSS Structure in globals.css

```css
@import "tailwindcss";

@theme inline {
  /* Light mode values (default) */
  --color-bg-primary: #faf9f5;
  --color-bg-surface: #ffffff;
  /* ... all light tokens ... */
  --font-serif: var(--font-noto-serif), Georgia, serif;
  --font-sans: var(--font-inter), system-ui, sans-serif;
  --font-mono: var(--font-geist-mono), monospace;
}

/* Dark mode overrides */
.dark {
  --color-bg-primary: #061923;
  --color-bg-surface: #0d2633;
  /* ... all dark tokens ... */
}
```

Tailwind's `dark:` variant is used only where variable swaps aren't sufficient (e.g., badge colors that need different opacities).

## Type Badge Colors

### Mapping

| Type | Light | Dark |
|------|-------|------|
| `idea` | gold bg/border, dark gold text | gold bg/border, gold text |
| `task` | blue bg/border, blue text | blue bg/border, light blue text |
| `person_note` | teal bg/border, dark teal text | teal bg/border, light teal text |
| `reference` | gray bg/border, dark gray text | gray bg/border, mid gray text |
| `decision` | purple bg/border, purple text | purple bg/border, light purple text |
| `lesson` | orange bg/border, dark orange text | orange bg/border, orange text |
| `meeting` | teal bg/border, teal text | teal bg/border, light teal text |
| `journal` | pink bg/border, dark pink text | pink bg/border, light pink text |

All badges: `px-2 py-0.5 rounded text-xs font-medium border`. Border radius: 6px.

## Buttons

| Type | Light | Dark |
|------|-------|------|
| Primary | `bg-purple text-white` | Same |
| Outline | `border-2 border-purple text-purple` | `border-purple/50 text-purple-light` |
| Secondary | `bg-[#e8e7e9] text-text-primary` | `bg-bg-elevated text-text-primary` |
| Ghost | `text-text-secondary` | Same |

All buttons: `rounded-md` (6px), `font-medium`, `text-sm`, padding `py-2.5 px-5`.

## Spacing

Adopt base-8 spacing where current values are arbitrary:
- Card gaps: `gap-4` (16px)
- Section gaps: `space-y-8` (32px)
- Card internal padding: `p-5` (20px)
- Page padding: `px-8 py-8` (32px) — already correct
- CTA padding: `py-2.5 px-5` (10px/20px) or `py-2.5 px-8` (10px/32px) for large

## Border Radius

- Small elements (buttons, inputs, badges): `rounded-md` (6px)
- Cards, panels: `rounded-xl` (12px)

Note: Tailwind v4 default `rounded-md` = 6px, `rounded-xl` = 12px. This aligns with Leadetic's spec without custom config.

## Dependencies

### Add

- `lucide-react` — Lucide icon library (only approved icon source per style guide)

### Remove

- `Geist` font import (keep `Geist_Mono`)

### No Change

- `tailwindcss` v4 — already installed
- `@tailwindcss/postcss` — already configured
- `next` / `react` — no version changes needed

## Files to Modify

| File | Changes |
|------|---------|
| `package.json` | Add `lucide-react` dependency |
| `app/globals.css` | Replace all color variables with Leadetic light defaults; add `.dark {}` block; update font variables |
| `app/layout.tsx` | Swap font imports (Noto Serif + Inter); add no-flash script in `<head>`; add `dark` class logic to `<html>` |
| `app/page.tsx` | Update heading classes to `font-serif font-light`; adjust spacing to base-8 |
| `app/login/page.tsx` | Update heading classes; brain icon; adjust colors |
| `app/login/LoginForm.tsx` | Update input/button classes for new tokens |
| `app/thoughts/page.tsx` | Update heading, table header classes |
| `app/thoughts/[id]/page.tsx` | Update heading, metadata panel classes |
| `app/search/page.tsx` | Update heading classes |
| `app/duplicates/page.tsx` | Update heading classes |
| `app/ingest/page.tsx` | Update heading classes |
| `app/audit/page.tsx` | Update heading classes |
| `components/Sidebar.tsx` | Brain icon, Lucide nav icons, ThemeToggle component, remove inline SVG functions |
| `components/StatsWidget.tsx` | Update card classes (rounded-xl, font adjustments) |
| `components/ThoughtCard.tsx` | Update badge colors to Leadetic mapping; card border-radius to 12px |
| `components/SearchBar.tsx` | Update input/button classes |
| `components/AddToBrain.tsx` | Update textarea, button classes |
| `components/ThoughtEditor.tsx` | Update classes for new tokens |
| `components/DeleteModal.tsx` | Update button/modal classes |
| `components/ReflectionComposer.tsx` | Update classes |
| `components/ConnectionsPanel.tsx` | Update classes |
| `components/ThemeToggle.tsx` | **New file** — dark mode toggle client component |

## Out of Scope

- No structural layout changes (sidebar width, page max-width, routing)
- No new features or functionality changes
- No changes to API routes, middleware, or auth logic
- No shadcn/ui migration — components remain custom
- No three-dot decorative element (Open Brain identity, not Leadetic-branded product)
- No Leadetic logo usage
