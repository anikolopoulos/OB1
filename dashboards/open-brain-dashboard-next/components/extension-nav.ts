import {
  Clock,
  Folder,
  Plug,
  Sparkles,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { EXTENSIONS, type ExtensionIcon } from "@/extensions.config";

export type NavItem = { href: string; label: string; icon: LucideIcon };

// Single icon registry extensions resolve against — keyed by the string
// names used in extensions.config.ts (which stays JSX/icon-free plain data).
// Shared by Sidebar and BottomNav so the two can never drift.
const EXTENSION_ICONS: Record<ExtensionIcon, LucideIcon> = {
  clock: Clock,
  folder: Folder,
  plug: Plug,
  sparkles: Sparkles,
};

/**
 * Resolve the extension registry into nav items. An unknown icon key can't
 * pass type-checking today, but if one ever slips through (union widened
 * with a cast, build with errors ignored), a missing icon must degrade to
 * a logged fallback — not an "Element type is invalid" crash that takes
 * down every route via the root layout.
 */
export function extensionNavItems(): NavItem[] {
  return EXTENSIONS.map((e) => {
    const icon = EXTENSION_ICONS[e.icon];
    if (!icon) {
      console.error(
        `[extensions] Unknown icon "${e.icon}" for ${e.href}; using fallback`
      );
    }
    return { href: e.href, label: e.label, icon: icon ?? Plug };
  });
}
