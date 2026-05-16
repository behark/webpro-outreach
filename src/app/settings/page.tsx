"use client";

import { useState } from "react";
import { Save, Key, Mail, MessageCircle } from "lucide-react";

export default function SettingsPage() {
  const [saved, setSaved] = useState(false);

  function handleSave() {
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  }

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-white">Settings</h1>
        <p className="text-slate-400 mt-1">Configure API keys and outreach preferences</p>
      </div>

      <div className="max-w-2xl space-y-6">
        {/* Google Places API */}
        <div className="bg-slate-800/50 border border-slate-700/50 rounded-xl p-5">
          <div className="flex items-center gap-3 mb-4">
            <div className="w-9 h-9 rounded-lg bg-blue-500/10 flex items-center justify-center">
              <Key size={16} className="text-blue-400" />
            </div>
            <div>
              <h3 className="font-medium text-white">Google Places API</h3>
              <p className="text-xs text-slate-400">Required for Lead Finder</p>
            </div>
          </div>
          <div>
            <label className="block text-xs text-slate-400 mb-1.5">API Key</label>
            <input
              type="password"
              placeholder="AIza..."
              className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2.5 text-sm text-white placeholder-slate-500 focus:outline-none focus:border-blue-500"
            />
            <p className="text-xs text-slate-500 mt-1.5">
              Get your key at{" "}
              <a href="https://console.cloud.google.com/apis/credentials" target="_blank" className="text-blue-400 hover:underline">
                Google Cloud Console
              </a>
              . Enable &quot;Places API (New)&quot;.
            </p>
          </div>
        </div>

        {/* Email Settings */}
        <div className="bg-slate-800/50 border border-slate-700/50 rounded-xl p-5">
          <div className="flex items-center gap-3 mb-4">
            <div className="w-9 h-9 rounded-lg bg-purple-500/10 flex items-center justify-center">
              <Mail size={16} className="text-purple-400" />
            </div>
            <div>
              <h3 className="font-medium text-white">Email Configuration</h3>
              <p className="text-xs text-slate-400">SMTP settings for sending emails</p>
            </div>
          </div>
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs text-slate-400 mb-1.5">SMTP Host</label>
                <input
                  type="text"
                  placeholder="smtp.gmail.com"
                  className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2.5 text-sm text-white placeholder-slate-500 focus:outline-none focus:border-blue-500"
                />
              </div>
              <div>
                <label className="block text-xs text-slate-400 mb-1.5">Port</label>
                <input
                  type="text"
                  placeholder="587"
                  className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2.5 text-sm text-white placeholder-slate-500 focus:outline-none focus:border-blue-500"
                />
              </div>
            </div>
            <div>
              <label className="block text-xs text-slate-400 mb-1.5">Email Address</label>
              <input
                type="email"
                placeholder="enisskovercani@outlook.com"
                className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2.5 text-sm text-white placeholder-slate-500 focus:outline-none focus:border-blue-500"
              />
            </div>
            <div>
              <label className="block text-xs text-slate-400 mb-1.5">Password / App Password</label>
              <input
                type="password"
                placeholder="••••••••"
                className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2.5 text-sm text-white placeholder-slate-500 focus:outline-none focus:border-blue-500"
              />
            </div>
          </div>
        </div>

        {/* WhatsApp Settings */}
        <div className="bg-slate-800/50 border border-slate-700/50 rounded-xl p-5">
          <div className="flex items-center gap-3 mb-4">
            <div className="w-9 h-9 rounded-lg bg-green-500/10 flex items-center justify-center">
              <MessageCircle size={16} className="text-green-400" />
            </div>
            <div>
              <h3 className="font-medium text-white">WhatsApp</h3>
              <p className="text-xs text-slate-400">Your WhatsApp number for outreach</p>
            </div>
          </div>
          <div>
            <label className="block text-xs text-slate-400 mb-1.5">Phone Number</label>
            <input
              type="text"
              defaultValue="+43 660 589 50 43"
              className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2.5 text-sm text-white placeholder-slate-500 focus:outline-none focus:border-blue-500"
            />
            <p className="text-xs text-slate-500 mt-1.5">
              WhatsApp messages open via wa.me links. For automation, consider WhatsApp Business API.
            </p>
          </div>
        </div>

        {/* Sender Info */}
        <div className="bg-slate-800/50 border border-slate-700/50 rounded-xl p-5">
          <h3 className="font-medium text-white mb-4">Sender Information</h3>
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs text-slate-400 mb-1.5">Your Name</label>
                <input
                  type="text"
                  defaultValue="Behar Kabashi"
                  className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2.5 text-sm text-white focus:outline-none focus:border-blue-500"
                />
              </div>
              <div>
                <label className="block text-xs text-slate-400 mb-1.5">Company</label>
                <input
                  type="text"
                  defaultValue="WebPro Austria"
                  className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2.5 text-sm text-white focus:outline-none focus:border-blue-500"
                />
              </div>
            </div>
            <div>
              <label className="block text-xs text-slate-400 mb-1.5">Website</label>
              <input
                type="url"
                defaultValue="https://webpro-austria.vercel.app"
                className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2.5 text-sm text-white focus:outline-none focus:border-blue-500"
              />
            </div>
          </div>
        </div>

        <button
          onClick={handleSave}
          className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white px-6 py-2.5 rounded-lg text-sm font-medium transition-colors"
        >
          <Save size={16} />
          {saved ? "Saved!" : "Save Settings"}
        </button>
      </div>
    </div>
  );
}
