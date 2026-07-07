import { NextRequest, NextResponse } from "next/server";
import {
  fetchIngestionJobs,
  triggerIngest,
  captureThought,
} from "@/lib/api";
import { requireSession, AuthError } from "@/lib/auth";
import { shouldExtract } from "@/lib/ingest-routing";

const VALID_MODES = ["auto", "single", "extract"] as const;
type IngestMode = (typeof VALID_MODES)[number];

// ── GET — list ingestion jobs ───────────────────────────────────────────────

export async function GET() {
  let apiKey: string;
  try {
    ({ apiKey } = await requireSession());
  } catch (err) {
    if (err instanceof AuthError)
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    throw err;
  }

  try {
    const jobs = await fetchIngestionJobs(apiKey);
    return NextResponse.json(jobs);
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed" },
      { status: 500 }
    );
  }
}

// ── POST — unified Add to Brain ─────────────────────────────────────────────

export async function POST(request: NextRequest) {
  let apiKey: string;
  try {
    ({ apiKey } = await requireSession());
  } catch (err) {
    if (err instanceof AuthError)
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    throw err;
  }

  try {
    const body = await request.json();
    const { text, mode = "auto", dry_run } = body as {
      text: string;
      mode?: IngestMode;
      dry_run?: boolean;
    };

    if (!(VALID_MODES as readonly string[]).includes(mode)) {
      return NextResponse.json(
        { error: `Invalid mode: ${String(mode)}` },
        { status: 400 }
      );
    }

    if (!text?.trim()) {
      return NextResponse.json(
        { error: "Text is required" },
        { status: 400 }
      );
    }

    // The single-capture path writes immediately and has no dry-run support —
    // an explicit single+dry_run request is a contradiction we must not
    // resolve silently with a real write.
    if (mode === "single" && dry_run) {
      return NextResponse.json(
        { error: "dry_run is not supported for single-thought capture" },
        { status: 400 }
      );
    }

    const trimmed = text.trim();

    // Resolve "auto" to a concrete path; explicit modes pass through.
    // dry_run forces extraction: only the smart-ingest path can preview.
    let resolvedMode: "single" | "extract";
    if (mode === "auto") {
      resolvedMode = dry_run || shouldExtract(trimmed) ? "extract" : "single";
      console.log(
        `[ingest] auto-routed to ${resolvedMode} (len=${trimmed.length}${dry_run ? ", dry_run" : ""})`
      );
    } else {
      resolvedMode = mode;
    }

    if (resolvedMode === "single") {
      const result = await captureThought(apiKey, trimmed);
      return NextResponse.json({
        path: "single" as const,
        requested_mode: mode,
        thought_id: result.thought_id,
        type: result.type,
        message: "Saved as 1 thought",
      });
    }

    // extract path → smart-ingest
    const result = await triggerIngest(apiKey, trimmed, { dry_run });
    const extracted =
      (result as Record<string, unknown>).extracted_count ?? null;
    const isDryRun = result.status === "dry_run_complete";
    return NextResponse.json({
      path: "extract" as const,
      requested_mode: mode,
      job_id: result.job_id,
      status: result.status,
      extracted_count: extracted,
      message: isDryRun
        ? `Extracted ${extracted ?? "?"} candidate thoughts (dry run)`
        : `Extracted thoughts from your input`,
    });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed" },
      { status: 500 }
    );
  }
}
