import { NextResponse } from "next/server";
import { env } from "@/lib/env";
import { runDialer } from "@/lib/dialer";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

// Called every few minutes by the scheduler (Vercel Cron or Supabase pg_cron),
// which sends `Authorization: Bearer <CRON_SECRET>`.
export async function GET(request: Request) {
  if (!env.cronSecret || request.headers.get("authorization") !== `Bearer ${env.cronSecret}`) {
    return NextResponse.json({ error: "Not allowed" }, { status: 401 });
  }
  try {
    return NextResponse.json(await runDialer());
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 500 });
  }
}

export const POST = GET;
