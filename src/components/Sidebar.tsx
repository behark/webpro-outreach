"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard,
  Users,
  Search,
  Mail,
  MessageCircle,
  Megaphone,
  FileText,
  Settings,
} from "lucide-react";

const NAV_ITEMS = [
  { href: "/", label: "Dashboard", icon: LayoutDashboard },
  { href: "/leads", label: "Leads", icon: Users },
  { href: "/finder", label: "Lead Finder", icon: Search },
  { href: "/campaigns", label: "Campaigns", icon: Megaphone },
  { href: "/messages", label: "Messages", icon: Mail },
  { href: "/templates", label: "Templates", icon: FileText },
  { href: "/settings", label: "Settings", icon: Settings },
];

export default function Sidebar() {
  const pathname = usePathname();

  return (
    <aside className="w-64 bg-slate-900 border-r border-slate-800 flex flex-col min-h-screen fixed left-0 top-0 z-40">
      {/* Brand */}
      <div className="p-5 border-b border-slate-800">
        <h1 className="text-lg font-bold text-white">
          Web<span className="text-blue-500">Pro</span>{" "}
          <span className="text-sm font-normal text-slate-400">Outreach</span>
        </h1>
      </div>

      {/* Navigation */}
      <nav className="flex-1 py-4 px-3 space-y-1">
        {NAV_ITEMS.map((item) => {
          const isActive =
            item.href === "/"
              ? pathname === "/"
              : pathname.startsWith(item.href);
          return (
            <Link
              key={item.href}
              href={item.href}
              className={`flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors ${
                isActive
                  ? "bg-blue-600/20 text-blue-400"
                  : "text-slate-400 hover:text-white hover:bg-slate-800"
              }`}
            >
              <item.icon size={18} />
              {item.label}
            </Link>
          );
        })}
      </nav>

      {/* Footer */}
      <div className="p-4 border-t border-slate-800">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-full bg-blue-600 flex items-center justify-center text-white text-xs font-bold">
            BK
          </div>
          <div>
            <p className="text-sm font-medium text-white">Behar</p>
            <p className="text-xs text-slate-500">WebPro Austria</p>
          </div>
        </div>
      </div>
    </aside>
  );
}
