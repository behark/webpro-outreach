/**
 * Worldwide Lead Discovery — finds businesses WITHOUT websites via OpenStreetMap.
 *
 * Uses the Overpass API (no key, free, fully global) to query OSM for POIs in
 * categories that typically need a website, filtered server-side to only those
 * with no `website` / `contact:website` / `url` tag set.
 *
 * Saves directly to the Lead table with source="osm", status="new". Dedupes
 * against existing rows by phone (when present) and by business+city.
 *
 * After running this, kick off `email-finder-fast.ts` to enrich the new rows
 * with emails (looks up each on Bing + Maps + Facebook).
 *
 * Usage:
 *   npx tsx scripts/lead-discovery.ts --country=Italy --limit=2000
 *   npx tsx scripts/lead-discovery.ts --countries=Spain,Portugal,Greece
 *   npx tsx scripts/lead-discovery.ts --country=Germany --category=hairdresser
 *   npx tsx scripts/lead-discovery.ts --preset=dach --limit=5000
 *   npx tsx scripts/lead-discovery.ts --preset=eu --dry
 *   npx tsx scripts/lead-discovery.ts --bbox=41.8,12.3,42.0,12.6   # custom area (lat1,lon1,lat2,lon2)
 *
 * Notes:
 *   - Overpass throttles aggressively; we serialise queries and back off on 429
 *   - Email field stays empty here — run email-finder-fast.ts afterwards
 *   - Idempotent: re-running won't create duplicates (phone or business+city match)
 */

import "dotenv/config";
import * as path from "path";
import * as fs from "fs";
import { PrismaClient } from "../src/generated/prisma/client";
import { PrismaLibSql } from "@prisma/adapter-libsql";

const DB_PATH = path.resolve(__dirname, "../dev.db");
const adapter = new PrismaLibSql({ url: `file:${DB_PATH}` });
const prisma = new PrismaClient({ adapter });

const LOG_FILE = path.resolve(__dirname, "../logs/lead-discovery.log");

function log(msg: string) {
  const line = `[${new Date().toISOString()}] ${msg}`;
  console.log(line);
  const dir = path.dirname(LOG_FILE);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  fs.appendFileSync(LOG_FILE, line + "\n");
}

// ===== OVERPASS =====
// Pool of mirrors; we'll rotate on 429/timeout.
const OVERPASS_ENDPOINTS = [
  "https://overpass-api.de/api/interpreter",
  "https://overpass.kumi.systems/api/interpreter",
  "https://overpass.osm.ch/api/interpreter",
  "https://overpass.openstreetmap.fr/api/interpreter",
];

// OSM tag groups → categories we store in Lead.category
// Pick categories where a custom website meaningfully helps the merchant.
const CATEGORY_TAGS: Record<string, string[]> = {
  restaurant: [
    "amenity=restaurant", "amenity=fast_food", "amenity=cafe",
    "amenity=bar", "amenity=pub", "amenity=biergarten",
    "amenity=food_court", "amenity=ice_cream",
  ],
  bakery: ["shop=bakery", "shop=confectionery", "shop=pastry"],
  butcher: ["shop=butcher", "shop=cheese", "shop=deli"],
  hairdresser: ["shop=hairdresser", "shop=beauty", "shop=cosmetics", "shop=perfumery"],
  barber: ["shop=hairdresser"], // OSM has no separate barber tag — same as hairdresser
  beauty: ["shop=beauty", "shop=cosmetics", "shop=nail_salon", "shop=tattoo", "shop=massage"],
  fitness: ["leisure=fitness_centre", "leisure=sports_centre", "leisure=dance"],
  hotel: ["tourism=hotel", "tourism=guest_house", "tourism=hostel", "tourism=motel", "tourism=apartment", "tourism=chalet"],
  dentist: ["amenity=dentist"],
  doctor: ["amenity=doctors", "amenity=clinic", "healthcare=doctor"],
  optician: ["shop=optician"],
  pharmacy: ["amenity=pharmacy"],
  veterinary: ["amenity=veterinary"],
  car_repair: ["shop=car_repair", "shop=car_parts", "amenity=car_wash"],
  shop: [
    "shop=clothes", "shop=shoes", "shop=jewelry", "shop=gift",
    "shop=furniture", "shop=electronics", "shop=mobile_phone",
    "shop=bicycle", "shop=florist", "shop=toys", "shop=sports",
    "shop=books", "shop=stationery", "shop=art",
  ],
  craft: [
    "craft=carpenter", "craft=electrician", "craft=plumber",
    "craft=painter", "craft=tiler", "craft=roofer", "craft=blacksmith",
    "craft=jeweller", "craft=photographer", "craft=tailor", "craft=shoemaker",
  ],
  professional: [
    "office=lawyer", "office=accountant", "office=architect",
    "office=estate_agent", "office=tax_advisor", "office=insurance",
    "office=consulting", "office=travel_agent", "office=advertising_agency",
  ],
};

