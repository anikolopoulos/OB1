# Dashboard Extensions

The Open Brain dashboard supports drop-in extensions that add a new route
and a sidebar entry **without modifying any core dashboard file**.

## Anatomy

An extension is:

1. A folder under `app/<route>/` containing one or more `page.tsx` files
   (Next.js App Router conventions apply). The folder name becomes the URL.
2. One entry in `extensions.config.ts` adding a sidebar nav item.

That's it. Extensions own their own API helpers (live in the extension
folder, not `lib/api.ts`) and their own types.

## Minimal example

```
app/
  hello/
    page.tsx          ← extension page
    api.ts             ← extension's own data layer (optional)
```

```ts
// extensions.config.ts
export const EXTENSIONS: ExtensionNavEntry[] = [
  { href: "/hello", label: "Hello", icon: "sparkles" },
];
```

`page.tsx` imports its own helpers from `./api` (or wherever), and the
extension is live after `npm run build` and a redeploy (see the
"Deploy Dashboard" section of `CLAUDE.md`).

## Auth

Extension pages use the same session helpers as core pages:

```tsx
import { requireSessionOrRedirect } from "@/lib/auth";

export default async function Page() {
  const { apiKey } = await requireSessionOrRedirect();
  // ...
}
```

`apiKey` is the brain's access key the user logged in with — pass it as the
`x-brain-key` header when calling the backend (see `lib/api.ts`'s
`apiFetch` helper, which extension code can also import directly).

## Backend routes

Extensions that need their own REST endpoints have two clean options:

- **Sidecar service.** Point the extension at a separate backend URL
  (its own env var), following the pattern in `lib/api.ts`.
- **Add routes to the existing `/api/*` surface** in `deploy/app/src/rest/`.
  Acceptable when the data lives in a table that's tightly coupled to the
  brain's core schema (see the Extension System section of `CLAUDE.md`).

## Icon registry

Extensions reference icons by string name because `extensions.config.ts`
is plain TypeScript (no JSX). Supported keys are declared in
`extensions.config.ts` as `ExtensionIcon`. To add a new icon:

1. Add the key to the `ExtensionIcon` union.
2. Import the matching `lucide-react` icon in
   `components/extension-nav.ts` and map the key in its
   `EXTENSION_ICONS` record.

That single module feeds both the sidebar and the mobile "More" menu,
so there is exactly one place to edit. An unmapped key degrades to a
logged fallback icon rather than crashing the nav. Hrefs are validated
at load time — they must start with `/` and must not be `/` itself.

## Position in the sidebar

Extensions render in declaration order, between the core nav items
(Dashboard, Thoughts, Workflow, Search, Audit, Duplicates) and the
trailing "Add" entry. On mobile, extensions also appear in the
`BottomNav` "More" popover, after the core overflow items.

Note: this fork does not ship an "Agent Memory" nav entry — its backend
is not deployed here. Do not register it as an extension.

## Versioning

The extension contract is small (one config file, one folder layout
convention) so it's intentionally not versioned. Breaking changes — if
ever — would surface as TypeScript errors in `extensions.config.ts`,
which is the right place to catch them.
