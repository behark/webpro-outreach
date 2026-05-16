/**
 * Fast Email Finder — concurrent Playwright pool, EMAIL-ONLY.
 *
 * Targets the REAL prospects: businesses WITHOUT a website (and without an
 * email) — companies that actually need our service. Skips polished
 * institutions (hospitals, universities, banks, gov) that already have an IT
 * setup even if no `website` field is populated.
 *
 * Per lead (only stops at first hit, in priority order):
 *   1. Bing SERP (search "<business> <city> kontakt") → best organic result(s)
 *   2. Google Maps profile page (rendered) → looks for email in side panel
 *   3. Facebook page (if discovered from Maps) → /about page
 *   4. Instagram page (if discovered from Maps) → bio
 *
 * Runs N pages in parallel inside ONE browser context, so 500 leads complete
 * in ~10-15 minutes instead of hours.
 *
 * Usage:
 *   npx tsx scripts/email-finder-fast.ts --dry --limit=10 --concurrency=3
 *   npx tsx scripts/email-finder-fast.ts --limit=500 --concurrency=5
 *   npx tsx scripts/email-finder-fast.ts --country=Switzerland --limit=200
 *   npx tsx scripts/email-finder-fast.ts --include-with-site
 *
 * Writes only `Lead.email`. Skips FB/IG/website discovery for speed.
 */

import "dotenv/config";
import { chromium, type BrowserContext, type Page } from "playwright";
import { PrismaClient } from "../src/generated/prisma/client";
import { PrismaLibSql } from "@prisma/adapter-libsql";
import * as path from "path";
import * as fs from "fs";

const DB_PATH = path.resolve(__dirname, "../dev.db");
const adapter = new PrismaLibSql({ url: `file:${DB_PATH}` });
const prisma = new PrismaClient({ adapter });

const LOG_FILE = path.resolve(__dirname, "../logs/email-finder-fast.log");

function log(msg: string) {
  const line = `[${new Date().toISOString()}] ${msg}`;
  console.log(line);
  const dir = path.dirname(LOG_FILE);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  fs.appendFileSync(LOG_FILE, line + "\n");
}

// ===== EMAIL VALIDATION =====
const EMAIL_REGEX = /[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}/g;

const BLOCKED_SUBSTRINGS = [
  "example.com", "sentry", "wixpress", "googleapis", "w3.org",
  "schema.org", "gstatic", "googleusercontent", "youtube.com",
  "hotjar", "domain.com", "localhost", "cloudflare", "wordpress.org",
  "jquery", "gravatar", "facebook.com", "instagram.com",
  "google.com", "twitter.com", "tiktok.com", "linkedin.com",
  "@2x", ".png", ".jpg", ".svg", ".gif", ".css", ".js", ".webp",
  "noreply", "no-reply", "mailer-daemon", "postmaster",
  "abuse@", "security@", "privacy@", "dmca@", "copyright@",
  "wikipedia.org", "wikimedia.org", "u003e",
  // UI template placeholders frequently embedded in unfinished sites
  "untitledui.com", "@example.", "@placeholder.", "yourname@", "yourcompany.",
  "demo@", "test@", "sample@",
  // Aggregator / marketplace support addresses (NOT the merchant's email)
  "wolt.com", "treatwell.", "deliveroo.", "ubereats.", "uber.com",
  "lieferando.", "takeaway.", "doordash.", "smood.", "just-eat.",
  "yelp.com", "tripadvisor.", "fiverr.com", "upwork.com",
  "booking.com", "airbnb.", "expedia.", "hotels.com",
  "shopify.com", "wix.com", "squarespace.com", "godaddy.com",
  "mailchimp.", "sendgrid.", "intercom.", "hubspot.com",
];

function isValidEmail(email: string): boolean {
  const lower = email.toLowerCase();
  if (lower.length < 6 || lower.length > 60) return false;
  if (BLOCKED_SUBSTRINGS.some((p) => lower.includes(p))) return false;
  if (lower.includes("..") || lower.startsWith(".")) return false;
  const tld = lower.split(".").pop() || "";
  if (tld.length < 2 || tld.length > 6) return false;
  return true;
}