// "All" = union of every group above
const DEFAULT_CATEGORIES = Object.keys(CATEGORY_TAGS);

const PRESETS: Record<string, string[]> = {
  dach: ["Germany", "Austria", "Switzerland"],
  ex_yu: ["Kosovo", "Albania", "Serbia", "North Macedonia", "Montenegro", "Bosnia and Herzegovina", "Croatia", "Slovenia"],
  benelux: ["Netherlands", "Belgium", "Luxembourg"],
  nordics: ["Sweden", "Norway", "Denmark", "Finland", "Iceland"],
  southern_eu: ["Italy", "Spain", "Portugal", "Greece", "Malta", "Cyprus"],
  central_eu: ["Czechia", "Slovakia", "Hungary", "Poland", "Romania", "Bulgaria"],
  eu: [
    "Germany", "Austria", "Switzerland", "France", "Netherlands", "Belgium",
    "Italy", "Spain", "Portugal", "Greece", "Czechia", "Poland",
    "Sweden", "Denmark", "Ireland", "Finland", "Norway",
  ],
  english: ["United Kingdom", "Ireland", "United States", "Canada", "Australia", "New Zealand"],
  world: [
    // A curated 300-country pass — enough to keep Overpass happy but cover most SMB markets
    "Germany", "Austria", "Switzerland", "France", "Italy", "Spain", "Portugal",
    "Netherlands", "Belgium", "United Kingdom", "Ireland", "Poland", "Czechia",
    "Greece", "Sweden", "Denmark", "Norway", "Finland", "Hungary",
    "Romania", "Croatia", "Slovenia", "Slovakia", "Bulgaria",
    "United States", "Canada", "Australia", "New Zealand", "Mexico", "Brazil",
  ],
};

