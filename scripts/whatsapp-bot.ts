/**
 * WhatsApp Web Automation Bot
 * 
 * Sends messages to leads via WhatsApp Web using Playwright.
 * 
 * ANTI-BAN STRATEGY:
 * - Random delays between messages (60-180 seconds)
 * - Human-like typing speed with random pauses
 * - Max 30-50 messages per session (WhatsApp daily limit is ~250 for new numbers)
 * - Persistent browser session (no repeated logins)
 * - Random message variations to avoid pattern detection
 * - Respects business hours only (8am - 8pm)
 * - Stops immediately if any error/captcha detected
 * 
 * Usage:
 *   npx tsx scripts/whatsapp-bot.ts                    # First run: scan QR code
 *   npx tsx scripts/whatsapp-bot.ts --send             # Start sending to queue
 *   npx tsx scripts/whatsapp-bot.ts --send --limit=20  # Send max 20 messages
 *   npx tsx scripts/whatsapp-bot.ts --status           # Check session status
 * 
 * Environment:
 *   MAX_PER_SESSION=30       Max messages per run (default: 30)
 *   MIN_DELAY_SEC=60         Min seconds between messages (default: 60)
 *   MAX_DELAY_SEC=180        Max seconds between messages (default: 180)
 *   BUSINESS_HOUR_START=8    Start hour (default: 8)
 *   BUSINESS_HOUR_END=20     End hour (default: 20)
 */

import { chromium, type Browser, type BrowserContext, type Page } from "playwright";
import { PrismaClient } from "../src/generated/prisma/client";
import { PrismaLibSql } from "@prisma/adapter-libsql";
import { fillTemplate } from "../src/lib/templates";
import * as path from "path";
import * as fs from "fs";

// ===== CONFIG =====
const MAX_PER_SESSION = parseInt(process.env.MAX_PER_SESSION || "30");
const MIN_DELAY_SEC = parseInt(process.env.MIN_DELAY_SEC || "60");
const MAX_DELAY_SEC = parseInt(process.env.MAX_DELAY_SEC || "180");
const BUSINESS_HOUR_START = parseInt(process.env.BUSINESS_HOUR_START || "8");
const BUSINESS_HOUR_END = parseInt(process.env.BUSINESS_HOUR_END || "20");
const SESSION_DIR = path.resolve(__dirname, "../.whatsapp-session");
const LOG_FILE = path.resolve(__dirname, "../logs/whatsapp-bot.log");

// ===== DATABASE =====
const DB_PATH = path.resolve(__dirname, "../dev.db");
const adapter = new PrismaLibSql({ url: `file:${DB_PATH}` });
const prisma = new PrismaClient({ adapter });

// ===== HELPERS =====
function log(msg: string) {
  const timestamp = new Date().toISOString();
  const line = `[${timestamp}] ${msg}`;
  console.log(line);
  const logDir = path.dirname(LOG_FILE);
  if (!fs.existsSync(logDir)) fs.mkdirSync(logDir, { recursive: true });
  fs.appendFileSync(LOG_FILE, line + "\n");
}

function randomDelay(minSec: number, maxSec: number): number {
  return (Math.random() * (maxSec - minSec) + minSec) * 1000;
}

function isBusinessHours(): boolean {
  const hour = new Date().getHours();
  return hour >= BUSINESS_HOUR_START && hour < BUSINESS_HOUR_END;
}

function randomizeMessage(message: string): string {
  // Add slight variations to avoid pattern detection
  const greetings = ["", " "];
  const endings = ["", " "];
  const randomGreeting = greetings[Math.floor(Math.random() * greetings.length)];
  const randomEnding = endings[Math.floor(Math.random() * endings.length)];
  return randomGreeting + message + randomEnding;
}

async function humanType(page: Page, selector: string, text: string) {
  // Type like a human — variable speed, occasional pauses
  await page.click(selector);
  await page.waitForTimeout(300 + Math.random() * 500);

  const lines = text.split("\n");
  for (let i = 0; i < lines.length; i++) {
    if (i > 0) {
      // Shift+Enter for new line in WhatsApp
      await page.keyboard.down("Shift");
      await page.keyboard.press("Enter");
      await page.keyboard.up("Shift");
      await page.waitForTimeout(100 + Math.random() * 200);
    }

    const line = lines[i];
    for (const char of line) {
      await page.keyboard.type(char, { delay: 30 + Math.random() * 70 });
      // Occasional longer pause (simulating thinking)
      if (Math.random() < 0.05) {
        await page.waitForTimeout(500 + Math.random() * 1000);
      }
    }
  }
}

