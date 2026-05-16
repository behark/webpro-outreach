import { prisma } from "@/lib/db";
import { Users, Mail, Megaphone, TrendingUp, Clock, CheckCircle } from "lucide-react";
import Link from "next/link";
import type { Lead, Message } from "@/generated/prisma/client";

export const dynamic = "force-dynamic";

async function getStats() {
  const [totalLeads, newLeads, contactedLeads, repliedLeads, totalMessages, activeCampaigns] =
    await Promise.all([
      prisma.lead.count(),
      prisma.lead.count({ where: { status: "new" } }),
      prisma.lead.count({ where: { status: "contacted" } }),
      prisma.lead.count({ where: { status: "replied" } }),
      prisma.message.count(),
      prisma.campaign.count({ where: { status: "active" } }),
    ]);
  return { totalLeads, newLeads, contactedLeads, repliedLeads, totalMessages, activeCampaigns };
}

async function getRecentLeads() {
  return prisma.lead.findMany({
    orderBy: { createdAt: "desc" },
    take: 5,
  });
}

async function getRecentMessages() {
  return prisma.message.findMany({
    orderBy: { sentAt: "desc" },
    take: 5,
    include: { lead: true },
  });
}

export default async function DashboardPage() {
  const stats = await getStats();
  const recentLeads = await getRecentLeads();
  const recentMessages = await getRecentMessages();

  const statCards = [
    { label: "Total Leads", value: stats.totalLeads, icon: Users, color: "text-blue-400", bg: "bg-blue-500/10" },
    { label: "New", value: stats.newLeads, icon: Clock, color: "text-amber-400", bg: "bg-amber-500/10" },
    { label: "Contacted", value: stats.contactedLeads, icon: Mail, color: "text-purple-400", bg: "bg-purple-500/10" },
    { label: "Replied", value: stats.repliedLeads, icon: CheckCircle, color: "text-green-400", bg: "bg-green-500/10" },
    { label: "Messages Sent", value: stats.totalMessages, icon: TrendingUp, color: "text-cyan-400", bg: "bg-cyan-500/10" },
    { label: "Active Campaigns", value: stats.activeCampaigns, icon: Megaphone, color: "text-pink-400", bg: "bg-pink-500/10" },
  ];

  return (
    <div>
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-white">Dashboard</h1>
        <p className="text-slate-400 mt-1">Overview of your outreach pipeline</p>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4 mb-8">
        {statCards.map((stat) => (
          <div key={stat.label} className="bg-slate-800/50 border border-slate-700/50 rounded-xl p-4">
            <div className={`w-9 h-9 rounded-lg ${stat.bg} flex items-center justify-center mb-3`}>
              <stat.icon size={18} className={stat.color} />
            </div>
            <p className="text-2xl font-bold text-white">{stat.value}</p>
            <p className="text-xs text-slate-400 mt-1">{stat.label}</p>
          </div>
        ))}
      </div>

      {/* Quick Actions */}
      <div className="grid md:grid-cols-3 gap-4 mb-8">
        <Link
          href="/finder"
          className="bg-blue-600/20 border border-blue-500/30 rounded-xl p-5 hover:bg-blue-600/30 transition-colors"
        >
          <h3 className="font-semibold text-blue-300 mb-1">Find New Leads</h3>
          <p className="text-sm text-slate-400">Search businesses on Google Maps by city & category</p>
        </Link>
        <Link
          href="/campaigns"
          className="bg-purple-600/20 border border-purple-500/30 rounded-xl p-5 hover:bg-purple-600/30 transition-colors"
        >
          <h3 className="font-semibold text-purple-300 mb-1">Start Campaign</h3>
          <p className="text-sm text-slate-400">Create email/WhatsApp sequences to contact leads</p>
        </Link>
        <Link
          href="/leads"
          className="bg-green-600/20 border border-green-500/30 rounded-xl p-5 hover:bg-green-600/30 transition-colors"
        >
          <h3 className="font-semibold text-green-300 mb-1">Manage Leads</h3>
          <p className="text-sm text-slate-400">View, filter and update your lead pipeline</p>
        </Link>
      </div>

      <div className="grid md:grid-cols-2 gap-6">
        {/* Recent Leads */}
        <div className="bg-slate-800/50 border border-slate-700/50 rounded-xl p-5">
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-semibold text-white">Recent Leads</h2>
            <Link href="/leads" className="text-sm text-blue-400 hover:underline">View all</Link>
          </div>
          {recentLeads.length === 0 ? (
            <p className="text-slate-500 text-sm">No leads yet. Use the Lead Finder to get started.</p>
          ) : (
            <div className="space-y-3">
              {recentLeads.map((lead: Lead) => (
                <div key={lead.id} className="flex items-center justify-between py-2 border-b border-slate-700/50 last:border-0">
                  <div>
                    <p className="text-sm font-medium text-white">{lead.business}</p>
                    <p className="text-xs text-slate-400">{lead.city} · {lead.category}</p>
                  </div>
                  <span className={`text-xs px-2 py-1 rounded-full ${
                    lead.status === "new" ? "bg-amber-500/20 text-amber-300" :
                    lead.status === "contacted" ? "bg-blue-500/20 text-blue-300" :
                    lead.status === "replied" ? "bg-green-500/20 text-green-300" :
                    "bg-slate-700 text-slate-300"
                  }`}>
                    {lead.status}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Recent Messages */}
        <div className="bg-slate-800/50 border border-slate-700/50 rounded-xl p-5">
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-semibold text-white">Recent Messages</h2>
            <Link href="/messages" className="text-sm text-blue-400 hover:underline">View all</Link>
          </div>
          {recentMessages.length === 0 ? (
            <p className="text-slate-500 text-sm">No messages sent yet. Start a campaign to reach leads.</p>
          ) : (
            <div className="space-y-3">
              {recentMessages.map((msg: Message & { lead: Lead }) => (
                <div key={msg.id} className="flex items-center justify-between py-2 border-b border-slate-700/50 last:border-0">
                  <div>
                    <p className="text-sm font-medium text-white">{msg.lead.business}</p>
                    <p className="text-xs text-slate-400">{msg.channel} · {msg.subject || "No subject"}</p>
                  </div>
                  <span className="text-xs text-slate-500">
                    {new Date(msg.sentAt).toLocaleDateString("de-AT")}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
