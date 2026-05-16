import { NextRequest, NextResponse } from "next/server";
import { processCampaignQueue } from "@/lib/scheduler";

// This endpoint processes the campaign queue.
// Call it via:
// - Vercel Cron: configure in vercel.json
// - External cron service (e.g. cron-job.org)
// - Manual trigger from the dashboard
//
// Protected by CRON_SECRET environment variable.

export async function GET(req: NextRequest) {
  // Verify cron secret to prevent unauthorized access
  const authHeader = req.headers.get("authorization");
  const cronSecret = process.env.CRON_SECRET;

  if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const result = await processCampaignQueue();
    return NextResponse.json({
      ok: true,
      timestamp: new Date().toISOString(),
      ...result,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}

// Also support POST for manual triggers from the UI
export async function POST(req: NextRequest) {
  return GET(req);
}
