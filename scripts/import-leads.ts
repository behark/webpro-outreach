/**
 * Import leads from all_leads_consolidated.json into the outreach database.
 * 
 * Usage: npx tsx scripts/import-leads.ts [options]
 * 
 * Options (via env vars):
 *   FILTER_COUNTRY=Austria    Only import leads from specific country
 *   FILTER_LANGUAGE=de        Only import German-language leads
 *   FILTER_NO_WEBSITE=true    Only import leads without websites
 *   FILTER_IS_LEAD=true       Only import scored leads (is_lead=true)
 *   LIMIT=1000                Limit number of imports
 *   DRY_RUN=true              Preview without inserting
 */

import { PrismaClient } from "../src/generated/prisma/client";
import { PrismaLibSql } from "@prisma/adapter-libsql";
import * as fs from "fs";
import * as path from "path";

const DB_PATH = path.resolve(__dirname, "../dev.db");
const adapter = new PrismaLibSql({
  url: process.env.DATABASE_URL ?? `file:${DB_PATH}`,
});
const prisma = new PrismaClient({ adapter });

interface RawLead {
  place_id?: string;
  name: string;
  address?: string;
  city?: string;
  country?: string;
  tier?: number;
  language?: string;
  phone?: string;
  normalized_phone?: string;
  whatsapp_link?: string;
  website?: string;
  has_website?: boolean;
  rating?: number;
  review_count?: number;
  maps_url?: string;
  business_status?: string;
  category?: string;
  primary_type?: string;
  scraped_at?: string;
  lead_score?: number;
  is_lead?: boolean;
  email?: string;
}

async function main() {
  const filePath = path.resolve("/home/bb/Downloads/all_leads_consolidated.json");
  console.log(`📂 Reading ${filePath}...`);

  const raw = fs.readFileSync(filePath);
  let text = raw.toString("utf-8").replace(/[\x00-\x08\x0b\x0c\x0e-\x1f\x7f-\x9f]/g, "");

  // Parse with fallback for malformed entries
  let allLeads: RawLead[] = [];
  try {
    allLeads = JSON.parse(text);
  } catch {
    console.log("⚠️  JSON has encoding issues, parsing object by object...");
    const inner = text.trim().replace(/^\[/, "").replace(/\]$/, "");
    const objects = inner.split(/\}\s*,\s*\{/);
    for (const objStr of objects) {
      let s = objStr.trim();
      if (!s.startsWith("{")) s = "{" + s;
      if (!s.endsWith("}")) s = s + "}";
      try {
        allLeads.push(JSON.parse(s));
      } catch {
        // Skip malformed entries
      }
    }
  }

  console.log(`✅ Parsed ${allLeads.length} leads from file\n`);

  // Apply filters
  let filtered = allLeads;

  const filterCountry = process.env.FILTER_COUNTRY;
  if (filterCountry) {
    filtered = filtered.filter((l) => l.country?.toLowerCase() === filterCountry.toLowerCase());
    console.log(`🔍 Filter country="${filterCountry}": ${filtered.length} leads`);
  }

  const filterLanguage = process.env.FILTER_LANGUAGE;
  if (filterLanguage) {
    filtered = filtered.filter((l) => l.language === filterLanguage);
    console.log(`🔍 Filter language="${filterLanguage}": ${filtered.length} leads`);
  }

  if (process.env.FILTER_NO_WEBSITE === "true") {
    filtered = filtered.filter((l) => !l.has_website);
    console.log(`🔍 Filter no website: ${filtered.length} leads`);
  }

  if (process.env.FILTER_IS_LEAD === "true") {
    filtered = filtered.filter((l) => l.is_lead === true);
    console.log(`🔍 Filter is_lead=true: ${filtered.length} leads`);
  }

  const limit = parseInt(process.env.LIMIT || "0");
  if (limit > 0) {
    filtered = filtered.slice(0, limit);
    console.log(`🔍 Limit: ${filtered.length} leads`);
  }

  console.log(`\n📊 Ready to import ${filtered.length} leads`);
  console.log(`   Countries: ${[...new Set(filtered.map((l) => l.country))].join(", ")}`);
  console.log(`   Categories: ${[...new Set(filtered.map((l) => l.category))].slice(0, 10).join(", ")}...`);

  if (process.env.DRY_RUN === "true") {
    console.log("\n🏁 DRY RUN — no data inserted.");
    console.log("   Remove DRY_RUN=true to actually import.");
    await prisma.$disconnect();
    return;
  }

  // Import in batches
  const BATCH_SIZE = 500;
  let imported = 0;
  let skipped = 0;

  for (let i = 0; i < filtered.length; i += BATCH_SIZE) {
    const batch = filtered.slice(i, i + BATCH_SIZE);
    const data = batch.map((lead) => ({
      name: lead.name || "Unknown",
      business: lead.name || "Unknown",
      category: lead.category || lead.primary_type || "business",
      email: lead.email || null,
      phone: lead.normalized_phone || lead.phone || null,
      website: lead.has_website ? (lead.website || null) : null,
      address: lead.address || null,
      city: lead.city || null,
      country: lead.country || "Unknown",
      instagram: null,
      facebook: null,
      googleMaps: lead.maps_url || null,
      status: "new",
      source: "import",
      notes: [
        lead.lead_score ? `Score: ${lead.lead_score}` : null,
        lead.rating ? `Rating: ${lead.rating}⭐ (${lead.review_count} reviews)` : null,
        lead.language ? `Lang: ${lead.language}` : null,
        lead.has_website ? null : "NO WEBSITE ✓",
        lead.whatsapp_link ? `WA: ${lead.whatsapp_link}` : null,
      ]
        .filter(Boolean)
        .join(" | "),
    }));

    try {
      const result = await prisma.lead.createMany({ data });
      imported += result.count;
    } catch (error) {
      // If batch fails, try one by one
      for (const item of data) {
        try {
          await prisma.lead.create({ data: item });
          imported++;
        } catch {
          skipped++;
        }
      }
    }

    const pct = Math.round(((i + batch.length) / filtered.length) * 100);
    process.stdout.write(`\r⏳ Importing... ${pct}% (${imported} imported, ${skipped} skipped)`);
  }

  console.log(`\n\n🎉 Done! Imported ${imported} leads, skipped ${skipped}`);
  
  const totalInDb = await prisma.lead.count();
  console.log(`📊 Total leads in database: ${totalInDb}`);

  await prisma.$disconnect();
}

main().catch((e) => {
  console.error("❌ Error:", e);
  process.exit(1);
});
