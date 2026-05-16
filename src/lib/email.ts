import nodemailer from "nodemailer";

export interface EmailOptions {
  to: string;
  subject: string;
  body: string;
  html?: string;
}

export interface EmailResult {
  success: boolean;
  messageId?: string;
  error?: string;
}

function getTransporter() {
  const host = process.env.SMTP_HOST || "smtp-mail.outlook.com";
  const port = parseInt(process.env.SMTP_PORT || "587");
  const user = process.env.SMTP_USER || "";
  const pass = process.env.SMTP_PASS || "";

  if (!user || !pass) {
    throw new Error("SMTP_USER and SMTP_PASS environment variables are required");
  }

  return nodemailer.createTransport({
    host,
    port,
    secure: port === 465,
    auth: { user, pass },
  });
}

export async function sendEmail(options: EmailOptions): Promise<EmailResult> {
  try {
    const transporter = getTransporter();
    const fromName = process.env.SENDER_NAME || "Behar Kabashi";
    const fromEmail = process.env.SMTP_USER || "";

    const info = await transporter.sendMail({
      from: `"${fromName}" <${fromEmail}>`,
      to: options.to,
      subject: options.subject,
      text: options.body,
      html: options.html || options.body.replace(/\n/g, "<br>"),
    });

    return { success: true, messageId: info.messageId };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    console.error("Email send failed:", message);
    return { success: false, error: message };
  }
}

export async function verifySmtp(): Promise<{ connected: boolean; error?: string }> {
  try {
    const transporter = getTransporter();
    await transporter.verify();
    return { connected: true };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return { connected: false, error: message };
  }
}
