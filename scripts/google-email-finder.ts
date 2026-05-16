/**
 * Email Finder v3 — Direct Platform Scraping
 * 
 * NO Google searching. Goes directly to:
 *   1. Google Maps page (from lead's googleMaps URL) → scrape email + social links
 *   2. Facebook page (if found on Maps) → scrape email from About section
 *   3. Instagram page (if found on Maps) → scrape email from bio
 *   4. Business website (if found on Maps) → scrape email from contact page
 * 
 * Usage:
 *   npx tsx scripts/google-email-finder.ts              # All leads without email
 *   npx tsx scripts/google-email-finder.ts --limit=100
 *   npx tsx scripts/google-email-finder.ts --country=Kosovo
 *   npx tsx scripts/google-email-finder.ts --dry-run
 */

import { chromium, type Page } from "playwright";
import { PrismaClient } from "../src/generated/prisma/client";
import { PrismaLibSql } from "@prisma/adapter-libsql";
import * as path from "path";
import * as fs from "fs";

const DB_PATH = path.resolve(__dirname, "../dev.db");
const adapter = new PrismaLibSql({ url: `file:${DB_PATH}` });
const prisma = new PrismaClient({ adapter });

const LOG_FILE = path.resolve(__dirname, "../logs/email-finder.log");

function log(msg: string) {
  const line = `[${new Date().toISOString()}] ${msg}`;
  console.log(line);
  const logDir = path.dirname(LOG_FILE);
  if (!fs.existsSync(logDir)) fs.mkdirSync(logDir, { recursive: true });
  fs.appendFileSync(LOG_FILE, line + "\n");
}

// ===== EMAIL VALIDATION =====
const EMAIL_REGEX = /[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}/g;

const BLACKLIST = [
  "example.com", "sentry", "wixpress", "googleapis", "w3.org",
  "schema.org", "gstatic", "googleusercontent", "youtube.com",
  "hotjar", "domain.com", "localhost", "cloudflare", "wordpress.org",
  "jquery", "gravatar", ".png", ".jpg", ".svg", ".gif", ".css", ".js",
  "noreply", "no-reply", "mailer-daemon", "postmaster", "@2x",
  "logo@", "icon@", "abuse@", "security@", "privacy@",
  "facebook.com", "instagram.com", "google.com", "twitter.com",
];

function isValidEmail(email: string): boolean {
  const lower = email.toLowerCase();
  if (lower.length > 50 || lower.length < 6) return false;
  if (BLACKLIST.some(p => lower.includes(p))) return false;
  if (lower.includes("..") || lower.startsWith(".")) return false;
  const tld = lower.split(".").pop() || "";
  if (tld.length < 2 || tld.length > 6) return false;
  return true;
}

function scoreEmail(email: string): number {
  const lower = email.toLowerCase();
  if (lower.startsWith("info@")) return 100;
  if (lower.startsWith("office@")) return 95;
  if (lower.startsWith("contact@")) return 90;
  if (lower.startsWith("kontakt@")) return 90;
  if (lower.startsWith("hello@")) return 85;
  if (lower.startsWith("mail@")) return 80;
  if (lower.startsWith("service@")) return 75;
  if (lower.includes("@gmail.") || lower.includes("@hotmail.") || lower.includes("@yahoo.") || lower.includes("@outlook.")) return 70;
  return 60;
}

function extractBestEmail(text: string): string | null {
  const matches = text.match(EMAIL_REGEX) || [];
  const valid = [...new Set(matches.map(e => e.toLowerCase()))].filter(isValidEmail);
  if (valid.length === 0) return null;
  return valid.sort((a, b) => scoreEmail(b) - scoreEmail(a))[0];
}

// ===== PLATFORM SCRAPERS =====

