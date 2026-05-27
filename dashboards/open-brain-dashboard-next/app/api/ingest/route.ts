import { NextRequest, NextResponse } from "next/server";
import {
  fetchIngestionJobs,
  triggerIngest,
  captureThought,
} from "@/lib/api";
import { requireSession, AuthError } from "@/lib/auth";

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
      mode?: "auto" | "single" | "extract";
      dry_run?: boolean;
    };

    if (!text?.trim()) {
      return NextResponse.json(
        { error: "Text is required" },
        { status: 400 }
      );
    }

    const trimmed = text.trim();

    // "single" mode is only used when explicitly requested — auto always
    // goes through extraction so the LLM can split multi-fact inputs and
    // dry_run works correctly.
    if (mode === "single") {
      const result = await captureThought(apiKey, trimmed);
      return NextResponse.json({
        path: "single" as const,
        thought_id: result.thought_id,
        type: result.type,
        message: "Saved as 1 thought",
      });
    }

    // auto and extract both go through smart-ingest
    const result = await triggerIngest(apiKey, trimmed, { dry_run });
    const extracted =
      (result as Record<string, unknown>).extracted_count ?? null;
    const isDryRun = result.status === "dry_run_complete";
    return NextResponse.json({
      path: "extract" as const,
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
