/**
 * Determines whether input text should be routed to smart-ingest extraction
 * (multiple thoughts) rather than single-thought capture.
 *
 * Heuristic rules (any match → extract):
 *  1. Long text (> 500 chars)
 *  2. Multiple paragraphs (2+)
 *  3. Bullet or numbered lists (2+ items)
 *  4. Transcript/speaker markers (2+ lines like "Alan: ...")
 *  5. Timestamp patterns (e.g. "10:32 AM")
 *  6. Email-style headers (From:, Subject:, Date:, To:)
 */
export function shouldExtract(text: string): boolean {
  if (text.length > 500) return true;

  const paragraphs = text.split(/\n\s*\n/).filter((p) => p.trim());
  if (paragraphs.length >= 2) return true;

  const lines = text.split("\n");
  const bulletLines = lines.filter((l) =>
    /^\s*[-*•]\s|^\s*\d+[.)]\s/.test(l)
  );
  if (bulletLines.length >= 2) return true;

  const speakerLines = lines.filter((l) => /^\s*\w+:\s/.test(l));
  if (speakerLines.length >= 2) return true;

  if (/\d{1,2}:\d{2}\s*(AM|PM)?/i.test(text)) return true;

  if (/^(From|Subject|Date|To):\s/m.test(text)) return true;

  return false;
}
