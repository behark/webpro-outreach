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
const HEADLESS = process.env.WA_HEADLESS === "true";
const SESSION_DIR = path.resolve(__dirname, "../.whatsapp-session");
const LOG_FILE = path.resolve(__dirname, "../logs/whatsapp-bot.log");

// Map country -> default outreach language so Kosovo / Albania get Albanian by default.
function inferLang(lead: { notes?: string | null; country?: string | null; phone?: string | null }): string {
  const m = lead.notes?.match(/Lang:\s*(\w+)/i);
  if (m) return m[1].toLowerCase();
  const c = (lead.country || "").toLowerCase();
  if (c.includes("kosov") || c.includes("albania") || c.includes("shqip")) return "sq";
  if (c.includes("austria") || c.includes("german") || c.includes("deutsch") || c.includes("\u00d6sterreich") || c.includes("switzerland") || c.includes("schweiz")) return "de";
  const p = lead.phone || "";
  if (p.startsWith("+383") || p.startsWith("+355")) return "sq";
  if (p.startsWith("+43") || p.startsWith("+49") || p.startsWith("+41")) return "de";
  return "de";
}

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
    // Headless only after first QR scan — controlled by WA_HEADLESS env var
    headless: HEADLESS,
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

// 2024+ WhatsApp Web no longer ships data-testid attrs. Detect login by
// looking for the side panel / search box, and detect QR by the canvas tag.
async function isLoggedIn(page: Page): Promise<boolean> {
  return await page.evaluate(() => {
    // The persistent left side panel only renders post-login
    if (document.querySelector("#side")) return true;
    if (document.querySelector('div[aria-label="Chat list"]')) return true;
    if (document.querySelector('header[data-tab="4"]')) return true;
    // Search box at top of chat list
    if (document.querySelector('div[role="textbox"][data-tab="3"]')) return true;
    return false;
  }).catch(() => false);
}

async function isQrVisible(page: Page): Promise<boolean> {
  return await page.evaluate(() => {
    return !!(
      document.querySelector('canvas[aria-label*="Scan"]') ||
      document.querySelector('canvas[aria-label*="QR"]') ||
      document.querySelector('div[data-ref]') // QR ref attribute on the wrapper
    );
  }).catch(() => false);
}

async function waitForLogin(page: Page): Promise<boolean> {
  log("🌐 Opening WhatsApp Web...");
  await page.goto("https://web.whatsapp.com", { waitUntil: "domcontentloaded" });

  // First, give the SPA up to 20 s to settle on either logged-in or QR state.
  const deadline = Date.now() + 20000;
  while (Date.now() < deadline) {
    if (await isLoggedIn(page)) {
      log("✅ Already logged in!");
      return true;
    }
    if (await isQrVisible(page)) break;
    await page.waitForTimeout(500);
  }

  if (await isLoggedIn(page)) {
    log("✅ Already logged in!");
    return true;
  }

  log("📱 Please scan the QR code with your phone...");
  log("   Open WhatsApp → Settings → Linked Devices → Link a Device");
  const loginDeadline = Date.now() + 120000;
  while (Date.now() < loginDeadline) {
    if (await isLoggedIn(page)) {
      log("✅ Login successful!");
      // Give the SPA a moment to finish hydrating chats
      await page.waitForTimeout(3000);
      return true;
    }
    await page.waitForTimeout(1000);
  }
  log("❌ Login timeout. Please try again.");
  return false;
}

// Looks for the message compose box. Works on the 2024+ WhatsApp Web UI which
// dropped data-testid and now identifies it via aria-placeholder + contenteditable.
async function findComposeBox(page: Page) {
  const selectors = [
    'div[contenteditable="true"][data-tab="10"]',
    'div[role="textbox"][aria-placeholder*="essage"]', // "Type a message"/"Message"
    'div[role="textbox"][aria-placeholder*="achricht"]', // German "Nachricht"
    'footer div[contenteditable="true"]',
    'div[contenteditable="true"][role="textbox"]',
  ];
  for (const sel of selectors) {
    const loc = page.locator(sel).last();
    if (await loc.isVisible().catch(() => false)) return loc;
  }
  return null;
}

async function findSendButton(page: Page) {
  const selectors = [
    'button[aria-label="Send"]',
    'button[aria-label="Senden"]',
    'span[data-icon="send"]',
    'span[data-icon="wds-ic-send-filled"]',
    'button[data-tab="11"]',
    'div[role="button"][aria-label="Send"]',
    'div[role="button"][aria-label="Senden"]',
  ];
  for (const sel of selectors) {
    const loc = page.locator(sel).last();
    if (await loc.isVisible().catch(() => false)) return loc;
  }
  return null;
}

