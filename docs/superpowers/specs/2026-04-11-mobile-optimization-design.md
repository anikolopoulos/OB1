# Mobile Optimization — Open Brain Dashboard

**Date:** 2026-04-11
**Status:** Approved
**Scope:** Full mobile parity for all 8 dashboard pages

## Context

The Open Brain dashboard (`dashboards/open-brain-dashboard-next/`) is desktop-only. The sidebar is fixed at 224px (`w-56`), content has a hardcoded `ml-56` margin, tables assume wide viewports, and there are no responsive breakpoints beyond a single `md:grid-cols-3` on StatsWidget. The mobile experience is broken — sidebar overlaps content, tables overflow, and touch targets are too small.

This spec makes every feature work on phones and tablets using Tailwind CSS v4 responsive utilities. No new dependencies. No new design system. Pure CSS adaptation.

## Breakpoint Strategy

Single `md:` (768px) breakpoint as the mobile/desktop dividing line. Below 768px = mobile layout. At and above 768px = current desktop layout, unchanged.

## 1. Navigation

### Desktop (unchanged)
Fixed sidebar (`w-56`, `fixed left-0 top-0 h-screen`) with 6 nav links + settings.

### Mobile: Bottom Tab Bar
New `components/BottomNav.tsx` — fixed to bottom, shown only below `md:` via `md:hidden`.

**5 tabs:**
| Tab | Icon | Route |
|-----|------|-------|
| Dashboard | LayoutDashboard | `/` |
| Thoughts | FileText | `/thoughts` |
| Search | Search | `/search` |
| Add | PlusCircle | `/ingest` |
| More | MoreHorizontal | popover |

**More popover contents:**
- Audit link
- Duplicates link
- ThemeToggle
- RestrictedToggle
- Signed-in name + Sign out

**Implementation:**
- `"use client"` component with `usePathname()` for active state
- More popover: local `useState` toggle, renders absolutely-positioned panel above the tab
- Click-outside dismissal via backdrop overlay
- iOS safe area: `pb-[env(safe-area-inset-bottom)]` on the nav container
- Hidden on `/login` route (same as Sidebar)

### Layout Changes (`app/layout.tsx`)
```
Sidebar:     hidden md:flex (was: always visible)
BottomNav:   md:hidden (new)
<main>:      ml-0 md:ml-56 (was: ml-56)
Content div: px-4 md:px-8 py-6 md:py-8 (was: px-8 py-8)
             pb-20 md:pb-0 (bottom padding for nav bar)
```

### Sidebar Changes (`components/Sidebar.tsx`)
- Add `hidden md:flex` to the `<aside>` element — no other changes

## 2. Tables → Card Stacks

### Thoughts List (`app/thoughts/page.tsx`)
- Desktop: current `<table>` wrapped in `hidden md:block` — unchanged
- Mobile: new `<div>` card stack wrapped in `md:hidden`
- Same `data.data` array, two layouts — no fetch logic duplication
- Each card: content text on top, footer row with TypeBadge + importance + date
- Entire card is a tappable `<Link>` to `/thoughts/[id]`

### Audit (`app/audit/page.tsx`)
- Same dual-rendering pattern as Thoughts
- Mobile cards include checkbox, content preview, TypeBadge, quality score
- Select-all checkbox at top of card stack

### Filters (`components/ThoughtsFilter.tsx`)
- `flex-col md:flex-row` to stack filter dropdowns vertically on mobile

## 3. Page-Specific Adaptations

### Dashboard (`app/page.tsx`)
- Hide AddToBrain section on mobile: `hidden md:block` (accessible via Add tab)
- StatsWidget already has `grid-cols-1 md:grid-cols-3` — no change needed

### Duplicates (`app/duplicates/page.tsx`)
- Side-by-side grid: `grid-cols-1 md:grid-cols-2` (was: `grid-cols-2`)
- Header controls (threshold select, batch toolbar): `flex-col md:flex-row gap-3`

### Search (`app/search/page.tsx`)
- Search mode radio toggle: stack vertically on mobile
- Result cards (ThoughtCard) already single-column — no change

### Thought Detail (`app/thoughts/[id]/page.tsx`)
- Already single-column layout
- Ensure inputs/buttons meet touch target minimums

### Ingest (`app/ingest/page.tsx`)
- AddToBrain works at any width
- Job history list already single-column

### Login (`app/login/page.tsx`)
- Already centered single-column
- Add side padding for mobile breathing room

## 4. Touch Targets

All interactive elements get minimum 44px height on mobile:

| Element | Current | Fix |
|---------|---------|-----|
| Pagination buttons | `py-1.5` (~32px) | `min-h-[44px]` on mobile |
| Filter dropdowns | `py-1.5` (~32px) | `min-h-[44px]` on mobile |
| Keep This / Delete buttons | `py-1` (~28px) | `min-h-[44px]` on mobile |
| Checkboxes | ~16px | Wrap in padded 44px tap area |

## 5. Modal Adaptation (`components/DeleteModal.tsx`)

### Desktop (unchanged)
Centered overlay with `max-w-md`, backdrop blur.

### Mobile: Bottom Sheet
- Container: `fixed inset-x-0 bottom-0 md:inset-0 md:flex md:items-center md:justify-center`
- Panel: `rounded-t-xl md:rounded-xl` with full-width, bottom-anchored
- Drag handle indicator at top (visual cue, not functional)
- Buttons: stacked vertically (`flex-col md:flex-row`) with full-width, `min-h-[44px]`
- iOS safe area bottom padding

## File Change Summary

| File | Type | Description |
|------|------|-------------|
| `components/BottomNav.tsx` | NEW | Bottom tab bar + More popover |
| `app/layout.tsx` | MODIFY | Add BottomNav, responsive ml/px/pb |
| `components/Sidebar.tsx` | MODIFY | Add `hidden md:flex` |
| `app/page.tsx` | MODIFY | Hide AddToBrain on mobile |
| `app/thoughts/page.tsx` | MODIFY | Add mobile card stack |
| `app/audit/page.tsx` | MODIFY | Add mobile card stack with checkboxes |
| `app/duplicates/page.tsx` | MODIFY | `grid-cols-1 md:grid-cols-2`, stack header |
| `components/ThoughtsFilter.tsx` | MODIFY | `flex-col md:flex-row` |
| `components/DeleteModal.tsx` | MODIFY | Bottom sheet on mobile |
| `app/search/page.tsx` | MODIFY | Stack search mode toggle |

**1 new file, 9 modified files, 0 new dependencies.**

## Verification

1. Start the dev server: `cd dashboards/open-brain-dashboard-next && npm run dev`
2. Open browser DevTools → toggle device toolbar (responsive mode)
3. Test at 375px (iPhone SE), 390px (iPhone 14), 768px (iPad), 1440px (desktop)
4. For each viewport, verify:
   - **Navigation**: Bottom tabs visible on mobile, sidebar visible on desktop
   - **More popover**: Opens/closes correctly, all links and toggles work
   - **Dashboard**: Stats stack, AddToBrain hidden on mobile
   - **Thoughts**: Card stack on mobile, table on desktop
   - **Audit**: Card stack with working checkboxes, bulk delete
   - **Duplicates**: Stacked vertical on mobile, side-by-side on desktop
   - **Search**: Radio toggle stacks, results render
   - **Modals**: Bottom sheet on mobile, centered on desktop
   - **Touch targets**: All buttons/inputs ≥ 44px on mobile
   - **Dark mode**: Both themes work at all viewports
   - **Login page**: No bottom nav, no sidebar, centered form
5. Test on a real phone if available (or use `ngrok` to tunnel the dev server)