/** Scrape Google Maps business page — get email, website, FB, IG links */
async function scrapeGoogleMaps(page: Page, mapsUrl: string): Promise<{
  email: string | null;
  website: string | null;
  facebook: string | null;
  instagram: string | null;
}> {
  const result = { email: null as string | null, website: null as string | null, facebook: null as string | null, instagram: null as string | null };

  try {
    await page.goto(mapsUrl, { waitUntil: "domcontentloaded", timeout: 15000 });
    await page.waitForTimeout(3000 + Math.random() * 2000);

    // Scroll the side panel to load all info
    const sidePanel = page.locator('[role="main"]').first();
    if (await sidePanel.isVisible().catch(() => false)) {
      await sidePanel.evaluate(el => el.scrollTop = el.scrollHeight);
      await page.waitForTimeout(1000);
    }

    // Click "About" tab if it exists (shows social links + more info)
    const aboutTab = page.locator('button:has-text("About"), button:has-text("Über")').first();
    if (await aboutTab.isVisible().catch(() => false)) {
      await aboutTab.click();
      await page.waitForTimeout(2000);
    }

    // Get all visible text + HTML
    const pageText = await page.locator("body").innerText().catch(() => "");
    const pageHtml = await page.content().catch(() => "");

    // Extract email from Maps page (rare but possible)
    result.email = extractBestEmail(pageText);

    // Grab ALL links from page (website, social, etc.)
    const allLinks = await page.evaluate(() => {
      return Array.from(document.querySelectorAll("a[href]"))
        .map(a => ({ href: a.getAttribute("href") || "", text: a.textContent || "" }))
        .filter(l => l.href.startsWith("http") && !l.href.includes("google.com") && !l.href.includes("gstatic"));
    });

    for (const link of allLinks) {
      const href = link.href.toLowerCase();
      if (href.includes("facebook.com") && !result.facebook) result.facebook = link.href;
      else if (href.includes("instagram.com") && !result.instagram) result.instagram = link.href;
      else if (!result.website && !href.includes("youtube.com") && !href.includes("twitter.com") && !href.includes("tiktok.com")) {
        result.website = link.href;
      }
    }

    // Also check HTML for social links (sometimes in data attributes)
    if (!result.facebook) {
      const fbMatch = pageHtml.match(/https?:\/\/(?:www\.)?facebook\.com\/[a-zA-Z0-9._\-\/]+/i);
      if (fbMatch) result.facebook = fbMatch[0];
    }
    if (!result.instagram) {
      const igMatch = pageHtml.match(/https?:\/\/(?:www\.)?instagram\.com\/[a-zA-Z0-9._\-\/]+/i);
      if (igMatch) result.instagram = igMatch[0];
    }
  } catch { /* skip */ }

  return result;
}

/** Scrape Facebook page for email */
async function scrapeFacebook(page: Page, fbUrl: string): Promise<string | null> {
  try {
    // Go to the About section of the Facebook page
    let aboutUrl = fbUrl.replace(/\/$/, "");
    if (!aboutUrl.includes("/about")) aboutUrl += "/about";

    await page.goto(aboutUrl, { waitUntil: "domcontentloaded", timeout: 12000 });
    await page.waitForTimeout(2000 + Math.random() * 1000);

    const text = await page.locator("body").innerText().catch(() => "");
    return extractBestEmail(text);
  } catch { return null; }
}

/** Scrape Instagram page for email in bio */
async function scrapeInstagram(page: Page, igUrl: string): Promise<string | null> {
  try {
    await page.goto(igUrl, { waitUntil: "domcontentloaded", timeout: 12000 });
    await page.waitForTimeout(2000 + Math.random() * 1000);

    const text = await page.locator("body").innerText().catch(() => "");
    return extractBestEmail(text);
  } catch { return null; }
}

/** Scrape business website for email */
async function scrapeWebsite(page: Page, siteUrl: string): Promise<string | null> {
  try {
    if (!siteUrl.startsWith("http")) siteUrl = "https://" + siteUrl;
    await page.goto(siteUrl, { waitUntil: "domcontentloaded", timeout: 10000 });
    await page.waitForTimeout(1500);

    let text = await page.locator("body").innerText().catch(() => "");
    let email = extractBestEmail(text);
    if (email) return email;

    // Try contact/impressum pages
    for (const sub of ["/kontakt", "/contact", "/impressum", "/about"]) {
      try {
        await page.goto(siteUrl.replace(/\/$/, "") + sub, { waitUntil: "domcontentloaded", timeout: 8000 });
        await page.waitForTimeout(1000);
        text = await page.locator("body").innerText().catch(() => "");
        email = extractBestEmail(text);
        if (email) return email;
      } catch { /* skip */ }
    }
  } catch { /* skip */ }
  return null;
}

