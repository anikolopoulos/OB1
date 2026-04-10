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
