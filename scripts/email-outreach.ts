/**
 * Email Outreach Runner — Hostinger SMTP
 *
 * Sends the initial outreach email (German, professional) to leads in the DB
 * that have an email and status="new".
 *
 * Anti-spam / Hostinger rate-limit safe:
 *   - 12 s default delay between sends (~300/hour, Hostinger limit is ~100/hr
 *     for shared / 300/hr for Business plans — adjust DELAY_MS if needed)
 *   - Hard cap per run (MAX_PER_RUN, default 50)
 *   - Stops immediately on auth / rate-limit failures
 *   - Skips invalid-looking emails and obvious info@/no-reply addresses on flag
 *
 * Usage:
 *   npx tsx scripts/email-outreach.ts --test=you@yourmail.com   # send 1 test mail
 *   npx tsx scripts/email-outreach.ts --dry                     # preview only
 *   npx tsx scripts/email-outreach.ts --send                    # send to queue
 *   npx tsx scripts/email-outreach.ts --send --limit=5
 *   npx tsx scripts/email-outreach.ts --send --country=Switzerland
 */

import "dotenv/config";
import * as path from "path";
import * as fs from "fs";
import { PrismaClient } from "../src/generated/prisma/client";
import { PrismaLibSql } from "@prisma/adapter-libsql";
import { sendEmail, verifySmtp } from "../src/lib/email";
import { DEFAULT_TEMPLATES, fillTemplate } from "../src/lib/templates";

const DB_PATH = path.resolve(__dirname, "../dev.db");
const adapter = new PrismaLibSql({ url: `file:${DB_PATH}` });
const prisma = new PrismaClient({ adapter });

const LOG_FILE = path.resolve(__dirname, "../logs/email-outreach.log");
const DELAY_MS = parseInt(process.env.EMAIL_DELAY_MS || "12000");
const MAX_PER_RUN = parseInt(process.env.MAX_PER_RUN || "50");

function log(msg: string) {
  const line = `[${new Date().toISOString()}] ${msg}`;
  console.log(line);
  const dir = path.dirname(LOG_FILE);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  fs.appendFileSync(LOG_FILE, line + "\n");
}

function isValidEmail(e: string | null | undefined): e is string {
  if (!e) return false;
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e.trim());
}

// Mojibake check: U+FFFD replacement char means the original umlaut was lost
// at import. Sending these would produce garbled subject lines.
function isGarbled(s: string | null | undefined): boolean {
  if (!s) return false;
  return s.includes("\uFFFD");
}

function pickTemplate(language: string) {
  // Default German initial template
  if (language === "sq") {
    // No Albanian email template defined yet — fall back to German
    return DEFAULT_TEMPLATES.email_de_initial;
  }
  return DEFAULT_TEMPLATES.email_de_initial;
}

async function sendTest(to: string) {
  log(`📨 Sending test email to ${to}`);
  const verify = await verifySmtp();
  if (!verify.connected) {
    log(`❌ SMTP verify failed: ${verify.error}`);
    process.exit(1);
  }
  const tpl = pickTemplate("de");
  const vars = {
    businessName: "Test Restaurant Wien",
    city: "Wien",
    category: "Restaurant",
    name: "",
    phone: "",
    email: to,
  };
  const subject = fillTemplate(tpl.subject!, vars);
  const body = fillTemplate(tpl.body, vars);
  const r = await sendEmail({ to, subject, body });
  log(`Result: ${JSON.stringify(r)}`);
  process.exit(r.success ? 0 : 1);
}

