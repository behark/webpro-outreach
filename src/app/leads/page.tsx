import { prisma } from "@/lib/db";
import Link from "next/link";
import { Plus } from "lucide-react";
import LeadTable from "./LeadTable";

export const dynamic = "force-dynamic";

export default async function LeadsPage() {
  const leads = await prisma.lead.findMany({
    orderBy: { createdAt: "desc" },
    include: { _count: { select: { messages: true } } },
  });

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-white">Leads</h1>
          <p className="text-slate-400 mt-1">{leads.length} total leads in pipeline</p>
        </div>
        <div className="flex gap-3">
          <Link
            href="/finder"
            className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white px-4 py-2.5 rounded-lg text-sm font-medium transition-colors"
          >
            <Plus size={16} />
            Find Leads
          </Link>
        </div>
      </div>
      <LeadTable leads={leads} />
    </div>
  );
}
