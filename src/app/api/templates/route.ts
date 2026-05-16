import { prisma } from "@/lib/db";
import { NextRequest, NextResponse } from "next/server";

export async function GET() {
  const templates = await prisma.template.findMany({
    orderBy: { createdAt: "desc" },
  });
  return NextResponse.json(templates);
}

export async function POST(req: NextRequest) {
  const body = await req.json();
  const template = await prisma.template.create({
    data: {
      name: body.name,
      channel: body.channel || "email",
      subject: body.subject || null,
      body: body.body,
      language: body.language || "de",
      variables: body.variables || null,
    },
  });
  return NextResponse.json(template, { status: 201 });
}
