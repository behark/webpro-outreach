import { prisma } from "@/lib/db";
import { sendEmail } from "@/lib/email";
import { sendWhatsApp } from "@/lib/whatsapp";
import { fillTemplate } from "@/lib/templates";

export interface SchedulerResult {
  processed: number;
  sent: number;
  failed: number;
  details: Array<{
    leadId: string;
    business: string;
    channel: string;
    success: boolean;
    error?: string;
  }>;
}

/**
 * Process all pending campaign leads that are due for their next message.
 * This runs through active campaigns, checks which leads need a message,
 * and sends it via the appropriate channel.
 */
export async function processCampaignQueue(): Promise<SchedulerResult> {
  const result: SchedulerResult = { processed: 0, sent: 0, failed: 0, details: [] };

  // Find all active campaigns with their steps
  const activeCampaigns = await prisma.campaign.findMany({
    where: { status: "active" },
    include: {
      steps: { orderBy: { order: "asc" } },
      leads: {
        where: {
          status: { in: ["pending", "in_progress"] },
          OR: [
            { nextSendAt: null },
            { nextSendAt: { lte: new Date() } },
          ],
        },
        include: { lead: true },
      },
    },
  });

  for (const campaign of activeCampaigns) {
    if (campaign.steps.length === 0) continue;

    for (const campaignLead of campaign.leads) {
      const lead = campaignLead.lead;
      const currentStepIndex = campaignLead.currentStep;

      // Check if there are more steps to send
      if (currentStepIndex >= campaign.steps.length) {
        // Campaign completed for this lead
        await prisma.campaignLead.update({
          where: { id: campaignLead.id },
          data: { status: "completed" },
        });
        continue;
      }

      const step = campaign.steps[currentStepIndex];
      result.processed++;

      // Fill template variables
      const vars = {
        businessName: lead.business,
        city: lead.city || "",
        category: lead.category || "",
        name: lead.name || "",
        phone: lead.phone || "",
        email: lead.email || "",
      };

      const subject = step.subject ? fillTemplate(step.subject, vars) : "";
      const body = fillTemplate(step.body, vars);

      let success = false;
      let error: string | undefined;

      // Send based on channel
      if (step.channel === "email" && lead.email) {
        const emailResult = await sendEmail({ to: lead.email, subject, body });
        success = emailResult.success;
        error = emailResult.error;
      } else if (step.channel === "whatsapp" && lead.phone) {
        const waResult = await sendWhatsApp({ to: lead.phone, body });
        success = waResult.success;
        error = waResult.error;
      } else {
        error = `No ${step.channel} contact info for ${lead.business}`;
      }

      // Record the message
      await prisma.message.create({
        data: {
          leadId: lead.id,
          channel: step.channel,
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

      // Move to next step and schedule next send
      const nextStepIndex = currentStepIndex + 1;
      const nextStep = campaign.steps[nextStepIndex];
      const nextSendAt = nextStep
        ? new Date(Date.now() + nextStep.delayDays * 24 * 60 * 60 * 1000)
        : null;

      await prisma.campaignLead.update({
        where: { id: campaignLead.id },
        data: {
          currentStep: nextStepIndex,
          status: nextStepIndex >= campaign.steps.length ? "completed" : "in_progress",
          nextSendAt,
        },
      });

      if (success) {
        result.sent++;
      } else {
        result.failed++;
      }

      result.details.push({
        leadId: lead.id,
        business: lead.business,
        channel: step.channel,
        success,
        error,
      });
    }
  }

  return result;
}