function scoreEmail(email: string): number {
  const lower = email.toLowerCase();
  if (lower.startsWith("info@")) return 100;
  if (lower.startsWith("office@")) return 95;
  if (lower.startsWith("kontakt@")) return 95;
  if (lower.startsWith("contact@")) return 90;
  if (lower.startsWith("hello@")) return 85;
  if (lower.startsWith("mail@")) return 80;
  if (lower.startsWith("anfrage@")) return 78;
  if (lower.startsWith("buchung@")) return 76;
  if (lower.startsWith("reservation") || lower.startsWith("reservierung")) return 75;
  if (lower.startsWith("service@")) return 70;
  if (lower.startsWith("team@")) return 65;
  const personal = ["@gmail.", "@hotmail.", "@yahoo.", "@outlook.", "@gmx.", "@web.de", "@t-online."];
  if (personal.some((p) => lower.includes(p))) return 50;
  return 60;
}

function extractBestEmail(text: string): string | null {
  const matches = text.match(EMAIL_REGEX) || [];
  const seen = new Set<string>();
  const valid: string[] = [];
  for (const m of matches) {
    const lower = m.toLowerCase();
    if (seen.has(lower)) continue;
    seen.add(lower);
    if (isValidEmail(lower)) valid.push(lower);
  }
  if (!valid.length) return null;
  return valid.sort((a, b) => scoreEmail(b) - scoreEmail(a))[0];
}

// ===== PROSPECT QUALITY FILTERS =====
const SKIP_PATTERNS = [
  /\busz\b/i, /\bkrankenhaus\b/i, /\bhospital\b/i, /\bspital\b/i,
  /\bklinik\b/i, /\bclinic\b/i, /\bmedical center\b/i,
  /\bethz?\b/i, /\buniversit/i, /\bhochschule\b/i, /\bfachhochschule\b/i,
  /\bschule\b/i, /\bschool\b/i, /\bkindergarten\b/i,
  /\bgymnasium\b/i, /\bcollege\b/i,
  /\bbank\b/i, /\bsparkasse\b/i, /\bversicherung\b/i, /\binsurance\b/i,
  /\bgemeinde\b/i, /\bstadt\b/i, /\bregierung\b/i, /\bministerium\b/i,
  /\bpolizei\b/i, /\bfeuerwehr\b/i,
  /\bAXA\b/, /\bAllianz\b/, /\bUBS\b/, /\bCredit Suisse\b/, /\bRaiffeisen\b/,
  /\bswisscom\b/i, /\bsalt\b/i, /\bsunrise\b/i,
  /\bpost ag\b/i, /\bbundesamt\b/i,
  /\u00d6BB|\u00d6sterreichische Bundesbahnen/, /\bSBB\b/, /\bDB AG\b/,
];

function isQualifiedProspect(business: string): boolean {
  if (!business) return false;
  if (business.includes("\uFFFD")) return false; // mojibake
  for (const re of SKIP_PATTERNS) if (re.test(business)) return false;
  return true;
}

// ===== PLAYWRIGHT HELPERS =====
const SKIP_RESULT_HOST = [
  "google.", "youtube.com", "facebook.com", "instagram.com",
  "twitter.com", "x.com", "tiktok.com", "linkedin.com",
  "pinterest.", "wikipedia.org", "wikimedia.org",
  "tripadvisor.", "yelp.", "bing.com", "duckduckgo.com",
  "amazon.", "ebay.", "microsoft.com", "msn.com",
];

async function safeGoto(page: Page, url: string, timeoutMs = 12000) {
  try {
    await page.goto(url, { waitUntil: "domcontentloaded", timeout: timeoutMs });
    return true;
  } catch {
    return false;
  }
}

async function pageEmail(page: Page): Promise<string | null> {
  try {
    const text = await page.evaluate(() => document.body?.innerText || "");
    if (text) {
      const e = extractBestEmail(text);
      if (e) return e;
    }
    // Also check raw HTML — mailto:href, encoded emails sometimes not in innerText
    const html = await page.content();
    return extractBestEmail(html);
  } catch {
    return null;
  }
}

