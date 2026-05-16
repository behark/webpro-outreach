"use client";

import { useState, useEffect } from "react";
import { Plus, Mail, MessageCircle, Copy, Trash2, Loader2 } from "lucide-react";
import { DEFAULT_TEMPLATES } from "@/lib/templates";

type Template = {
  id: string;
  name: string;
  channel: string;
  subject: string | null;
  body: string;
  language: string;
  variables: string | null;
  createdAt: string;
};

export default function TemplatesPage() {
  const [templates, setTemplates] = useState<Template[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [form, setForm] = useState({
    name: "",
    channel: "email",
    subject: "",
    body: "",
    language: "de",
  });
  const [selectedTemplate, setSelectedTemplate] = useState<Template | null>(null);

  useEffect(() => {
    fetchTemplates();
  }, []);

  async function fetchTemplates() {
    const res = await fetch("/api/templates");
    const data = await res.json();
    setTemplates(data);
    setLoading(false);
  }

  async function createTemplate() {
    await fetch("/api/templates", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(form),
    });
    setShowCreate(false);
    setForm({ name: "", channel: "email", subject: "", body: "", language: "de" });
    fetchTemplates();
  }

  async function seedDefaults() {
    const entries = Object.values(DEFAULT_TEMPLATES);
    for (const t of entries) {
      await fetch("/api/templates", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: t.name,
          channel: t.channel,
          subject: t.subject,
          body: t.body,
          language: t.language,
          variables: JSON.stringify(t.variables),
        }),
      });
    }
    fetchTemplates();
  }

  async function deleteTemplate(id: string) {
    if (!confirm("Delete this template?")) return;
    await fetch(`/api/templates/${id}`, { method: "DELETE" });
    setSelectedTemplate(null);
    fetchTemplates();
  }

  function copyToClipboard(text: string) {
    navigator.clipboard.writeText(text);
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-white">Templates</h1>
          <p className="text-slate-400 mt-1">Pre-written messages for email, WhatsApp & Instagram outreach</p>
        </div>
        <div className="flex gap-3">
          {templates.length === 0 && (
            <button
              onClick={seedDefaults}
              className="flex items-center gap-2 bg-amber-600 hover:bg-amber-700 text-white px-4 py-2.5 rounded-lg text-sm font-medium transition-colors"
            >
              Load Defaults
            </button>
          )}
          <button
            onClick={() => setShowCreate(true)}
            className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white px-4 py-2.5 rounded-lg text-sm font-medium transition-colors"
          >
            <Plus size={16} /> New Template
          </button>
        </div>
      </div>

      {/* Create Template Modal */}
      {showCreate && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50" onClick={() => setShowCreate(false)}>
          <div className="bg-slate-800 border border-slate-700 rounded-xl p-6 w-full max-w-lg max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
            <h2 className="text-lg font-bold text-white mb-4">Create Template</h2>
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs text-slate-400 mb-1.5">Name</label>
                  <input
                    type="text"
                    value={form.name}
                    onChange={(e) => setForm({ ...form, name: e.target.value })}
                    className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2.5 text-sm text-white placeholder-slate-500 focus:outline-none focus:border-blue-500"
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
                    <option value="instagram">Instagram DM</option>
                  </select>
                </div>
              </div>
              {form.channel === "email" && (
                <div>
                  <label className="block text-xs text-slate-400 mb-1.5">Subject</label>
                  <input
                    type="text"
                    value={form.subject}
                    onChange={(e) => setForm({ ...form, subject: e.target.value })}
                    placeholder="Use {{businessName}} for variables"
                    className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2.5 text-sm text-white placeholder-slate-500 focus:outline-none focus:border-blue-500"
                  />
                </div>
              )}
              <div>
                <label className="block text-xs text-slate-400 mb-1.5">Body</label>
                <textarea
                  value={form.body}
                  onChange={(e) => setForm({ ...form, body: e.target.value })}
                  placeholder="Use {{businessName}}, {{city}}, {{category}} for personalization"
                  rows={10}
                  className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2.5 text-sm text-white placeholder-slate-500 resize-none focus:outline-none focus:border-blue-500 font-mono"
                />
              </div>
              <div className="flex gap-3 pt-2">
                <button
                  onClick={createTemplate}
                  disabled={!form.name || !form.body}
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

      {/* Template List & Preview */}
      {loading ? (
        <div className="flex justify-center py-16">
          <Loader2 size={24} className="animate-spin text-slate-500" />
        </div>
      ) : (
        <div className="grid md:grid-cols-2 gap-6">
          {/* List */}
          <div className="space-y-3">
            {templates.length === 0 ? (
              <div className="text-center py-12 bg-slate-800/50 border border-slate-700/50 rounded-xl">
                <Mail size={36} className="text-slate-600 mx-auto mb-3" />
                <p className="text-slate-400">No templates yet</p>
                <p className="text-xs text-slate-500 mt-1">Click &quot;Load Defaults&quot; to get started with pre-written templates</p>
              </div>
            ) : (
              templates.map((t) => (
                <button
                  key={t.id}
                  onClick={() => setSelectedTemplate(t)}
                  className={`w-full text-left bg-slate-800/50 border rounded-xl p-4 transition-colors ${
                    selectedTemplate?.id === t.id ? "border-blue-500/50 bg-blue-500/5" : "border-slate-700/50 hover:border-slate-600"
                  }`}
                >
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-lg bg-slate-700 flex items-center justify-center flex-shrink-0">
                      {t.channel === "whatsapp" ? <MessageCircle size={14} className="text-green-400" /> : <Mail size={14} className="text-blue-400" />}
                    </div>
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-white truncate">{t.name}</p>
                      <p className="text-xs text-slate-500">{t.channel} · {t.language}</p>
                    </div>
                  </div>
                </button>
              ))
            )}
          </div>

          {/* Preview */}
          {selectedTemplate && (
            <div className="bg-slate-800/50 border border-slate-700/50 rounded-xl p-5 sticky top-6">
              <div className="flex items-center justify-between mb-4">
                <h3 className="font-semibold text-white">{selectedTemplate.name}</h3>
                <div className="flex gap-2">
                  <button
                    onClick={() => copyToClipboard(selectedTemplate.body)}
                    className="p-2 rounded-lg bg-slate-700 hover:bg-slate-600 text-slate-300 transition-colors"
                    title="Copy body"
                  >
                    <Copy size={14} />
                  </button>
                  <button
                    onClick={() => deleteTemplate(selectedTemplate.id)}
                    className="p-2 rounded-lg bg-slate-700 hover:bg-red-600 text-slate-300 transition-colors"
                    title="Delete"
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
              </div>
              {selectedTemplate.subject && (
                <div className="mb-3">
                  <p className="text-xs text-slate-400 mb-1">Subject:</p>
                  <p className="text-sm text-white bg-slate-900 rounded-lg p-2">{selectedTemplate.subject}</p>
                </div>
              )}
              <div>
                <p className="text-xs text-slate-400 mb-1">Body:</p>
                <pre className="text-sm text-slate-200 bg-slate-900 rounded-lg p-3 whitespace-pre-wrap font-sans leading-relaxed max-h-80 overflow-y-auto">
                  {selectedTemplate.body}
                </pre>
              </div>
              {selectedTemplate.variables && (
                <div className="mt-3">
                  <p className="text-xs text-slate-400">Variables: <span className="text-blue-300">{selectedTemplate.variables}</span></p>
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
