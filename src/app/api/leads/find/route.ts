import { NextRequest, NextResponse } from "next/server";

// Google Places API - Text Search
export async function POST(req: NextRequest) {
  const { query, city, category } = await req.json();
  const apiKey = process.env.GOOGLE_PLACES_API_KEY;

  if (!apiKey) {
    return NextResponse.json(
      { error: "GOOGLE_PLACES_API_KEY not configured. Add it to your .env file." },
      { status: 500 }
    );
  }

  const searchQuery = query || `${category || "restaurant"} in ${city || "Wels"} Austria`;

  try {
    // Using Places API (New) Text Search
    const response = await fetch(
      "https://places.googleapis.com/v1/places:searchText",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Goog-Api-Key": apiKey,
          "X-Goog-FieldMask": "places.displayName,places.formattedAddress,places.nationalPhoneNumber,places.internationalPhoneNumber,places.websiteUri,places.googleMapsUri,places.types",
        },
        body: JSON.stringify({
          textQuery: searchQuery,
          languageCode: "de",
          locationBias: {
            rectangle: {
              low: { latitude: 46.3, longitude: 9.5 },   // SW Austria
              high: { latitude: 49.0, longitude: 17.2 },  // NE Austria
            },
          },
          maxResultCount: 20,
        }),
      }
    );

    if (!response.ok) {
      const err = await response.text();
      return NextResponse.json({ error: `Google API error: ${err}` }, { status: response.status });
    }

    const data = await response.json();
    const places = (data.places || []).map((place: Record<string, unknown>) => ({
      business: (place.displayName as Record<string, string>)?.text || "Unknown",
      name: (place.displayName as Record<string, string>)?.text || "Unknown",
      address: place.formattedAddress as string || "",
      phone: (place.internationalPhoneNumber || place.nationalPhoneNumber || "") as string,
      website: (place.websiteUri || "") as string,
      googleMaps: (place.googleMapsUri || "") as string,
      category: category || "restaurant",
      city: city || "",
      source: "google_places",
    }));

    return NextResponse.json({ results: places, query: searchQuery });
  } catch (error) {
    return NextResponse.json(
      { error: `Failed to search: ${error instanceof Error ? error.message : "Unknown error"}` },
      { status: 500 }
    );
  }
}