async function run({ dry, limit, country, allowGarbled }: { dry: boolean; limit?: number; country?: string; allowGarbled: boolean }) {
  const cap = Math.min(limit ?? MAX_PER_RUN, MAX_PER_RUN);

  log(`🚀 Email outreach starting — cap=${cap}, delay=${DELAY_MS}ms, dry=${dry}, country=${country ?? "any"}, allowGarbled=${allowGarbled}`);

  if (!dry) {
    const v = await verifySmtp();
    if (!v.connected) {
      log(`❌ SMTP verify failed: ${v.error}`);
      process.exit(1);
    }
    log(`✅ SMTP connection OK (${process.env.SMTP_HOST} as ${process.env.SMTP_USER})`);
  }

  const where: { status: string; email: { not: null }; country?: string } = {
    status: "new",
    email: { not: null },
  };
  if (country) where.country = country;

  const leads = await prisma.lead.findMany({
    where,
    orderBy: { createdAt: "asc" },
    take: cap * 2, // overfetch in case of invalid emails
  });

  const cleanFiltered = leads.filter((l) => isValidEmail(l.email));
  const garbledCount = cleanFiltered.filter((l) => isGarbled(l.business) || isGarbled(l.city)).length;
  const finalLeads = (allowGarbled
    ? cleanFiltered
    : cleanFiltered.filter((l) => !isGarbled(l.business) && !isGarbled(l.city))
  ).slice(0, cap);
  log(`📋 ${finalLeads.length} leads to email (clean=${cleanFiltered.length - garbledCount}, garbled-skipped=${allowGarbled ? 0 : garbledCount})`);

  if (finalLeads.length === 0) {
    log("📭 Nothing to send.");
    await prisma.$disconnect();
    return;
  }

  let sent = 0;
  let failed = 0;
  let skipped = 0;

  for (let i = 0; i < finalLeads.length; i++) {
    const lead = finalLeads[i];
    const langMatch = lead.notes?.match(/Lang:\s*(\w+)/);
    const lang = langMatch ? langMatch[1] : "de";
    const tpl = pickTemplate(lang);

    const vars = {
      businessName: lead.business,
      city: lead.city || "",
      category: lead.category || "Unternehmen",
      name: lead.name || "",
      phone: lead.phone || "",
      email: lead.email || "",
    };
    const subject = fillTemplate(tpl.subject!, vars);
    const body = fillTemplate(tpl.body, vars);

    log(`📤 [${i + 1}/${finalLeads.length}] ${lead.business} <${lead.email}> (${lead.city || "?"})`);

    if (dry) {
      log(`   (dry) subject: ${subject}`);
      skipped++;
      continue;
    }

    const r = await sendEmail({ to: lead.email!, subject, body });

    await prisma.message.create({
      data: {
        leadId: lead.id,
        channel: "email",
        direction: "outbound",
        subject,
        body,
        status: r.success ? "delivered" : "failed",
      },
    });

    if (r.success) {
      sent++;
      await prisma.lead.update({
        where: { id: lead.id },
        data: { status: "contacted" },
      });
      log(`   ✅ messageId=${r.messageId}`);
    } else {
      failed++;
      log(`   ❌ ${r.error}`);
      // Bail out on auth / rate-limit errors — they apply to every send
      if (
        r.error &&
        /(auth|535|550|rate|quota|too many|temporarily)/i.test(r.error)
      ) {
        log(`🛑 Stopping early due to fatal SMTP error.`);
        break;
      }
    }

    if (i < finalLeads.length - 1) {
      await new Promise((res) => setTimeout(res, DELAY_MS));
    }
  }

  log(`🏁 Done — sent=${sent} failed=${failed} skipped=${skipped}`);
  await prisma.$disconnect();
}

const args = process.argv.slice(2);
const testArg = args.find((a) => a.startsWith("--test="));
if (testArg) {
  sendTest(testArg.split("=")[1]).catch((e) => {
    log(`Fatal: ${e.message}`);
    process.exit(1);
  });
} else {
  const dry = args.includes("--dry");
  const send = args.includes("--send");
  if (!dry && !send) {
    console.log("Usage: npx tsx scripts/email-outreach.ts (--dry | --send) [--limit=N] [--country=Name]");
    console.log("       npx tsx scripts/email-outreach.ts --test=you@example.com");
    process.exit(1);
  }
  const limitArg = args.find((a) => a.startsWith("--limit="));
  const limit = limitArg ? parseInt(limitArg.split("=")[1]) : undefined;
  const countryArg = args.find((a) => a.startsWith("--country="));
  const country = countryArg ? countryArg.split("=")[1] : undefined;
  const allowGarbled = args.includes("--allow-garbled");
  run({ dry, limit, country, allowGarbled }).catch((e) => {
    log(`Fatal: ${e.message}`);
    process.exit(1);
  });
}
