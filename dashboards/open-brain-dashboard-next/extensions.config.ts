/**
 * Dashboard Extension Registry
 * ============================
 *
 * Drop-in extensions register here. Each entry adds one nav item to the
 * sidebar, in declaration order, between the core nav and the trailing
 * "Add" entry. Extension pages live under `app/<route>/` and may declare
 * their own local helpers — no other dashboard file needs to change.
 *
 * To install an extension:
 *   1. Drop its `app/<route>/` folder into the dashboard
 *   2. Add one entry below
 *   3. `npm run build`, then deploy per README.md
 *
 * To uninstall, remove both. No other file is touched.
 *
 * See EXTENSIONS.md for the full convention.
 *
 * Note: the "Agent Memory" nav entry was intentionally removed (its
 * backend is not deployed on this fork). Do not add it back here.
 */

export type ExtensionIcon = "clock" | "folder" | "plug" | "sparkles";

export interface ExtensionNavEntry {
  /** Route the extension owns, e.g. "/sessions". */
  href: string;
  /** Sidebar label. */
  label: string;
  /** Icon key resolved against the registry in components/extension-nav.ts. */
  icon: ExtensionIcon;
}

export const EXTENSIONS: ExtensionNavEntry[] = [];

// Fail fast at module load: a malformed href (empty, relative, or "/")
// would otherwise only surface as a subtle nav-highlighting glitch —
// pathname.startsWith("") is true everywhere.
for (const e of EXTENSIONS) {
  if (!e.href.startsWith("/") || e.href === "/") {
    throw new Error(
      `[extensions] Invalid href "${e.href}" for "${e.label}" — must start with "/" and not be "/"`
    );
  }
}
