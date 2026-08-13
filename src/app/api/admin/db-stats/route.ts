import { NextResponse } from "next/server";
import { getDBStats, purgeOldArticles } from "@/lib/db";

export async function GET() {
  try {
    const stats = await getDBStats();
    return NextResponse.json({
      status: "success",
      stats,
    });
  } catch (err: any) {
    return NextResponse.json(
      { status: "error", message: err.message },
      { status: 500 }
    );
  }
}

export async function POST() {
  try {
    const removedCount = await purgeOldArticles();
    const stats = await getDBStats();
    return NextResponse.json({
      status: "success",
      message: `Supabase database purged successfully. Removed ${removedCount} articles older than 7 days.`,
      purgedCount: removedCount,
      stats,
    });
  } catch (err: any) {
    return NextResponse.json(
      { status: "error", message: err.message },
      { status: 500 }
    );
  }
}
