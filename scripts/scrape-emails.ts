/**
 * Email Scraper — Finds business emails from websites and Google search
 * 
 * Strategy:
 * 1. If lead has a website → scrape it for email addresses
 * 2. If no website → Google search "{business name} {city} email" and scrape results
 * 
 * Usage:
 *   npx tsx scripts/scrape-emails.ts                # Scrape all leads without emails
 *   npx tsx scripts/scrape-emails.ts --limit=100    # Limit to 100 leads
 *   npx tsx scripts/scrape-emails.ts --country=Austria
 *   npx tsx scripts/scrape-emails.ts --dry-run      # Preview without updating DB
 */

import { PrismaClient } from "../src/generated/prisma/client";
import { PrismaLibSql } from "@prisma/adapter-libsql";
import * as path from "path";
import * as https from "https";

const DB_PATH = path.resolve(__dirname, "../dev.db");
const adapter = new PrismaLibSql({ url: `file:${DB_PATH}` });
const prisma = new PrismaClient({ adapter });

// ===== EMAIL EXTRACTION =====
const EMAIL_REGEX = /[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}/g;

// Filter out junk emails
const JUNK_DOMAINS = [
  "example.com", "sentry.io", "wixpress.com", "googleapis.com",
  "w3.org", "schema.org", "facebook.com", "twitter.com",
  "instagram.com", "google.com", "wordpress.org", "jquery.com",
  "cloudflare.com", "gstatic.com", "gravatar.com",
  "sentry-next.wixpress.com", "hotjar.com", "domain.com", "2x.png",
];

const JUNK_PREFIXES = [
  "noreply", "no-reply", "mailer-daemon", "postmaster",
  "webmaster", "admin@localhost", "test@", "user@",
];

function isValidBusinessEmail(email: string): boolean {
  const lower = email.toLowerCase();
  if (lower.length > 60) return false;
  if (JUNK_DOMAINS.some(d => lower.endsWith(`@${d}`))) return false;
  if (JUNK_PREFIXES.some(p => lower.startsWith(p))) return false;
  if (lower.includes("..") || lower.startsWith(".")) return false;
  // Prefer info@, office@, contact@, hello@ etc
  return true;
}

function scoreEmail(email: string): number {
  const lower = email.toLowerCase();
  if (lower.startsWith("info@")) return 100;
  if (lower.startsWith("office@")) return 95;
  if (lower.startsWith("contact@")) return 90;
  if (lower.startsWith("hello@")) return 85;
  if (lower.startsWith("mail@")) return 80;
  if (lower.startsWith("anfrage@")) return 80; // German for inquiry
  if (lower.startsWith("kontakt@")) return 80; // German for contact
  if (lower.startsWith("buchung@")) return 75; // German for booking
  if (lower.startsWith("salon@")) return 70;
  if (lower.startsWith("service@")) return 70;
  if (lower.startsWith("team@")) return 65;
  return 50;
}

function extractEmails(html: string): string[] {
  const matches = html.match(EMAIL_REGEX) || [];
  const unique = [...new Set(matches.map(e => e.toLowerCase()))];
  return unique
    .filter(isValidBusinessEmail)
    .sort((a, b) => scoreEmail(b) - scoreEmail(a));
}

// ===== HTTP FETCH =====
function fetchUrl(url: string, timeout = 8000, depth = 0): Promise<string> {
  if (depth > 3) return Promise.reject(new Error("too many redirects"));

  // Force https if http
  if (url.startsWith("http://")) {
    url = url.replace("http://", "https://");
  }

  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("timeout")), timeout);

    const req = https.get(url, {
      headers: {
        "User-Agent": "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 Chrome/120.0.0.0 Safari/537.36",
        "Accept": "text/html,application/xhtml+xml",
        "Accept-Language": "de-AT,de;q=0.9,en;q=0.8",
      },
      rejectUnauthorized: false,
    }, (res) => {
      // Follow redirects
      if (res.statusCode && res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        clearTimeout(timer);
        const redirect = res.headers.location.startsWith("http")
          ? res.headers.location
          : new URL(res.headers.location, url).toString();
        fetchUrl(redirect, timeout, depth + 1).then(resolve).catch(reject);
        return;
      }

      let data = "";
      res.on("data", (chunk) => { data += chunk; });
      res.on("end", () => { clearTimeout(timer); resolve(data); });
      res.on("error", (e) => { clearTimeout(timer); reject(e); });
    });

    req.on("error", (e) => { clearTimeout(timer); reject(e); });
  });
}

