"use client";

import { useState, useEffect } from "react";
import { Plus, Play, Pause, Mail, MessageCircle, Loader2 } from "lucide-react";

type Campaign = {
  id: string;
  name: string;
  description: string | null;
  status: string;
  channel: string;
  createdAt: string;
  _count: { leads: number; steps: number };
};

export default function CampaignsPage() {
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [form, setForm] = useState({ name: "", description: "", channel: "email" });

  useEffect(() => {
    fetchCampaigns();
  }, []);

  async function fetchCampaigns() {
    const res = await fetch("/api/campaigns");
    const data = await res.json();
    setCampaigns(data);
    setLoading(false);
  }

  async function createCampaign() {
    await fetch("/api/campaigns", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(form),
    });
    setShowCreate(false);
    setForm({ name: "", description: "", channel: "email" });
    fetchCampaigns();
  }

  async function toggleStatus(id: string, currentStatus: string) {
    const newStatus = currentStatus === "active" ? "paused" : "active";
    await fetch(`/api/campaigns/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: newStatus }),
    });
    fetchCampaigns();
  }

  const channelIcon = (ch: string) => {
    if (ch === "whatsapp") return <MessageCircle size={14} className="text-green-400" />;
    return <Mail size={14} className="text-blue-400" />;
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-white">Campaigns</h1>
          <p className="text-slate-400 mt-1">Manage outreach sequences for your leads</p>
        </div>
        <button
          onClick={() => setShowCreate(true)}
          className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white px-4 py-2.5 rounded-lg text-sm font-medium transition-colors"
        >
          <Plus size={16} /> New Campaign
        </button>
      </div>

      {/* Create Campaign Modal */}
      {showCreate && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50" onClick={() => setShowCreate(false)}>
          <div className="bg-slate-800 border border-slate-700 rounded-xl p-6 w-full max-w-md" onClick={(e) => e.stopPropagation()}>
            <h2 className="text-lg font-bold text-white mb-4">Create Campaign</h2>
            <div className="space-y-4">
              <div>
                <label className="block text-xs text-slate-400 mb-1.5">Campaign Name</label>
                <input
                  type="text"
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                  placeholder="e.g. Restaurants Wels - Woche 1"
                  className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2.5 text-sm text-white placeholder-slate-500 focus:outline-none focus:border-blue-500"
                />
              </div>
              <div>
                <label className="block text-xs text-slate-400 mb-1.5">Description (optional)</label>
                <textarea
                  value={form.description}
                  onChange={(e) => setForm({ ...form, description: e.target.value })}
                  placeholder="Notes about this campaign..."
                  className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2.5 text-sm text-white placeholder-slate-500 h-20 resize-none focus:outline-none focus:border-blue-500"
                />
              </div>
              <div>
                <label className="block text-xs text-slate-400 mb-1.5">Channel</label>
                <select
                  value={form.channel}
                  onChange={(e) => setForm({ ...form, channel: e.target.value })}
                  className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2.5 text-sm text-white focus:outline-none focus:border-blue-500"
                >
                  <option value="email">Email</option>
                  <option value="whatsapp">WhatsApp</option>
                  <option value="instagram">Instagram</option>
                  <option value="multi">Multi-channel</option>
                </select>
              </div>
              <div className="flex gap-3 pt-2">
                <button
                  onClick={createCampaign}
                  disabled={!form.name}
                  className="flex-1 bg-blue-600 hover:bg-blue-700 disabled:bg-slate-700 text-white py-2.5 rounded-lg text-sm font-medium transition-colors"
                >
                  Create
                </button>
                <button
                  onClick={() => setShowCreate(false)}
                  className="px-4 bg-slate-700 hover:bg-slate-600 text-white py-2.5 rounded-lg text-sm transition-colors"
                >
                  Cancel
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Campaign List */}
      {loading ? (
        <div className="flex justify-center py-16">
          <Loader2 size={24} className="animate-spin text-slate-500" />
        </div>
      ) : campaigns.length === 0 ? (
        <div className="text-center py-16">
          <Mail size={48} className="text-slate-600 mx-auto mb-4" />
          <h3 className="text-lg font-medium text-slate-300">No campaigns yet</h3>
          <p className="text-slate-500 mt-1">Create a campaign to start reaching out to leads</p>
        </div>
      ) : (
        <div className="grid gap-4">
          {campaigns.map((campaign) => (
            <div key={campaign.id} className="bg-slate-800/50 border border-slate-700/50 rounded-xl p-5 flex items-center justify-between">
              <div className="flex items-center gap-4">
                <div className="w-10 h-10 rounded-lg bg-slate-700 flex items-center justify-center">
                  {channelIcon(campaign.channel)}
                </div>
                <div>
                  <h3 className="text-white font-medium">{campaign.name}</h3>
                  <p className="text-xs text-slate-400 mt-0.5">
                    {campaign._count.leads} leads · {campaign._count.steps} steps · {campaign.channel}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-3">
                <span className={`text-xs px-2.5 py-1 rounded-full ${
                  campaign.status === "active" ? "bg-green-500/20 text-green-300" :
                  campaign.status === "paused" ? "bg-amber-500/20 text-amber-300" :
                  campaign.status === "completed" ? "bg-blue-500/20 text-blue-300" :
                  "bg-slate-700 text-slate-300"
                }`}>
                  {campaign.status}
                </span>
                <button
                  onClick={() => toggleStatus(campaign.id, campaign.status)}
                  className="p-2 rounded-lg bg-slate-700 hover:bg-slate-600 text-slate-300 transition-colors"
                  title={campaign.status === "active" ? "Pause" : "Activate"}
                >
                  {campaign.status === "active" ? <Pause size={14} /> : <Play size={14} />}
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
