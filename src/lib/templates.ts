export const DEFAULT_TEMPLATES = {
  email_de_initial: {
    name: "Erstansprache (Deutsch)",
    channel: "email",
    language: "de",
    subject: "Professionelle Website für {{businessName}} — kostenlose Demo",
    body: `Sehr geehrte Damen und Herren von {{businessName}},

mein Name ist Behar von WebPro Austria. Wir erstellen schnelle, mobile-freundliche Websites speziell für {{category}} in {{city}}.

Was wir für Sie tun können:
• Professionelle Website (5–10 Seiten) in 7–10 Tagen
• QR-Speisekarte / Online-Buchung
• Google Business Profil & lokale SEO
• Social Media Management

Unsere Preise starten ab €349 — inklusive allem, keine versteckten Kosten.

Ich würde Ihnen gerne eine kostenlose, unverbindliche Demo zeigen, wie Ihre neue Website aussehen könnte.

Darf ich Ihnen einen Vorschlag per WhatsApp oder E-Mail schicken?

Mit freundlichen Grüßen,
Behar Kabashi
WebPro Austria
+43 660 589 50 43
info@beharkabashi.com
https://webpro-austria.vercel.app`,
    variables: ["businessName", "category", "city"],
  },
  email_de_followup: {
    name: "Follow-up (Deutsch)",
    channel: "email",
    language: "de",
    subject: "Re: Website für {{businessName}} — haben Sie meine Nachricht gesehen?",
    body: `Guten Tag,

ich wollte kurz nachfragen, ob Sie meine letzte Nachricht erhalten haben.

Ich habe bereits eine Demo-Website für {{businessName}} vorbereitet. Sie können sie sich kostenlos und unverbindlich anschauen — das dauert nur 2 Minuten.

Falls Sie Interesse haben, antworte ich innerhalb von 24 Stunden.

Freundliche Grüße,
Behar Kabashi
WebPro Austria
+43 660 589 50 43`,
    variables: ["businessName"],
  },
  whatsapp_de_initial: {
    name: "WhatsApp Erstansprache (Deutsch)",
    channel: "whatsapp",
    language: "de",
    subject: null,
    body: `Guten Tag! 👋

Mein Name ist Behar von WebPro Austria. Ich habe gesehen, dass {{businessName}} in {{city}} noch keine professionelle Website hat.

Wir bauen mobile-freundliche Websites speziell für {{category}} — ab €349, fertig in 7–10 Tagen.

Darf ich Ihnen eine kostenlose Demo zeigen, wie Ihre Website aussehen könnte? 🖥️

Beste Grüße,
Behar | WebPro Austria`,
    variables: ["businessName", "city", "category"],
  },
  whatsapp_de_followup: {
    name: "WhatsApp Follow-up (Deutsch)",
    channel: "whatsapp",
    language: "de",
    subject: null,
    body: `Hallo nochmal! 😊

Ich wollte kurz nachfragen, ob Sie meine Nachricht gesehen haben. Ich habe bereits eine Demo für {{businessName}} vorbereitet.

Soll ich Ihnen einen Link schicken? Dauert nur 2 Minuten zum Anschauen.

LG Behar, WebPro Austria`,
    variables: ["businessName"],
  },
  instagram_de_initial: {
    name: "Instagram DM (Deutsch)",
    channel: "instagram",
    language: "de",
    subject: null,
    body: `Hey {{businessName}}! 👋

Euer Profil sieht super aus! Habt ihr schon eine eigene Website? Wir bauen professionelle Websites für {{category}} in {{city}} — ab €349, in 7–10 Tagen fertig.

Darf ich euch eine kostenlose Demo zeigen? 🚀

LG Behar von WebPro Austria`,
    variables: ["businessName", "city", "category"],
  },
  whatsapp_sq_initial: {
    name: "WhatsApp Erstansprache (Shqip)",
    channel: "whatsapp",
    language: "sq",
    subject: null,
    body: `Përshëndetje! 👋

Unë jam Behar nga WebPro. Pashë që {{businessName}} në {{city}} nuk ka ende një faqe interneti profesionale.

Ne ndërtojmë faqe interneti moderne për {{category}} — duke filluar nga €249, gati brenda 7-10 ditëve.

A dëshironi t'ju tregoj një demo falas? 🖥️

Përshëndetje,
Behar | WebPro`,
    variables: ["businessName", "city", "category"],
  },
  whatsapp_sq_followup: {
    name: "WhatsApp Follow-up (Shqip)",
    channel: "whatsapp",
    language: "sq",
    subject: null,
    body: `Përshëndetje përsëri! 😊

Doja të pyes nëse e keni parë mesazhin tim. Kam përgatitur tashmë një demo për {{businessName}}.

A doni t'ju dërgoj linkun? Zgjat vetëm 2 minuta.

Faleminderit,
Behar | WebPro`,
    variables: ["businessName"],
  },
};

export function fillTemplate(template: string, variables: Record<string, string>): string {
  let result = template;
  for (const [key, value] of Object.entries(variables)) {
    result = result.replace(new RegExp(`\\{\\{${key}\\}\\}`, "g"), value);
  }
  return result;
}