// ===== GOOGLE SEARCH =====
async function googleSearchEmail(business: string, city: string): Promise<string[]> {
  const query = encodeURIComponent(`"${business}" ${city} email kontakt`);
  const url = `https://www.google.com/search?q=${query}&num=5&hl=de`;

  try {
    const html = await fetchUrl(url, 10000);
    return extractEmails(html);
  } catch {
    return [];
  }
}

// ===== MAIN =====
async function main() {
  const args = process.argv.slice(2);
  const dryRun = args.includes("--dry-run");
  const limitArg = args.find(a => a.startsWith("--limit="));
  const limit = limitArg ? parseInt(limitArg.split("=")[1]) : 0;
  const countryArg = args.find(a => a.startsWith("--country="));
  const country = countryArg ? countryArg.split("=")[1] : undefined;

  // Get leads without emails — prioritize those with websites
  const where: Record<string, unknown> = {
    OR: [{ email: null }, { email: "" }],
  };
  if (country) {
    where.country = country;
  }

  // First get leads WITH websites (highest chance of finding email)
  const leadsWithSite = await prisma.lead.findMany({
    where: { ...where, website: { not: null } },
    orderBy: { createdAt: "asc" },
    take: limit || undefined,
  });

  // Then get remaining leads without websites (will try Google)
  const remaining = (limit || 0) - leadsWithSite.length;
  const leadsWithoutSite = remaining > 0 ? await prisma.lead.findMany({
    where: { ...where, OR: [{ website: null }, { website: "" }] },
    orderBy: { createdAt: "asc" },
    take: remaining,
  }) : [];

  const leads = [...leadsWithSite, ...leadsWithoutSite];

  console.log(`📧 Email Scraper — ${leads.length} leads to process`);
  if (country) console.log(`   Filter: country=${country}`);
  if (dryRun) console.log(`   DRY RUN — no DB updates`);
  console.log("");

  let found = 0;
  let notFound = 0;
  let errors = 0;

  for (let i = 0; i < leads.length; i++) {
    const lead = leads[i];
    const pct = Math.round(((i + 1) / leads.length) * 100);
    process.stdout.write(`\r[${pct}%] ${i + 1}/${leads.length} | Found: ${found} | `);

    let emails: string[] = [];

    // Strategy 1: Scrape website if available
    if (lead.website) {
      try {
        let siteUrl = lead.website;
        if (!siteUrl.startsWith("http")) siteUrl = "https://" + siteUrl;
        const html = await fetchUrl(siteUrl);
        emails = extractEmails(html);

        // Also try /contact, /kontakt, /impressum pages
        if (emails.length === 0) {
          for (const page of ["/kontakt", "/contact", "/impressum", "/about"]) {
            try {
              const pageHtml = await fetchUrl(siteUrl.replace(/\/$/, "") + page);
              const pageEmails = extractEmails(pageHtml);
              if (pageEmails.length > 0) {
                emails = pageEmails;
                break;
              }
            } catch { /* skip */ }
          }
        }
      } catch {
        errors++;
      }
    }

    // Strategy 2: Google search fallback
    if (emails.length === 0) {
      emails = await googleSearchEmail(lead.business || lead.name, lead.city || "");
      // Small delay to avoid Google rate limit
      await new Promise(r => setTimeout(r, 1500 + Math.random() * 1000));
    }

    if (emails.length > 0) {
      const bestEmail = emails[0];
      found++;
      process.stdout.write(`✅ ${lead.business} → ${bestEmail}`);

      if (!dryRun) {
        await prisma.lead.update({
          where: { id: lead.id },
          data: { email: bestEmail },
        });
      }
    } else {
      notFound++;
    }

    // Small delay between requests
    await new Promise(r => setTimeout(r, 500 + Math.random() * 500));
  }

  console.log(`\n\n🏁 Done!`);
  console.log(`   ✅ Emails found: ${found}`);
  console.log(`   ❌ Not found: ${notFound}`);
  console.log(`   ⚠️  Errors: ${errors}`);

  if (!dryRun && found > 0) {
    const withEmail = await prisma.lead.count({ where: { email: { not: null } } });
    console.log(`   📊 Total leads with email: ${withEmail}`);
  }

  await prisma.$disconnect();
}

main().catch((e) => {
  console.error("❌ Fatal:", e.message);
  process.exit(1);
});