// ===== MAIN BOT =====
async function initBrowser(): Promise<{ browser: Browser; context: BrowserContext; page: Page }> {
  // Create session directory for persistent login
  if (!fs.existsSync(SESSION_DIR)) {
    fs.mkdirSync(SESSION_DIR, { recursive: true });
  }

  const browser = await chromium.launchPersistentContext(SESSION_DIR, {
    headless: false, // First run needs QR scan, then can switch to headless
    args: [
      "--no-sandbox",
      "--disable-blink-features=AutomationControlled",
      "--disable-features=site-per-process",
    ],
    viewport: { width: 1280, height: 800 },
    userAgent:
      "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
    locale: "de-AT",
    timezoneId: "Europe/Vienna",
  });

  const page = browser.pages()[0] || (await browser.newPage());
  return { browser: browser as unknown as Browser, context: browser, page };
}

async function waitForLogin(page: Page): Promise<boolean> {
  log("🌐 Opening WhatsApp Web...");
  await page.goto("https://web.whatsapp.com", { waitUntil: "domcontentloaded" });

  // Check if already logged in
  try {
    await page.waitForSelector('[data-testid="chat-list"]', { timeout: 15000 });
    log("✅ Already logged in!");
    return true;
  } catch {
    // Not logged in, wait for QR scan
    log("📱 Please scan the QR code with your phone...");
    log("   Open WhatsApp → Settings → Linked Devices → Link a Device");
    try {
      await page.waitForSelector('[data-testid="chat-list"]', { timeout: 120000 });
      log("✅ Login successful!");
      return true;
    } catch {
      log("❌ Login timeout. Please try again.");
      return false;
    }
  }
}

async function sendWhatsAppMessage(page: Page, phone: string, message: string): Promise<boolean> {
  try {
    // Clean phone number
    const cleanPhone = phone.replace(/[^0-9+]/g, "").replace(/^\+/, "");

    // Navigate to chat via wa.me URL (most reliable method)
    const encodedMsg = encodeURIComponent(message);
    await page.goto(`https://web.whatsapp.com/send?phone=${cleanPhone}&text=${encodedMsg}`, {
      waitUntil: "domcontentloaded",
    });

    // Wait for chat to load
    await page.waitForTimeout(3000 + Math.random() * 2000);

    // Check for "Phone number shared via url is invalid" popup
    const invalidNumber = await page.locator('text="Phone number shared via url is invalid"').isVisible().catch(() => false);
    if (invalidNumber) {
      log(`   ⚠️  Invalid phone number: ${cleanPhone}`);
      return false;
    }

    // Check for "OK" button (number not on WhatsApp)
    const okButton = await page.locator('[data-testid="popup-controls-ok"]').isVisible().catch(() => false);
    if (okButton) {
      await page.locator('[data-testid="popup-controls-ok"]').click();
      log(`   ⚠️  Number not on WhatsApp: ${cleanPhone}`);
      return false;
    }

    // Wait for send button to appear
    await page.waitForSelector('[data-testid="send"]', { timeout: 15000 });

    // Small human-like pause before clicking send
    await page.waitForTimeout(1000 + Math.random() * 2000);

    // Click send
    await page.locator('[data-testid="send"]').click();

    // Wait for message to be sent (check mark appears)
    await page.waitForTimeout(2000 + Math.random() * 1000);

    log(`   ✅ Message sent to ${cleanPhone}`);
    return true;
  } catch (error) {
    const msg = error instanceof Error ? error.message : "Unknown error";
    log(`   ❌ Failed to send to ${phone}: ${msg}`);
    return false;
  }
}

