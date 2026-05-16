import { prisma } from "@/lib/db";
import { NextRequest, NextResponse } from "next/server";

// Add a step to a campaign
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id: campaignId } = await params;
  const body = await req.json();

  // Get current step count for ordering
  const stepCount = await prisma.campaignStep.count({ where: { campaignId } });

  const step = await prisma.campaignStep.create({
    data: {
      campaignId,
      order: body.order ?? stepCount,
      channel: body.channel || "email",
      subject: body.subject || null,
      body: body.body,
      delayDays: body.delayDays ?? 0,
    },
  });

  return NextResponse.json(step, { status: 201 });
}

// Get all steps for a campaign
export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id: campaignId } = await params;
  const steps = await prisma.campaignStep.findMany({
    where: { campaignId },
    orderBy: { order: "asc" },
  });
  return NextResponse.json(steps);
}
