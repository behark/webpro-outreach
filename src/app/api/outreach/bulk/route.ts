import { prisma } from "@/lib/db";
import { NextRequest, NextResponse } from "next/server";
import { fillTemplate } from "@/lib/templates";
import { sendEmail } from "@/lib/email";
import { sendWhatsApp } from "@/lib/whatsapp";

// Send a message to multiple leads at once
export async function POST(req: NextRequest) {
  const { leadIds, templateId, channel, delayBetweenMs } = await req.json();

  if (!Array.isArray(leadIds) || leadIds.length === 0) {
    return NextResponse.json({ error: "leadIds array required" }, { status: 400 });
  }

  if (!templateId) {
    return NextResponse.json({ error: "templateId required" }, { status: 400 });
  }

  const template = await prisma.template.findUnique({ where: { id: templateId } });
  if (!template) {
    return NextResponse.json({ error: "Template not found" }, { status: 404 });
  }

  const leads = await prisma.lead.findMany({
    where: { id: { in: leadIds } },
  });

  const messageChannel = channel || template.channel || "email";
  const delay = delayBetweenMs || 2000; // 2 second delay between sends to avoid rate limits

  const results: Array<{ leadId: string; business: string; success: boolean; error?: string }> = [];

  for (const lead of leads) {
    const vars = {
      businessName: lead.business,
      city: lead.city || "",
      category: lead.category || "",
      name: lead.name || "",
      phone: lead.phone || "",
      email: lead.email || "",
    };

    const subject = template.subject ? fillTemplate(template.subject, vars) : "";
    const body = fillTemplate(template.body, vars);

    let success = false;
    let error: string | undefined;

    if (messageChannel === "email" && lead.email) {
      const result = await sendEmail({ to: lead.email, subject, body });
      success = result.success;
      error = result.error;
    } else if (messageChannel === "whatsapp" && lead.phone) {
      const result = await sendWhatsApp({ to: lead.phone, body });
      success = result.success;
      error = result.error;
    } else {
      error = `No ${messageChannel} contact info for ${lead.business}`;
    }

    // Record message
    await prisma.message.create({
      data: {
        leadId: lead.id,
        channel: messageChannel,
        direction: "outbound",
        subject,
        body,
        status: success ? "delivered" : "failed",
      },
    });

    // Update lead status
    if (success && lead.status === "new") {
      await prisma.lead.update({
        where: { id: lead.id },
        data: { status: "contacted" },
      });
    }

    results.push({ leadId: lead.id, business: lead.business, success, error });

    // Delay between sends
    if (delay > 0) {
      await new Promise((resolve) => setTimeout(resolve, delay));
    }
  }

  const sent = results.filter((r) => r.success).length;
  const failed = results.filter((r) => !r.success).length;

  return NextResponse.json({
    total: leads.length,
    sent,
    failed,
    results,
  });
}
