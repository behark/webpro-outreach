// WhatsApp Business API Integration
// Uses the official Meta WhatsApp Cloud API
// Docs: https://developers.facebook.com/docs/whatsapp/cloud-api

export interface WhatsAppOptions {
  to: string; // Phone number with country code (e.g. +436605895043)
  body: string;
}

export interface WhatsAppResult {
  success: boolean;
  messageId?: string;
  error?: string;
  fallbackUrl?: string; // wa.me link as fallback
}

export async function sendWhatsApp(options: WhatsAppOptions): Promise<WhatsAppResult> {
  const token = process.env.WHATSAPP_TOKEN;
  const phoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID;

  // Clean phone number - remove spaces, dashes, keep + and digits
  const phone = options.to.replace(/[^0-9+]/g, "").replace(/^\+/, "");

  // If no API credentials, return a wa.me fallback link
  if (!token || !phoneNumberId) {
    const waText = encodeURIComponent(options.body);
    return {
      success: false,
      error: "WhatsApp Business API not configured. Using wa.me fallback.",
      fallbackUrl: `https://wa.me/${phone}?text=${waText}`,
    };
  }

  try {
    const response = await fetch(
      `https://graph.facebook.com/v21.0/${phoneNumberId}/messages`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          messaging_product: "whatsapp",
          recipient_type: "individual",
          to: phone,
          type: "text",
          text: { body: options.body },
        }),
      }
    );

    if (!response.ok) {
      const err = await response.json();
      const errorMsg = err?.error?.message || `HTTP ${response.status}`;
      return {
        success: false,
        error: errorMsg,
        fallbackUrl: `https://wa.me/${phone}?text=${encodeURIComponent(options.body)}`,
      };
    }

    const data = await response.json();
    return {
      success: true,
      messageId: data?.messages?.[0]?.id || "sent",
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return {
      success: false,
      error: message,
      fallbackUrl: `https://wa.me/${phone}?text=${encodeURIComponent(options.body)}`,
    };
  }
}
