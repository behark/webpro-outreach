import { prisma } from "@/lib/db";
import { Mail, MessageCircle } from "lucide-react";
import type { Lead, Message } from "@/generated/prisma/client";

export const dynamic = "force-dynamic";

export default async function MessagesPage() {
  const messages = await prisma.message.findMany({
    orderBy: { sentAt: "desc" },
    include: { lead: true },
    take: 50,
  });

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-white">Messages</h1>
        <p className="text-slate-400 mt-1">All outreach messages sent to leads</p>
      </div>

      {messages.length === 0 ? (
        <div className="text-center py-16">
          <Mail size={48} className="text-slate-600 mx-auto mb-4" />
          <h3 className="text-lg font-medium text-slate-300">No messages yet</h3>
          <p className="text-slate-500 mt-1">Messages will appear here once you start outreach campaigns</p>
        </div>
      ) : (
        <div className="space-y-3">
          {messages.map((msg: Message & { lead: Lead }) => (
            <div key={msg.id} className="bg-slate-800/50 border border-slate-700/50 rounded-xl p-4">
              <div className="flex items-start justify-between">
                <div className="flex items-start gap-3">
                  <div className="w-8 h-8 rounded-lg bg-slate-700 flex items-center justify-center flex-shrink-0 mt-0.5">
                    {msg.channel === "whatsapp" ? (
                      <MessageCircle size={14} className="text-green-400" />
                    ) : (
                      <Mail size={14} className="text-blue-400" />
                    )}
                  </div>
                  <div>
                    <p className="text-sm font-medium text-white">{msg.lead.business}</p>
                    {msg.subject && <p className="text-xs text-slate-300 mt-0.5">{msg.subject}</p>}
                    <p className="text-xs text-slate-500 mt-1 line-clamp-2">{msg.body.substring(0, 120)}...</p>
                  </div>
                </div>
                <div className="text-right flex-shrink-0 ml-4">
                  <span className={`text-xs px-2 py-1 rounded-full ${
                    msg.status === "sent" ? "bg-blue-500/20 text-blue-300" :
                    msg.status === "delivered" ? "bg-green-500/20 text-green-300" :
                    msg.status === "opened" ? "bg-purple-500/20 text-purple-300" :
                    msg.status === "replied" ? "bg-emerald-500/20 text-emerald-300" :
                    msg.status === "failed" ? "bg-red-500/20 text-red-300" :
                    "bg-slate-700 text-slate-300"
                  }`}>
                    {msg.status}
                  </span>
                  <p className="text-xs text-slate-500 mt-1">
                    {new Date(msg.sentAt).toLocaleDateString("de-AT", {
                      day: "2-digit",
                      month: "2-digit",
                      hour: "2-digit",
                      minute: "2-digit",
                    })}
                  </p>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