// Country bounding boxes [south, west, north, east].
// Big countries are split into multiple tiles to keep each Overpass query
// under the 60s timeout. We don't need to be precise — neighbor-country
// overflow is acceptable since the worker tags each lead with `country` and
// downstream language inference handles cross-border names fine.
const COUNTRY_BBOX: Record<string, [number, number, number, number][]> = {
  // Small/medium European countries — one tile is enough
  Austria:     [[46.37, 9.53, 49.02, 17.16]],
  Switzerland: [[45.81, 5.95, 47.81, 10.49]],
  Slovenia:    [[45.42, 13.37, 46.88, 16.61]],
  Croatia:     [[42.39, 13.49, 46.55, 19.45]],
  Slovakia:    [[47.73, 16.83, 49.61, 22.57]],
  Czechia:     [[48.55, 12.09, 51.06, 18.86]],
  Hungary:     [[45.74, 16.11, 48.59, 22.90]],
  Belgium:     [[49.50, 2.54, 51.51, 6.41]],
  Netherlands: [[50.75, 3.31, 53.62, 7.23]],
  Luxembourg:  [[49.45, 5.74, 50.18, 6.53]],
  Ireland:     [[51.39, -10.67, 55.43, -5.99]],
  Portugal:    [[36.96, -9.53, 42.15, -6.18]],
  Greece:      [[34.80, 19.37, 41.75, 28.25]],
  Denmark:     [[54.56, 8.07, 57.75, 15.20]],
  Norway:      [[57.99, 4.45, 71.20, 31.16]],
  Finland:     [[59.81, 20.55, 70.09, 31.59]],
  Romania:     [[43.62, 20.26, 48.27, 29.71]],
  Bulgaria:    [[41.23, 22.36, 44.22, 28.61]],
  Albania:     [[39.65, 19.30, 42.66, 21.06]],
  Kosovo:      [[41.85, 20.01, 43.27, 21.79]],
  "North Macedonia": [[40.85, 20.45, 42.37, 23.04]],
  Montenegro:  [[41.85, 18.45, 43.56, 20.36]],
  "Bosnia and Herzegovina": [[42.55, 15.73, 45.28, 19.62]],
  Serbia:      [[42.23, 18.83, 46.19, 23.01]],
  "New Zealand": [[-47.29, 166.43, -34.39, 178.55]],

  // Big countries — split into tiles
  Germany: [
    [47.27, 5.87, 51.50, 10.50],   // SW
    [47.27, 10.50, 51.50, 15.05],  // SE
    [51.50, 5.87, 55.06, 10.50],   // NW
    [51.50, 10.50, 55.06, 15.05],  // NE
  ],
  France: [
    [41.33, -5.15, 47.00, 2.00],
    [41.33, 2.00, 47.00, 9.56],
    [47.00, -5.15, 51.10, 2.00],
    [47.00, 2.00, 51.10, 9.56],
  ],
  Italy: [
    [35.49, 6.62, 41.50, 12.50],
    [35.49, 12.50, 41.50, 18.52],
    [41.50, 6.62, 47.10, 12.50],
    [41.50, 12.50, 47.10, 18.52],
  ],
  Spain: [
    [35.95, -9.39, 40.00, -2.00],
    [35.95, -2.00, 40.00, 4.33],
    [40.00, -9.39, 43.80, -2.00],
    [40.00, -2.00, 43.80, 4.33],
  ],
  Poland: [
    [49.00, 14.12, 52.50, 19.50],
    [49.00, 19.50, 52.50, 24.15],
    [52.50, 14.12, 54.84, 19.50],
    [52.50, 19.50, 54.84, 24.15],
  ],
  "United Kingdom": [
    [49.84, -8.65, 54.00, -2.00],
    [49.84, -2.00, 54.00, 1.76],
    [54.00, -8.65, 60.86, -2.00],
    [54.00, -2.00, 60.86, 1.76],
  ],
  Sweden: [
    [55.34, 10.95, 62.00, 19.00],
    [55.34, 19.00, 62.00, 24.17],
    [62.00, 10.95, 69.07, 19.00],
    [62.00, 19.00, 69.07, 24.17],
  ],
  "United States": [
    // Continental US split into 3x3
    [24.40, -125.00, 37.00, -107.00],
    [24.40, -107.00, 37.00, -90.00],
    [24.40, -90.00, 37.00, -66.90],
    [37.00, -125.00, 45.00, -107.00],
    [37.00, -107.00, 45.00, -90.00],
    [37.00, -90.00, 45.00, -66.90],
    [45.00, -125.00, 49.40, -107.00],
    [45.00, -107.00, 49.40, -90.00],
    [45.00, -90.00, 49.40, -66.90],
  ],
  Canada: [
    [42.00, -141.00, 55.00, -110.00],
    [42.00, -110.00, 55.00, -80.00],
    [42.00, -80.00, 55.00, -52.00],
    [55.00, -141.00, 70.00, -90.00],
    [55.00, -90.00, 70.00, -52.00],
  ],
  Mexico: [
    [14.53, -117.13, 23.00, -97.00],
    [14.53, -97.00, 23.00, -86.71],
    [23.00, -117.13, 32.72, -97.00],
    [23.00, -97.00, 32.72, -86.71],
  ],
  Brazil: [
    [-34.00, -73.99, -15.00, -50.00],
    [-34.00, -50.00, -15.00, -34.79],
    [-15.00, -73.99, 5.27, -50.00],
    [-15.00, -50.00, 5.27, -34.79],
  ],
  Australia: [
    [-44.00, 113.00, -27.00, 135.00],
    [-44.00, 135.00, -27.00, 154.00],
    [-27.00, 113.00, -10.00, 135.00],
    [-27.00, 135.00, -10.00, 154.00],
  ],
};

