import { prisma } from "@/lib/db";
import { NextRequest, NextResponse } from "next/server";
import { fillTemplate } from "@/lib/templates";

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

  // Record the message
  const message = await prisma.message.create({
    data: {
      leadId: lead.id,
      channel: messageChannel,
      direction: "outbound",
      subject,
      body,
      status: "sent",
    },
  });

  // Update lead status to contacted
  if (lead.status === "new") {
    await prisma.lead.update({
      where: { id: lead.id },
      data: { status: "contacted" },
    });
  }

  // Generate the outreach action based on channel
  let action: Record<string, string> = {};

  if (messageChannel === "email" && lead.email) {
    const mailtoSubject = encodeURIComponent(subject);
    const mailtoBody = encodeURIComponent(body);
    action = {
      type: "email",
      url: `mailto:${lead.email}?subject=${mailtoSubject}&body=${mailtoBody}`,
      instruction: `Open your email client to send to ${lead.email}`,
    };
  } else if (messageChannel === "whatsapp" && lead.phone) {
    const waText = encodeURIComponent(body);
    const phone = lead.phone.replace(/[^0-9]/g, "");
    action = {
      type: "whatsapp",
      url: `https://wa.me/${phone}?text=${waText}`,
      instruction: `Open WhatsApp to send message to ${lead.phone}`,
    };
  } else if (messageChannel === "instagram") {
    action = {
      type: "instagram",
      url: lead.instagram || "",
      instruction: `Open Instagram and send DM to ${lead.business}. Copy the message below.`,
      copyText: body,
    };
  }

  return NextResponse.json({
    message,
    action,
    body,
    subject,
  });
}
