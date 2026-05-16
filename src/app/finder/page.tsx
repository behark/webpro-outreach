"use client";

import { useState } from "react";
import { Search, Plus, MapPin, Phone, Globe, CheckCircle, Loader2 } from "lucide-react";

type PlaceResult = {
  business: string;
  name: string;
  address: string;
  phone: string;
  website: string;
  googleMaps: string;
  category: string;
  city: string;
  source: string;
};

const CATEGORIES = [
  "restaurant",
  "friseur",
  "cafe",
  "bäckerei",
  "werkstatt",
  "autoservice",
  "pizzeria",
  "kebab",
  "bar",
  "hotel",
  "fitnessstudio",
  "arzt",
  "zahnarzt",
  "apotheke",
];

const CITIES = ["Wels", "Wien", "Linz", "Graz", "Salzburg", "Innsbruck", "Villach", "Klagenfurt", "St. Pölten"];

export default function FinderPage() {
  const [city, setCity] = useState("Wels");
  const [category, setCategory] = useState("restaurant");
  const [customQuery, setCustomQuery] = useState("");
  const [results, setResults] = useState<PlaceResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [saved, setSaved] = useState<Set<number>>(new Set());
  const [savingAll, setSavingAll] = useState(false);

  async function searchPlaces() {
    setLoading(true);
    setError("");
    setResults([]);
    setSaved(new Set());

    try {
      const res = await fetch("/api/leads/find", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          query: customQuery || undefined,
          city,
          category,
        }),
      });
      const data = await res.json();
      if (data.error) {
        setError(data.error);
      } else {
        setResults(data.results || []);
      }
    } catch {
      setError("Network error. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  async function saveLead(index: number) {
    const place = results[index];
    try {
      await fetch("/api/leads", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(place),
      });
      setSaved((prev) => new Set([...prev, index]));
    } catch {
      alert("Failed to save lead");
    }
  }

  async function saveAll() {
    setSavingAll(true);
    const unsaved = results.filter((_, i) => !saved.has(i));
    try {
      await fetch("/api/leads", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(unsaved),
      });
      setSaved(new Set(results.map((_, i) => i)));
    } catch {
      alert("Failed to save leads");
    } finally {
      setSavingAll(false);
    }
  }

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-white">Lead Finder</h1>
        <p className="text-slate-400 mt-1">Search businesses on Google Maps and add them to your pipeline</p>
      </div>

      {/* Search Controls */}
      <div className="bg-slate-800/50 border border-slate-700/50 rounded-xl p-5 mb-6">
        <div className="grid md:grid-cols-4 gap-4 mb-4">
          <div>
            <label className="block text-xs text-slate-400 mb-1.5">City</label>
            <select
              value={city}
              onChange={(e) => setCity(e.target.value)}
              className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2.5 text-sm text-white focus:outline-none focus:border-blue-500"
            >
              {CITIES.map((c) => (
                <option key={c} value={c}>{c}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-xs text-slate-400 mb-1.5">Category</label>
            <select
              value={category}
              onChange={(e) => setCategory(e.target.value)}
              className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2.5 text-sm text-white capitalize focus:outline-none focus:border-blue-500"
            >
              {CATEGORIES.map((c) => (
                <option key={c} value={c} className="capitalize">{c}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-xs text-slate-400 mb-1.5">Custom Search (optional)</label>
            <input
              type="text"
              value={customQuery}
              onChange={(e) => setCustomQuery(e.target.value)}
              placeholder="e.g. Balkan restaurant Wels"
              className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2.5 text-sm text-white placeholder-slate-500 focus:outline-none focus:border-blue-500"
            />
          </div>
          <div className="flex items-end">
            <button
              onClick={searchPlaces}
              disabled={loading}
              className="w-full flex items-center justify-center gap-2 bg-blue-600 hover:bg-blue-700 disabled:bg-blue-800 text-white px-4 py-2.5 rounded-lg text-sm font-medium transition-colors"
            >
              {loading ? <Loader2 size={16} className="animate-spin" /> : <Search size={16} />}
              {loading ? "Searching..." : "Search"}
            </button>
          </div>
        </div>
        {error && (
          <div className="bg-red-500/10 border border-red-500/30 rounded-lg p-3 text-sm text-red-300">
            {error}
          </div>
        )}
      </div>

      {/* Results */}
      {results.length > 0 && (
        <div>
          <div className="flex items-center justify-between mb-4">
            <p className="text-sm text-slate-400">
              Found <span className="text-white font-medium">{results.length}</span> businesses
            </p>
            <button
              onClick={saveAll}
              disabled={savingAll || saved.size === results.length}
              className="flex items-center gap-2 bg-green-600 hover:bg-green-700 disabled:bg-green-800 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors"
            >
              {savingAll ? <Loader2 size={14} className="animate-spin" /> : <Plus size={14} />}
              Save All to Pipeline
            </button>
          </div>

          <div className="grid gap-3">
            {results.map((place, i) => (
              <div
                key={i}
                className={`bg-slate-800/50 border rounded-xl p-4 flex items-center justify-between transition-colors ${
                  saved.has(i) ? "border-green-500/30 bg-green-500/5" : "border-slate-700/50"
                }`}
              >
                <div className="flex-1">
                  <h3 className="text-white font-medium">{place.business}</h3>
                  <div className="flex flex-wrap gap-3 mt-1.5 text-xs text-slate-400">
                    {place.address && (
                      <span className="flex items-center gap-1">
                        <MapPin size={12} /> {place.address}
                      </span>
                    )}
                    {place.phone && (
                      <span className="flex items-center gap-1">
                        <Phone size={12} /> {place.phone}
                      </span>
                    )}
                    {place.website && (
                      <a href={place.website} target="_blank" className="flex items-center gap-1 text-blue-400 hover:underline">
                        <Globe size={12} /> Website
                      </a>
                    )}
                  </div>
                </div>
                <div>
                  {saved.has(i) ? (
                    <span className="flex items-center gap-1 text-green-400 text-sm">
                      <CheckCircle size={16} /> Saved
                    </span>
                  ) : (
                    <button
                      onClick={() => saveLead(i)}
                      className="flex items-center gap-1 bg-slate-700 hover:bg-slate-600 text-white px-3 py-1.5 rounded-lg text-sm transition-colors"
                    >
                      <Plus size={14} /> Add
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Empty state */}
      {!loading && results.length === 0 && !error && (
        <div className="text-center py-16">
          <Search size={48} className="text-slate-600 mx-auto mb-4" />
          <h3 className="text-lg font-medium text-slate-300">Search for businesses</h3>
          <p className="text-slate-500 mt-1">Select a city and category, then click Search to find potential leads</p>
        </div>
      )}
    </div>
  );
}
