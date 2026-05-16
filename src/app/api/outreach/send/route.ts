import { prisma } from "@/lib/db";
import { NextRequest, NextResponse } from "next/server";
import { fillTemplate } from "@/lib/templates";
import { sendEmail } from "@/lib/email";
import { sendWhatsApp } from "@/lib/whatsapp";

export async function POST(req: NextRequest) {
  const { leadId, templateId, channel, customSubject, customBody } = await req.json();

  // Get the lead
  const lead = await prisma.lead.findUnique({ where: { id: leadId } });
  if (!lead) {
    return NextResponse.json({ error: "Lead not found" }, { status: 404 });
  }

  let subject = customSubject || "";
  let body = customBody || "";

  // If using a template, fill in variables
  if (templateId) {
    const template = await prisma.template.findUnique({ where: { id: templateId } });
    if (!template) {
      return NextResponse.json({ error: "Template not found" }, { status: 404 });
    }

    const vars = {
      businessName: lead.business,
      city: lead.city || "",
      category: lead.category || "",
      name: lead.name || "",
      phone: lead.phone || "",
      email: lead.email || "",
    };

    subject = template.subject ? fillTemplate(template.subject, vars) : "";
    body = fillTemplate(template.body, vars);
  }

  const messageChannel = channel || "email";
  let sendStatus = "sent";
  let sendResult: Record<string, unknown> = {};

  // ===== ACTUALLY SEND THE MESSAGE =====
  if (messageChannel === "email") {
    if (!lead.email) {
      return NextResponse.json({ error: "Lead has no email address" }, { status: 400 });
    }
    const result = await sendEmail({ to: lead.email, subject, body });
    sendStatus = result.success ? "delivered" : "failed";
    sendResult = {
      type: "email",
      success: result.success,
      messageId: result.messageId,
      error: result.error,
      sentTo: lead.email,
    };
  } else if (messageChannel === "whatsapp") {
    if (!lead.phone) {
      return NextResponse.json({ error: "Lead has no phone number" }, { status: 400 });
    }
    const result = await sendWhatsApp({ to: lead.phone, body });
    sendStatus = result.success ? "delivered" : "sent";
    sendResult = {
      type: "whatsapp",
      success: result.success,
      messageId: result.messageId,
      error: result.error,
      fallbackUrl: result.fallbackUrl,
    };
  } else if (messageChannel === "instagram") {
    // Instagram DMs can't be automated without official API approval
    // Return copy-ready message + profile link
    sendStatus = "sent";
    sendResult = {
      type: "instagram",
      success: false,
      instruction: `Open Instagram and send DM to ${lead.business}`,
      profileUrl: lead.instagram || "",
      copyText: body,
    };
  }

  // Record the message in database
  const message = await prisma.message.create({
    data: {
      leadId: lead.id,
      channel: messageChannel,
      direction: "outbound",
      subject,
      body,
      status: sendStatus,
    },
  });

  // Update lead status to contacted
  if (lead.status === "new") {
    await prisma.lead.update({
      where: { id: lead.id },
      data: { status: "contacted" },
    });
  }

  return NextResponse.json({
    message,
    sendResult,
    body,
    subject,
  });
}