async function bingTopResults(page: Page, query: string, max = 4): Promise<string[]> {
  const url = `https://www.bing.com/search?q=${encodeURIComponent(query)}&setlang=de`;
  if (!(await safeGoto(page, url, 10000))) return [];
  // Bing organic results live under .b_algo > h2 > a
  const hrefs = await page.evaluate(() =>
    Array.from(document.querySelectorAll(".b_algo h2 a"))
      .map((a) => (a as HTMLAnchorElement).href)
      .filter(Boolean)
  );
  const urls: string[] = [];
  for (const h of hrefs) {
    let host = "";
    try { host = new URL(h).hostname.toLowerCase(); } catch { continue; }
    if (SKIP_RESULT_HOST.some((s) => host.includes(s))) continue;
    if (urls.includes(h)) continue;
    urls.push(h);
    if (urls.length >= max) break;
  }
  return urls;
}

const CONTACT_PATHS = ["", "/kontakt", "/contact", "/impressum", "/about", "/ueber-uns"];

async function scrapeBusinessSite(page: Page, root: string): Promise<string | null> {
  let base = root.replace(/\/+$/, "");
  if (!/^https?:/i.test(base)) base = "https://" + base;
  for (const sub of CONTACT_PATHS) {
    if (!(await safeGoto(page, base + sub, 8000))) continue;
    const email = await pageEmail(page);
    if (email) return email;
  }
  return null;
}

// Optional FB / IG / Maps fallbacks — only if Bing path failed.
async function scrapeMaps(page: Page, mapsUrl: string): Promise<{
  email: string | null;
  website: string | null;
  facebook: string | null;
  instagram: string | null;
}> {
  const result = { email: null as string | null, website: null as string | null, facebook: null as string | null, instagram: null as string | null };
  if (!(await safeGoto(page, mapsUrl, 12000))) return result;
  await page.waitForTimeout(1500 + Math.random() * 1000);

  result.email = await pageEmail(page);

  try {
    const links = await page.evaluate(() =>
      Array.from(document.querySelectorAll("a[href]"))
        .map((a) => (a as HTMLAnchorElement).href)
        .filter((h) => h.startsWith("http"))
    );
    for (const href of links) {
      const low = href.toLowerCase();
      if (low.includes("facebook.com") && !result.facebook) result.facebook = href;
      else if (low.includes("instagram.com") && !result.instagram) result.instagram = href;
      else if (
        !result.website &&
        !low.includes("google.") &&
        !low.includes("gstatic") &&
        !low.includes("youtube") &&
        !low.includes("twitter") &&
        !low.includes("tiktok")
      ) {
        result.website = href;
      }
    }
  } catch { /* ignore */ }
  return result;
}

async function scrapeFacebookAbout(page: Page, fbUrl: string): Promise<string | null> {
  let url = fbUrl.replace(/\/+$/, "");
  if (!url.includes("/about")) url += "/about";
  if (!(await safeGoto(page, url, 10000))) return null;
  await page.waitForTimeout(1500);
  return pageEmail(page);
}

async function scrapeInstagramBio(page: Page, igUrl: string): Promise<string | null> {
  if (!(await safeGoto(page, igUrl, 10000))) return null;
  await page.waitForTimeout(1500);
  return pageEmail(page);
}

// ===== MAIN PER-LEAD FLOW =====
async function findEmailForLead(
  page: Page,
  lead: { business: string; city: string | null; googleMaps: string | null }
): Promise<{ email: string | null; source: string }> {
  const city = lead.city || "";
  const business = lead.business;

  // 1) Bing — find official site, then scrape contact page
  for (const q of [`${business} ${city} kontakt`, `${business} ${city} email`]) {
    const results = await bingTopResults(page, q, 3);
    for (const url of results) {
      const email = await scrapeBusinessSite(page, url);
      if (email) {
        let host = "";
        try { host = new URL(url).hostname; } catch { /* */ }
        return { email, source: `web:${host}` };
      }
    }
  }

  // 2) Google Maps profile (rendered)
  if (lead.googleMaps) {
    const maps = await scrapeMaps(page, lead.googleMaps);
    if (maps.email) return { email: maps.email, source: "maps" };

    // 3) Facebook fallback
    if (maps.facebook) {
      const e = await scrapeFacebookAbout(page, maps.facebook);
      if (e) return { email: e, source: "fb" };
    }
    // 4) Instagram fallback
    if (maps.instagram) {
      const e = await scrapeInstagramBio(page, maps.instagram);
      if (e) return { email: e, source: "ig" };
    }
    // 5) Website link from Maps profile
    if (maps.website) {
      const e = await scrapeBusinessSite(page, maps.website);
      if (e) {
        let host = "";
        try { host = new URL(maps.website).hostname; } catch { /* */ }
        return { email: e, source: `maps-site:${host}` };
      }
    }
  }

  return { email: null, source: "" };
}