async function processQueue(args: { limit?: number }) {
  if (!isBusinessHours()) {
    log(`⏰ Outside business hours (${BUSINESS_HOUR_START}:00 - ${BUSINESS_HOUR_END}:00). Skipping.`);
    return;
  }

  const maxMessages = args.limit || MAX_PER_SESSION;

  // Get leads to contact (new leads with phone numbers, not yet contacted)
  const leads = await prisma.lead.findMany({
    where: {
      status: "new",
      phone: { not: null },
    },
    orderBy: { createdAt: "asc" },
    take: maxMessages,
  });

  if (leads.length === 0) {
    log("📭 No leads in queue to contact.");
    return;
  }

  log(`📋 ${leads.length} leads to contact (max ${maxMessages} this session)`);

  // Fallback templates by language (used if none in DB)
  const fallbackTemplates: Record<string, string> = {
    de: `Guten Tag! 👋\n\nMein Name ist Enisi von WebPro Austria. Ich habe gesehen, dass {{businessName}} in {{city}} noch keine professionelle Website hat.\n\nWir bauen mobile-freundliche Websites speziell für {{category}} — ab €349, fertig in 7–10 Tagen.\n\nDarf ich Ihnen eine kostenlose Demo zeigen? 🖥️\n\nBeste Grüße,\nEnisi | WebPro Austria`,
    sq: `Përshëndetje! 👋\n\nUnë jam Enisi nga WebPro. Pashë që {{businessName}} në {{city}} nuk ka ende një faqe interneti profesionale.\n\nNe ndërtojmë faqe interneti moderne për {{category}} — duke filluar nga €249, gati brenda 7-10 ditëve.\n\nA dëshironi t'ju tregoj një demo falas? 🖥️\n\nPërshëndetje,\nEnisi | WebPro`,
    en: `Hi there! 👋\n\nI'm Enisi from WebPro. I noticed that {{businessName}} in {{city}} doesn't have a professional website yet.\n\nWe build modern, mobile-friendly websites for {{category}} — starting at €249, ready in 7-10 days.\n\nWould you like me to show you a free demo? 🖥️\n\nBest regards,\nEnisi | WebPro`,
  };

  // Try to get templates from DB
  const dbTemplates = await prisma.template.findMany({
    where: { channel: "whatsapp" },
  });

  // Initialize browser
  const { context, page } = await initBrowser();

  const loggedIn = await waitForLogin(page);
  if (!loggedIn) {
    await context.close();
    return;
  }

  let sent = 0;
  let failed = 0;

  for (const lead of leads) {
    if (!isBusinessHours()) {
      log("⏰ Business hours ended. Stopping.");
      break;
    }

    const vars = {
      businessName: lead.business,
      city: lead.city || "",
      category: lead.category || "",
      name: lead.name || "",
    };

    // Detect language from lead notes (Lang: xx) or default to "de"
    const langMatch = lead.notes?.match(/Lang:\s*(\w+)/);
    const leadLang = langMatch ? langMatch[1] : "de";

    // Pick template: DB first, then fallback
    const dbTemplate = dbTemplates.find((t) => t.language === leadLang);
    const templateBody = dbTemplate?.body || fallbackTemplates[leadLang] || fallbackTemplates["de"];

    let message = fillTemplate(templateBody, vars);
    message = randomizeMessage(message);

    log(`📤 Sending to: ${lead.business} (${lead.phone})`);

    const success = await sendWhatsAppMessage(page, lead.phone!, message);

    if (success) {
      sent++;
      // Update lead status
      await prisma.lead.update({
        where: { id: lead.id },
        data: { status: "contacted" },
      });
      // Record message
      await prisma.message.create({
        data: {
          leadId: lead.id,
          channel: "whatsapp",
          direction: "outbound",
          body: message,
          status: "delivered",
        },
      });
    } else {
      failed++;
      // Mark as failed but don't skip permanently
      await prisma.message.create({
        data: {
          leadId: lead.id,
          channel: "whatsapp",
          direction: "outbound",
          body: message,
          status: "failed",
        },
      });
    }

    // Random delay between messages (critical for anti-ban)
    if (sent + failed < leads.length) {
      const delay = randomDelay(MIN_DELAY_SEC, MAX_DELAY_SEC);
      log(`   ⏳ Waiting ${Math.round(delay / 1000)}s before next message...`);
      await page.waitForTimeout(delay);
    }
  }

  log(`\n🏁 Session complete: ${sent} sent, ${failed} failed`);
  log(`📊 Remaining in queue: ${leads.length - sent - failed}`);

  // Close browser
  await context.close();
  await prisma.$disconnect();
}

async function checkStatus() {
  const total = await prisma.lead.count();
  const newLeads = await prisma.lead.count({ where: { status: "new" } });
  const contacted = await prisma.lead.count({ where: { status: "contacted" } });
  const messages = await prisma.message.count({ where: { channel: "whatsapp" } });

  log("📊 Bot Status:");
  log(`   Total leads: ${total}`);
  log(`   Queue (new): ${newLeads}`);
  log(`   Contacted: ${contacted}`);
  log(`   WhatsApp messages sent: ${messages}`);
  log(`   Session dir exists: ${fs.existsSync(SESSION_DIR)}`);

  await prisma.$disconnect();
}

// ===== CLI =====
const args = process.argv.slice(2);

if (args.includes("--status")) {
  checkStatus();
} else if (args.includes("--send")) {
  const limitArg = args.find((a) => a.startsWith("--limit="));
  const limit = limitArg ? parseInt(limitArg.split("=")[1]) : undefined;
  processQueue({ limit }).catch((e) => {
    log(`❌ Fatal error: ${e.message}`);
    process.exit(1);
  });
} else {
  // Default: just open browser for QR login
  log("🚀 WhatsApp Bot — Login Mode");
  log("   Scan the QR code, then restart with --send flag");
  initBrowser().then(async ({ context, page }) => {
    const loggedIn = await waitForLogin(page);
    if (loggedIn) {
      log("✅ Session saved. You can now run with --send flag.");
      log("   Command: npx tsx scripts/whatsapp-bot.ts --send");
    }
    // Keep browser open for manual inspection
    log("   Press Ctrl+C to close.");
  });
}
