import nodemailer from "nodemailer";

export interface EmailMessage {
  to: string;
  subject: string;
  text: string;
  html?: string;
}

/**
 * E-mail transport. `console` logs messages (development/test); `smtp` sends
 * through Google Workspace (smtp.gmail.com) or Microsoft 365 (smtp.office365.com).
 */
export async function sendEmail(msg: EmailMessage): Promise<{ ok: boolean; skipped?: boolean; error?: string }> {
  const provider = process.env.EMAIL_PROVIDER ?? "console";
  if (provider === "console") {
    if (process.env.NODE_ENV !== "test") {
      console.info(`[email:console] to=${msg.to} subject="${msg.subject}"`);
    }
    return { ok: true, skipped: true };
  }
  try {
    const transporter = nodemailer.createTransport({
      host: process.env.SMTP_HOST,
      port: Number(process.env.SMTP_PORT ?? 587),
      secure: process.env.SMTP_SECURE === "true",
      auth: process.env.SMTP_USER ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS } : undefined,
    });
    await transporter.sendMail({ from: process.env.EMAIL_FROM, ...msg });
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}