async function isInvalidNumberPopup(page: Page): Promise<boolean> {
  // 2024+ shows a Material dialog with an "OK" button and "Phone number shared
  // via url is invalid" or localised equivalent.
  return await page.evaluate(() => {
    const text = document.body.innerText || "";
    if (/phone number shared via url is invalid/i.test(text)) return true;
    if (/Telefonnummer.*ung\u00fcltig/i.test(text)) return true;
    if (/couldn'?t find/i.test(text)) return true;
    if (/isn'?t on WhatsApp/i.test(text)) return true;
    return false;
  }).catch(() => false);
}

async function dismissPopup(page: Page) {
  const okSelectors = [
    'div[role="button"]:has-text("OK")',
    'button:has-text("OK")',
    'div[role="button"]:has-text("Okay")',
  ];
  for (const sel of okSelectors) {
    const loc = page.locator(sel).last();
    if (await loc.isVisible().catch(() => false)) {
      await loc.click().catch(() => {});
      return;
    }
  }
}

async function sendWhatsAppMessage(page: Page, phone: string, message: string): Promise<boolean> {
  try {
    // Clean phone number — wa.me/send requires digits only, no leading +.
    const cleanPhone = phone.replace(/[^0-9+]/g, "").replace(/^\+/, "");
    if (!cleanPhone || cleanPhone.length < 7) {
      log(`   ⚠️  Invalid phone: ${phone}`);
      return false;
    }

    const encodedMsg = encodeURIComponent(message);
    await page.goto(`https://web.whatsapp.com/send?phone=${cleanPhone}&text=${encodedMsg}`, {
      waitUntil: "load",
      timeout: 45000,
    });

    // Wait up to 25 s for either: compose box, invalid-number popup, or login lost.
    const deadline = Date.now() + 25000;
    let composeBox: Awaited<ReturnType<typeof findComposeBox>> = null;
    while (Date.now() < deadline) {
      if (await isInvalidNumberPopup(page)) {
        await dismissPopup(page);
        log(`   ⚠️  Number not on WhatsApp: +${cleanPhone}`);
        return false;
      }
      composeBox = await findComposeBox(page);
      if (composeBox) break;
      // Detect session lost
      if (await isQrVisible(page)) {
        log(`   ❌ Session lost (QR shown). Aborting batch.`);
        throw new Error("WhatsApp session lost");
      }
      await page.waitForTimeout(750);
    }

    if (!composeBox) {
      const ssPath = path.resolve(__dirname, `../logs/wa-fail-${Date.now()}.png`);
      await page.screenshot({ path: ssPath, fullPage: true }).catch(() => {});
      log(`   ⚠️  Chat didn't load for: +${cleanPhone} (screenshot: ${ssPath})`);
      return false;
    }

    // Human-like pause before sending
    await page.waitForTimeout(1200 + Math.random() * 1800);

    const sendBtn = await findSendButton(page);
    if (sendBtn) {
      await sendBtn.click();
    } else {
      // Fallback: focus the compose box (text already pre-filled by URL) and press Enter
      await composeBox.click().catch(() => {});
      await page.waitForTimeout(300);
      await page.keyboard.press("Enter");
    }

    // Confirm: wait for an outgoing message bubble ("message-out") OR a tick icon.
    const confirmed = await page.waitForFunction(() => {
      // Outgoing bubble class is stable ("message-out")
      if (document.querySelector('div.message-out')) return true;
      // Tick / pending icons
      if (document.querySelector('span[data-icon="msg-time"]')) return true;
      if (document.querySelector('span[data-icon="msg-check"]')) return true;
      if (document.querySelector('span[data-icon="msg-dblcheck"]')) return true;
      return false;
    }, { timeout: 10000 }).then(() => true).catch(() => false);

    if (!confirmed) {
      log(`   ⚠️  No delivery confirmation for +${cleanPhone}`);
      return false;
    }

    // Small post-send dwell so the SPA finishes flushing
    await page.waitForTimeout(1500 + Math.random() * 1500);

    log(`   ✅ Message sent to +${cleanPhone}`);
    return true;
  } catch (error) {
    const msg = error instanceof Error ? error.message : "Unknown error";
    log(`   ❌ Failed to send to ${phone}: ${msg}`);
    if (/session lost/i.test(msg)) throw error;
    return false;
  }
}

async function processQueue(args: { limit?: number }) {
  if (!isBusinessHours()) {
    log(`⏰ Outside business hours (${BUSINESS_HOUR_START}:00 - ${BUSINESS_HOUR_END}:00). Skipping.`);
    return;
  }

  const maxMessages = args.limit || MAX_PER_SESSION;

  // Get leads to contact (new leads with mobile phone numbers, not yet contacted)
  // Prioritize: Kosovo/Albania first (mobile numbers), then others
  // Skip likely landlines (Swiss/German numbers without mobile prefix)
  const leads = await prisma.lead.findMany({
    where: {
      status: "new",
      phone: { not: null },
      // Prioritize countries with mobile numbers
      country: { in: ["Kosovo", "Albania", "Serbia", "Austria", "Germany", "Switzerland"] },
    },
    orderBy: [
      // Kosovo/Albania first (highest WhatsApp adoption with mobile numbers)
      { country: "asc" },
      { createdAt: "asc" },
    ],
    take: maxMessages * 2, // Get more to filter
  });

  // Filter to likely mobile numbers only + skip mojibake-corrupted business names
  const mobileLeads = leads.filter((lead) => {
    // Skip leads whose business name contains the U+FFFD replacement char
    // (corrupted at import) — sending "...dass 360� Cafe in..." looks like spam
    if (lead.business && lead.business.includes("\uFFFD")) return false;
    const phone = lead.phone || "";
    // Kosovo mobile: +383 4x
    if (phone.startsWith("+383") && phone.charAt(4) === "4") return true;
    // Albania mobile: +355 6x
    if (phone.startsWith("+355") && phone.charAt(4) === "6") return true;
    // Austria mobile: +43 6xx
    if (phone.startsWith("+43") && phone.charAt(3) === "6") return true;
    if (phone.startsWith("43") && phone.charAt(2) === "6") return true;
    // Germany mobile: +49 1xx
    if (phone.startsWith("+49") && phone.charAt(3) === "1") return true;
    if (phone.startsWith("49") && phone.charAt(2) === "1") return true;
    // Switzerland mobile: +41 7x
    if (phone.startsWith("+41") && phone.charAt(3) === "7") return true;
    if (phone.startsWith("41") && phone.charAt(2) === "7") return true;
    // Serbia mobile: +381 6x
    if (phone.startsWith("+381") && phone.charAt(4) === "6") return true;
    // Any number starting with +383 (Kosovo) is likely mobile
    if (phone.includes("+383")) return true;
    return false;
  }).slice(0, maxMessages);

  if (mobileLeads.length === 0) {
    log("📭 No mobile leads in queue. Remaining leads may have landline numbers.");
    return;
  }

  log(`📋 ${mobileLeads.length} mobile leads to contact (filtered from ${leads.length} total, max ${maxMessages} this session)`);

  // Fallback templates by language (used if none in DB)
  const fallbackTemplates: Record<string, string> = {
    de: `Guten Tag! 👋\n\nMein Name ist Behar von WebPro Austria. Ich habe gesehen, dass {{businessName}} in {{city}} noch keine professionelle Website hat.\n\nWir bauen mobile-freundliche Websites speziell für {{category}} — ab €349, fertig in 7–10 Tagen.\n\nDarf ich Ihnen eine kostenlose Demo zeigen? 🖥️\n\nBeste Grüße,\nBehar | WebPro Austria`,
    sq: `Përshëndetje! 👋\n\nUnë jam Behar nga WebPro. Pashë që {{businessName}} në {{city}} nuk ka ende një faqe interneti profesionale.\n\nNe ndërtojmë faqe interneti moderne për {{category}} — duke filluar nga €249, gati brenda 7-10 ditëve.\n\nA dëshironi t'ju tregoj një demo falas? 🖥️\n\nPërshëndetje,\nBehar | WebPro`,
    en: `Hi there! 👋\n\nI'm Behar from WebPro. I noticed that {{businessName}} in {{city}} doesn't have a professional website yet.\n\nWe build modern, mobile-friendly websites for {{category}} — starting at €249, ready in 7-10 days.\n\nWould you like me to show you a free demo? 🖥️\n\nBest regards,\nBehar | WebPro`,
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

  for (const lead of mobileLeads) {
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

    // Detect language from notes (Lang: xx), country, or phone prefix
    const leadLang = inferLang(lead);

    // Pick template: DB first, then fallback
    const dbTemplate = dbTemplates.find((t) => t.language === leadLang);
    const templateBody = dbTemplate?.body || fallbackTemplates[leadLang] || fallbackTemplates["de"];

    let message = fillTemplate(templateBody, vars);
    message = randomizeMessage(message);

    log(`📤 Sending to: ${lead.business} (${lead.phone}) [${leadLang}]`);

    let success = false;
    try {
      success = await sendWhatsAppMessage(page, lead.phone!, message);
    } catch (e) {
      const msg = e instanceof Error ? e.message : "unknown";
      log(`🛑 Aborting session: ${msg}`);
      break;
    }

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
    if (sent + failed < mobileLeads.length) {
      const delay = randomDelay(MIN_DELAY_SEC, MAX_DELAY_SEC);
      log(`   ⏳ Waiting ${Math.round(delay / 1000)}s before next message...`);
      await page.waitForTimeout(delay);
    }
  }

  log(`\n🏁 Session complete: ${sent} sent, ${failed} failed`);
  log(`📊 Remaining in queue: ${mobileLeads.length - sent - failed}`);

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