// Build a bbox-scoped Overpass QL query for a SINGLE OSM tag.
// Unioning 8 tags in one query causes timeouts on big bboxes (e.g. Germany
// quarter for amenity=restaurant ∪ cafe ∪ bar...); querying each tag
// separately lets Overpass use its spatial index efficiently.
function buildQuery(bbox: [number, number, number, number], tag: string, cap: number, timeoutSec = 50): string {
  const [s, w, n, e] = bbox;
  const [k, v] = tag.split("=");
  return `[out:json][timeout:${timeoutSec}];
nwr["${k}"="${v}"][!"website"][!"contact:website"][!"url"](${s},${w},${n},${e});
out center tags ${cap};`;
}

async function postOverpass(body: string, endpointIndex = 0, attempt = 0): Promise<unknown> {
  if (attempt >= 6) throw new Error("overpass: exhausted retries");
  const endpoint = OVERPASS_ENDPOINTS[endpointIndex % OVERPASS_ENDPOINTS.length];
  const ac = new AbortController();
  const t = setTimeout(() => ac.abort(), 120_000);
  try {
    const res = await fetch(endpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        "User-Agent": "webpro-outreach lead-discovery (contact: info@beharkabashi.com)",
      },
      body: "data=" + encodeURIComponent(body),
      signal: ac.signal,
    });
    clearTimeout(t);

    if (res.status === 429 || res.status === 504 || res.status === 503) {
      const wait = 5_000 * (attempt + 1) + Math.random() * 5_000;
      log(`overpass ${res.status} on ${endpoint} — backoff ${Math.round(wait / 1000)}s, switching mirror`);
      await new Promise((r) => setTimeout(r, wait));
      return postOverpass(body, endpointIndex + 1, attempt + 1);
    }

    if (!res.ok) {
      const text = await res.text().catch(() => "");
      throw new Error(`overpass ${res.status}: ${text.slice(0, 200)}`);
    }
    return (await res.json()) as unknown;
  } catch (err) {
    clearTimeout(t);
    if (attempt < 5) {
      const wait = 3_000 * (attempt + 1) + Math.random() * 3_000;
      log(`overpass error (${err instanceof Error ? err.message : "?"}) — retry in ${Math.round(wait / 1000)}s`);
      await new Promise((r) => setTimeout(r, wait));
      return postOverpass(body, endpointIndex + 1, attempt + 1);
    }
    throw err;
  }
}

// ===== ELEMENT NORMALISATION =====
interface OverpassElement {
  type: "node" | "way" | "relation";
  id: number;
  lat?: number;
  lon?: number;
  center?: { lat: number; lon: number };
  tags?: Record<string, string>;
}

interface RawLead {
  business: string;
  category: string;
  phone: string | null;
  email: string | null;
  address: string | null;
  city: string | null;
  country: string;
  website: null;
  googleMaps: string | null;
  facebook: string | null;
  instagram: string | null;
}

function normalisePhone(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const cleaned = raw.replace(/[^\d+]/g, "").replace(/^00/, "+");
  if (cleaned.length < 6 || cleaned.length > 20) return null;
  return cleaned;
}

function elementToLead(el: OverpassElement, country: string, category: string): RawLead | null {
  const t = el.tags || {};
  const business = t["name"] || t["operator"] || t["brand"];
  if (!business || business.length < 2 || business.length > 120) return null;

  const lat = el.lat ?? el.center?.lat;
  const lon = el.lon ?? el.center?.lon;

  // Build a Google Maps link so the enricher has somewhere to land
  const googleMaps =
    lat != null && lon != null
      ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(business)}&query_place_id=${encodeURIComponent(`${lat},${lon}`)}`
      : null;

  const street = [t["addr:street"], t["addr:housenumber"]].filter(Boolean).join(" ");
  const city = t["addr:city"] || t["addr:town"] || t["addr:village"] || t["addr:suburb"] || null;
  const address = [street, t["addr:postcode"], city].filter(Boolean).join(", ") || null;

  return {
    business: business.trim(),
    category,
    phone: normalisePhone(t["phone"] || t["contact:phone"] || t["mobile"] || t["contact:mobile"]),
    email: (t["email"] || t["contact:email"] || "").toLowerCase().trim() || null,
    address,
    city,
    country,
    website: null,
    googleMaps,
    facebook: t["contact:facebook"] || (t["contact:facebook"] ? `https://facebook.com/${t["contact:facebook"]}` : null) || null,
    instagram: t["contact:instagram"] || null,
  };
}

