"use client";

import { useState } from "react";
import { Mail, Phone, Globe, MessageCircle, Trash2 } from "lucide-react";

type Lead = {
  id: string;
  name: string;
  business: string;
  category: string;
  email: string | null;
  phone: string | null;
  website: string | null;
  address: string | null;
  city: string | null;
  country: string;
  instagram: string | null;
  facebook: string | null;
  googleMaps: string | null;
  status: string;
  source: string;
  notes: string | null;
  createdAt: Date;
  _count: { messages: number };
};

const STATUS_OPTIONS = ["new", "contacted", "replied", "meeting", "won", "lost"];
const STATUS_COLORS: Record<string, string> = {
  new: "bg-amber-500/20 text-amber-300",
  contacted: "bg-blue-500/20 text-blue-300",
  replied: "bg-green-500/20 text-green-300",
  meeting: "bg-purple-500/20 text-purple-300",
  won: "bg-emerald-500/20 text-emerald-300",
  lost: "bg-red-500/20 text-red-300",
};

export default function LeadTable({ leads }: { leads: Lead[] }) {
  const [filter, setFilter] = useState("all");
  const [search, setSearch] = useState("");

  const filtered = leads.filter((lead) => {
    if (filter !== "all" && lead.status !== filter) return false;
    if (search && !lead.business.toLowerCase().includes(search.toLowerCase()) &&
        !lead.city?.toLowerCase().includes(search.toLowerCase())) return false;
    return true;
  });

  async function updateStatus(id: string, status: string) {
    await fetch("/api/leads/" + id, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status }),
    });
    window.location.reload();
  }

  async function deleteLead(id: string) {
    if (!confirm("Delete this lead?")) return;
    await fetch("/api/leads/" + id, { method: "DELETE" });
    window.location.reload();
  }

  return (
    <div>
      {/* Filters */}
      <div className="flex flex-wrap items-center gap-3 mb-4">
        <input
          type="text"
          placeholder="Search business or city..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="bg-slate-800 border border-slate-700 rounded-lg px-4 py-2 text-sm text-white placeholder-slate-500 w-64 focus:outline-none focus:border-blue-500"
        />
        <div className="flex gap-1">
          {["all", ...STATUS_OPTIONS].map((s) => (
            <button
              key={s}
              onClick={() => setFilter(s)}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium capitalize transition-colors ${
                filter === s ? "bg-blue-600 text-white" : "bg-slate-800 text-slate-400 hover:text-white"
              }`}
            >
              {s}
            </button>
          ))}
        </div>
      </div>

      {/* Table */}
      <div className="bg-slate-800/50 border border-slate-700/50 rounded-xl overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-slate-700/50">
              <th className="text-left p-3 text-slate-400 font-medium">Business</th>
              <th className="text-left p-3 text-slate-400 font-medium">City</th>
              <th className="text-left p-3 text-slate-400 font-medium">Category</th>
              <th className="text-left p-3 text-slate-400 font-medium">Status</th>
              <th className="text-left p-3 text-slate-400 font-medium">Contact</th>
              <th className="text-left p-3 text-slate-400 font-medium">Msgs</th>
              <th className="text-left p-3 text-slate-400 font-medium"></th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((lead) => (
              <tr key={lead.id} className="border-b border-slate-700/30 hover:bg-slate-800/80 transition-colors">
                <td className="p-3">
                  <p className="text-white font-medium">{lead.business}</p>
                  <p className="text-xs text-slate-500">{lead.name}</p>
                </td>
                <td className="p-3 text-slate-300">{lead.city || "—"}</td>
                <td className="p-3 text-slate-300 capitalize">{lead.category}</td>
                <td className="p-3">
                  <select
                    value={lead.status}
                    onChange={(e) => updateStatus(lead.id, e.target.value)}
                    className={`text-xs px-2 py-1 rounded-full border-0 cursor-pointer ${STATUS_COLORS[lead.status] || "bg-slate-700 text-slate-300"}`}
                  >
                    {STATUS_OPTIONS.map((s) => (
                      <option key={s} value={s}>{s}</option>
                    ))}
                  </select>
                </td>
                <td className="p-3">
                  <div className="flex gap-2">
                    {lead.email && (
                      <a href={`mailto:${lead.email}`} title={lead.email} className="text-slate-400 hover:text-blue-400">
                        <Mail size={14} />
                      </a>
                    )}
                    {lead.phone && (
                      <a href={`https://wa.me/${lead.phone.replace(/[^0-9]/g, "")}`} title={lead.phone} target="_blank" className="text-slate-400 hover:text-green-400">
                        <MessageCircle size={14} />
                      </a>
                    )}
                    {lead.website && (
                      <a href={lead.website} target="_blank" title={lead.website} className="text-slate-400 hover:text-cyan-400">
                        <Globe size={14} />
                      </a>
                    )}
                    {lead.instagram && (
                      <a href={lead.instagram} target="_blank" title="Instagram" className="text-slate-400 hover:text-pink-400">
                        <span className="text-xs">IG</span>
                      </a>
                    )}
                  </div>
                </td>
                <td className="p-3 text-slate-400">{lead._count.messages}</td>
                <td className="p-3">
                  <button
                    onClick={() => deleteLead(lead.id)}
                    className="text-slate-500 hover:text-red-400 transition-colors"
                  >
                    <Trash2 size={14} />
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {filtered.length === 0 && (
          <p className="text-center text-slate-500 py-8">No leads found</p>
        )}
      </div>
    </div>
  );
}
