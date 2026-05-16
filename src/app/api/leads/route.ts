import { prisma } from "@/lib/db";
import { NextRequest, NextResponse } from "next/server";

export async function GET() {
  const leads = await prisma.lead.findMany({
    orderBy: { createdAt: "desc" },
    include: { _count: { select: { messages: true } } },
  });
  return NextResponse.json(leads);
}

export async function POST(req: NextRequest) {
  const body = await req.json();

  // Support bulk creation
  if (Array.isArray(body)) {
    const leads = await prisma.lead.createMany({
      data: body.map((lead: Record<string, string>) => ({
        name: lead.name || lead.business || "Unknown",
        business: lead.business || "Unknown",
        category: lead.category || "restaurant",
        email: lead.email || null,
        phone: lead.phone || null,
        website: lead.website || null,
        address: lead.address || null,
        city: lead.city || null,
        instagram: lead.instagram || null,
        facebook: lead.facebook || null,
        googleMaps: lead.googleMaps || null,
        source: lead.source || "manual",
      })),
    });
    return NextResponse.json({ created: leads.count }, { status: 201 });
  }

  const lead = await prisma.lead.create({
    data: {
      name: body.name || body.business || "Unknown",
      business: body.business || "Unknown",
      category: body.category || "restaurant",
      email: body.email || null,
      phone: body.phone || null,
      website: body.website || null,
      address: body.address || null,
      city: body.city || null,
      instagram: body.instagram || null,
      facebook: body.facebook || null,
      googleMaps: body.googleMaps || null,
      source: body.source || "manual",
    },
  });
  return NextResponse.json(lead, { status: 201 });
}
