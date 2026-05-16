import { prisma } from "@/lib/db";
import { NextRequest, NextResponse } from "next/server";

export async function GET() {
  const campaigns = await prisma.campaign.findMany({
    orderBy: { createdAt: "desc" },
    include: { _count: { select: { leads: true, steps: true } } },
  });
  return NextResponse.json(campaigns);
}

export async function POST(req: NextRequest) {
  const body = await req.json();
  const campaign = await prisma.campaign.create({
    data: {
      name: body.name,
      description: body.description || null,
      channel: body.channel || "email",
    },
  });
  return NextResponse.json(campaign, { status: 201 });
}