// ===== MAIN =====
async function main() {
  const args = process.argv.slice(2);
  const dryRun = args.includes("--dry-run");
  const limitArg = args.find(a => a.startsWith("--limit="));
  const limit = limitArg ? parseInt(limitArg.split("=")[1]) : 500;
  const countryArg = args.find(a => a.startsWith("--country="));
  const country = countryArg ? countryArg.split("=")[1] : undefined;

  // Get leads WITH googleMaps link but WITHOUT email
  const where: Record<string, unknown> = {
    OR: [{ email: null }, { email: "" }],
    googleMaps: { not: null },
  };
  if (country) where.country = country;

  const leads = await prisma.lead.findMany({
    where,
    orderBy: { createdAt: "asc" },
    take: limit,
  });

  log(`🔍 Email Finder v3 (Direct Platform Scraping) — ${leads.length} leads`);
  if (country) log(`   Country: ${country}`);
  if (dryRun) log(`   DRY RUN`);
  log(`   Flow: Google Maps → Facebook → Instagram → Website`);

  const context = await chromium.launchPersistentContext(
    path.resolve(__dirname, "../.scraper-session"),
    {
      headless: true,
      args: ["--no-sandbox", "--disable-blink-features=AutomationControlled"],
      userAgent: "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
      locale: "de-AT",
    }
  );

  const page = await context.newPage();

  let found = 0;
  let notFound = 0;
  const sources = { maps: 0, fb: 0, ig: 0, web: 0 };

  for (let i = 0; i < leads.length; i++) {
    const lead = leads[i];
    const business = lead.business || lead.name;
    let email: string | null = null;
    let src = "";

    try {
      // Step 1: Scrape Google Maps
      const mapsData = await scrapeGoogleMaps(page, lead.googleMaps!);

      if (mapsData.email) {
        email = mapsData.email;
        src = "Maps";
        sources.maps++;
      }

      // Step 2: Try Facebook (if found on Maps and no email yet)
      if (!email && mapsData.facebook) {
        email = await scrapeFacebook(page, mapsData.facebook);
        if (email) { src = "FB"; sources.fb++; }
      }

      // Step 3: Try Instagram
      if (!email && mapsData.instagram) {
        email = await scrapeInstagram(page, mapsData.instagram);
        if (email) { src = "IG"; sources.ig++; }
      }

      // Step 4: Try website
      if (!email && (mapsData.website || lead.website)) {
        email = await scrapeWebsite(page, mapsData.website || lead.website!);
        if (email) { src = "Web"; sources.web++; }
      }

      // Save social links to DB even if no email found
      if (!dryRun && (mapsData.facebook || mapsData.instagram)) {
        const updateData: Record<string, string> = {};
        if (mapsData.facebook && !lead.facebook) updateData.facebook = mapsData.facebook;
        if (mapsData.instagram && !lead.instagram) updateData.instagram = mapsData.instagram;
        if (Object.keys(updateData).length > 0) {
          await prisma.lead.update({ where: { id: lead.id }, data: updateData });
        }
      }

    } catch (error) {
      const msg = error instanceof Error ? error.message : "unknown";
      if (!msg.includes("timeout")) {
        log(`\n   ⚠️  ${business}: ${msg}`);
      }
    }

    if (email) {
      found++;
      if (!dryRun) {
        await prisma.lead.update({
          where: { id: lead.id },
          data: { email },
        });
      }
      process.stdout.write(`\r[${Math.round(((i+1)/leads.length)*100)}%] ${i+1}/${leads.length} | ✅ ${found} | ${business} → ${email} [${src}]                    `);
    } else {
      notFound++;
      process.stdout.write(`\r[${Math.round(((i+1)/leads.length)*100)}%] ${i+1}/${leads.length} | ✅ ${found} | ❌ ${business}                    `);
    }

    // Delay between leads
    await page.waitForTimeout(1000 + Math.random() * 1000);
  }

  await context.close();

  log(`\n\n🏁 Done!`);
  log(`   ✅ Emails found: ${found} (Maps: ${sources.maps}, FB: ${sources.fb}, IG: ${sources.ig}, Web: ${sources.web})`);
  log(`   ❌ Not found: ${notFound}`);

  if (!dryRun) {
    const total = await prisma.lead.count({ where: { email: { not: null } } });
    log(`   📊 Total leads with email in DB: ${total}`);

    const fbCount = await prisma.lead.count({ where: { facebook: { not: null } } });
    const igCount = await prisma.lead.count({ where: { instagram: { not: null } } });
    log(`   📱 Social links found: ${fbCount} FB, ${igCount} IG`);
  }

  await prisma.$disconnect();
}

main().catch((e) => {
  console.error("❌ Fatal:", e.message);
  process.exit(1);
});