// ===== DEDUP + WRITE =====
async function existingPhoneSet(): Promise<Set<string>> {
  const rows = await prisma.lead.findMany({ where: { phone: { not: null } }, select: { phone: true } });
  return new Set(rows.map((r) => (r.phone || "").replace(/[^\d+]/g, "")).filter(Boolean));
}

async function existingBusinessKeys(): Promise<Set<string>> {
  const rows = await prisma.lead.findMany({ select: { business: true, city: true } });
  return new Set(
    rows.map((r) => `${(r.business || "").toLowerCase().trim()}|${(r.city || "").toLowerCase().trim()}`)
  );
}

async function saveBatch(leads: RawLead[], dry: boolean): Promise<number> {
  if (!leads.length) return 0;
  if (dry) return leads.length;

  // Prisma createMany — skipDuplicates isn't supported on sqlite, do per-row inserts
  let written = 0;
  for (const l of leads) {
    try {
      await prisma.lead.create({
        data: {
          name: l.business,
          business: l.business,
          category: l.category,
          email: l.email,
          phone: l.phone,
          website: null,
          address: l.address,
          city: l.city,
          country: l.country,
          instagram: l.instagram,
          facebook: l.facebook,
          googleMaps: l.googleMaps,
          status: "new",
          source: "osm",
          notes: "NO WEBSITE ✓",
        },
      });
      written++;
    } catch (e) {
      // unique-constraint or transient — skip silently
      void e;
    }
  }
  return written;
}

// ===== ORCHESTRATION =====
async function discoverCountry(
  country: string,
  categories: string[],
  perCategoryLimit: number,
  dry: boolean,
  phoneSet: Set<string>,
  busSet: Set<string>
): Promise<{ found: number; written: number }> {
  const tiles = COUNTRY_BBOX[country];
  if (!tiles || !tiles.length) {
    log(`⚠ no bbox for "${country}" — add it to COUNTRY_BBOX. Skipping.`);
    return { found: 0, written: 0 };
  }
  let countryFound = 0;
  let countryWritten = 0;

  for (const cat of categories) {
    const tags = CATEGORY_TAGS[cat];
    if (!tags) continue;

    let allElements: OverpassElement[] = [];
    let tilesWithCap = false;
    // Per (tile × tag) cap so each query stays small and fast
    const perQueryCap = Math.max(15, Math.ceil((perCategoryLimit * 3) / (tiles.length * tags.length)));

    // Iterate every (tile × tag) pair; bail early once we have enough material
    outer: for (const tile of tiles) {
      for (const tag of tags) {
        const query = buildQuery(tile, tag, perQueryCap);
        let raw: unknown;
        try {
          raw = await postOverpass(query);
        } catch (e) {
          log(`  ✗ ${country} / ${cat} / ${tag} / ${tile.join(",")}: ${e instanceof Error ? e.message : "?"}`);
          continue;
        }
        const els = ((raw as { elements?: OverpassElement[] }).elements || []) as OverpassElement[];
        allElements = allElements.concat(els);

        // Polite delay between Overpass queries (1.2s) — small queries, light load
        await new Promise((r) => setTimeout(r, 1200 + Math.random() * 800));

        // If we already have enough raw material to satisfy the per-category cap
        // after dedup losses, stop early. Otherwise we'd waste queries.
        if (allElements.length >= perCategoryLimit * 2) {
          tilesWithCap = true;
          break outer;
        }
      }
    }
    void tilesWithCap;

    // Now dedupe + convert to RawLead, capped at perCategoryLimit per (country, cat)
    const candidates: RawLead[] = [];
    for (const el of allElements) {
      const lead = elementToLead(el, country, cat);
      if (!lead) continue;

      const phoneKey = (lead.phone || "").replace(/[^\d+]/g, "");
      if (phoneKey && phoneSet.has(phoneKey)) continue;
      const busKey = `${lead.business.toLowerCase().trim()}|${(lead.city || "").toLowerCase().trim()}`;
      if (busSet.has(busKey)) continue;

      if (phoneKey) phoneSet.add(phoneKey);
      busSet.add(busKey);

      candidates.push(lead);
      if (candidates.length >= perCategoryLimit) break;
    }

    countryFound += candidates.length;
    const written = await saveBatch(candidates, dry);
    countryWritten += written;
    log(`  ${country} / ${cat.padEnd(13)} → ${allElements.length.toString().padStart(5)} OSM hits (${tiles.length} tile${tiles.length > 1 ? "s" : ""}), ${candidates.length} new, ${written} ${dry ? "would-write" : "written"}`);
  }

  return { found: countryFound, written: countryWritten };
}

