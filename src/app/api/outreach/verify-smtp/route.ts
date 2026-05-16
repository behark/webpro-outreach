import { NextResponse } from "next/server";
import { verifySmtp } from "@/lib/email";

export async function GET() {
  const result = await verifySmtp();
  return NextResponse.json(result);
}