// ===== POOL =====
async function runPool<T>(
  items: T[],
  concurrency: number,
  ctx: BrowserContext,
  worker: (item: T, page: Page, idx: number) => Promise<void>
) {
  let next = 0;
  const runners = Array.from({ length: concurrency }, async () => {
    const page = await ctx.newPage();
    try {
      while (true) {
        const i = next++;
        if (i >= items.length) return;
        try {
          await worker(items[i], page, i);
        } catch (e) {
          log(`worker err [${i}]: ${e instanceof Error ? e.message : "?"}`);
        }
      }
    } finally {
      await page.close().catch(() => {});
    }
  });
  await Promise.all(runners);
}

// ===== MAIN =====
async function main() {
  const args = process.argv.slice(2);
  const dryRun = args.includes("--dry");
  const includeWithSite = args.includes("--include-with-site");
  const limitArg = args.find((a) => a.startsWith("--limit="));
  const limit = limitArg ? parseInt(limitArg.split("=")[1]) : 500;
  const countryArg = args.find((a) => a.startsWith("--country="));
  const country = countryArg ? countryArg.split("=")[1] : undefined;
  const concArg = args.find((a) => a.startsWith("--concurrency="));
  const concurrency = concArg ? Math.max(1, Math.min(10, parseInt(concArg.split("=")[1]))) : 4;

  const where: Record<string, unknown> = {
    OR: [{ email: null }, { email: "" }],
  };
  if (!includeWithSite) {
    where.AND = [{ OR: [{ website: null }, { website: "" }] }];
  }
  if (country) where.country = country;

  const rawLeads = await prisma.lead.findMany({
    where,
    orderBy: { createdAt: "asc" },
    take: limit * 2,
    select: { id: true, business: true, city: true, googleMaps: true, country: true },
  });

  const qualified = rawLeads.filter((l) => isQualifiedProspect(l.business)).slice(0, limit);
  const dropped = rawLeads.length - qualified.length;

  log(`🔎 Fast email finder — ${qualified.length} qualified prospects (dropped ${dropped}, concurrency=${concurrency})`);
  log(`   filters: includeWithSite=${includeWithSite}, country=${country ?? "any"}, dry=${dryRun}`);

  if (!qualified.length) {
    log("Nothing to do.");
    await prisma.$disconnect();
    return;
  }

  const context = await chromium.launchPersistentContext(
    path.resolve(__dirname, "../.scraper-session"),
    {
      headless: true,
      args: ["--no-sandbox", "--disable-blink-features=AutomationControlled"],
      userAgent:
        "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
      locale: "de-AT",
      viewport: { width: 1280, height: 800 },
    }
  );

  let found = 0;
  let missed = 0;
  let done = 0;
  const sources: Record<string, number> = {};
  const start = Date.now();

  await runPool(qualified, concurrency, context, async (lead, page) => {
    const { email, source } = await findEmailForLead(page, lead);
    done++;
    if (email) {
      found++;
      const srcKey = source.split(":")[0] || source;
      sources[srcKey] = (sources[srcKey] || 0) + 1;
      if (!dryRun) {
        await prisma.lead
          .update({ where: { id: lead.id }, data: { email } })
          .catch((e) => log(`db update failed for ${lead.id}: ${e.message}`));
      }
      log(`✅ [${done}/${qualified.length}] ${lead.business} → ${email} (${source})`);
    } else {
      missed++;
      if (done % 20 === 0) {
        log(`… [${done}/${qualified.length}] found=${found} missed=${missed}`);
      }
    }
  });

  await context.close();

  const elapsed = ((Date.now() - start) / 1000).toFixed(1);
  log(`🏁 Done in ${elapsed}s — found=${found}, missed=${missed}, sources=${JSON.stringify(sources)}`);

  if (!dryRun) {
    const total = await prisma.lead.count({ where: { email: { not: null } } });
    log(`📊 Total leads with email in DB: ${total}`);
  }

  await prisma.$disconnect();
}

main().catch((e) => {
  log(`Fatal: ${e instanceof Error ? e.message : e}`);
  process.exit(1);
});