// ===== MAIN =====
async function main() {
  const args = process.argv.slice(2);
  const dryRun = args.includes("--dry");
  const limitArg = args.find((a) => a.startsWith("--limit="));
  const totalLimit = limitArg ? parseInt(limitArg.split("=")[1]) : 5000;

  const presetArg = args.find((a) => a.startsWith("--preset="));
  const countryArg = args.find((a) => a.startsWith("--country="));
  const countriesArg = args.find((a) => a.startsWith("--countries="));
  const categoryArg = args.find((a) => a.startsWith("--category="));

  let countries: string[] = [];
  if (countryArg) countries = [countryArg.split("=")[1]];
  else if (countriesArg) countries = countriesArg.split("=")[1].split(",").map((s) => s.trim()).filter(Boolean);
  else if (presetArg) {
    const p = presetArg.split("=")[1];
    countries = PRESETS[p] || [];
    if (!countries.length) {
      log(`Unknown preset "${p}". Known: ${Object.keys(PRESETS).join(", ")}`);
      process.exit(2);
    }
  } else {
    countries = PRESETS.dach;
  }

  const categories = categoryArg ? [categoryArg.split("=")[1]] : DEFAULT_CATEGORIES;
  const invalid = categories.filter((c) => !CATEGORY_TAGS[c]);
  if (invalid.length) {
    log(`Unknown category: ${invalid.join(", ")}. Known: ${DEFAULT_CATEGORIES.join(", ")}`);
    process.exit(2);
  }

  // Distribute the total budget roughly across (countries × categories)
  const perCategoryLimit = Math.max(20, Math.ceil(totalLimit / Math.max(1, countries.length * categories.length)));

  log(`🌍 Lead Discovery (OSM)`);
  log(`   countries: ${countries.join(", ")}`);
  log(`   categories: ${categories.join(", ")}`);
  log(`   per-category cap: ${perCategoryLimit} (total target ${totalLimit})`);
  log(`   dry: ${dryRun}`);

  log(`📚 Loading existing dedup keys...`);
  const phoneSet = await existingPhoneSet();
  const busSet = await existingBusinessKeys();
  log(`   ${phoneSet.size} existing phones, ${busSet.size} existing business+city keys`);

  const start = Date.now();
  let totalFound = 0;
  let totalWritten = 0;

  for (const country of countries) {
    log(`▶ ${country}`);
    const { found, written } = await discoverCountry(country, categories, perCategoryLimit, dryRun, phoneSet, busSet);
    totalFound += found;
    totalWritten += written;
    log(`◀ ${country} subtotal: ${found} new (${written} ${dryRun ? "would-write" : "written"})`);
  }

  const elapsed = ((Date.now() - start) / 1000).toFixed(1);
  log(`🏁 Done in ${elapsed}s — ${totalFound} new candidates, ${totalWritten} ${dryRun ? "would-write" : "written"}`);

  if (!dryRun && totalWritten > 0) {
    const total = await prisma.lead.count();
    const noSite = await prisma.lead.count({ where: { OR: [{ website: null }, { website: "" }] } });
    log(`📊 DB now has ${total} leads (${noSite} without website)`);
    log(`💡 Next: enrich emails with`);
    log(`     npx tsx scripts/email-finder-fast.ts --limit=2000 --concurrency=5`);
  }

  await prisma.$disconnect();
}

main().catch((e) => {
  log(`Fatal: ${e instanceof Error ? e.message : e}`);
  process.exit(1);
});
