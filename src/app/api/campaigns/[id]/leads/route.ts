import { prisma } from "@/lib/db";
import { NextRequest, NextResponse } from "next/server";

// Add leads to a campaign
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id: campaignId } = await params;
  const { leadIds } = await req.json();

  if (!Array.isArray(leadIds) || leadIds.length === 0) {
    return NextResponse.json({ error: "leadIds array required" }, { status: 400 });
  }

  // Verify campaign exists
  const campaign = await prisma.campaign.findUnique({
    where: { id: campaignId },
    include: { steps: { orderBy: { order: "asc" } } },
  });

  if (!campaign) {
    return NextResponse.json({ error: "Campaign not found" }, { status: 404 });
  }

  // Calculate first send time based on first step delay
  const firstStep = campaign.steps[0];
  const nextSendAt = firstStep
    ? new Date(Date.now() + firstStep.delayDays * 24 * 60 * 60 * 1000)
    : new Date();

  // Add leads (skip already added)
  const existing = await prisma.campaignLead.findMany({
    where: { campaignId, leadId: { in: leadIds } },
    select: { leadId: true },
  });
  const existingIds = new Set(existing.map((e) => e.leadId));
  const newLeadIds = leadIds.filter((id: string) => !existingIds.has(id));

  if (newLeadIds.length === 0) {
    return NextResponse.json({ added: 0, message: "All leads already in campaign" });
  }

  await prisma.campaignLead.createMany({
    data: newLeadIds.map((leadId: string) => ({
      campaignId,
      leadId,
      currentStep: 0,
      status: "pending",
      nextSendAt,
    })),
  });

  return NextResponse.json({ added: newLeadIds.length }, { status: 201 });
}
