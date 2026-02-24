import { NextResponse } from "next/server";
import nodemailer from "nodemailer";

export const runtime = "nodejs";

// ===============================
// Email Config (from env)
// ===============================
const EMAIL_TO = process.env.ALERT_EMAIL_TO || "abdotlos60@gmail.com";

function getMailer() {
  const host = process.env.SMTP_HOST;
  const port = Number(process.env.SMTP_PORT || 465);
  const secure = String(process.env.SMTP_SECURE || "true") === "true";
  const user = process.env.SMTP_USER;
  const pass = process.env.SMTP_PASS;

  if (!host || !port || !user || !pass) {
    throw new Error("Missing SMTP env vars");
  }

  return nodemailer.createTransport({
    host,
    port,
    secure,
    auth: { user, pass },
  });
}

async function sendEmail({ subject, text, html }) {
  const transporter = getMailer();
  const from = process.env.SMTP_FROM || "Whatsapp <info@example.com>";

  return transporter.sendMail({
    from,
    to: EMAIL_TO,
    subject,
    text,
    html,
  });
}

// ===============================
// GET: Meta webhook verification
// ===============================
export async function GET(req) {
  const searchParams = req.nextUrl.searchParams;

  const mode = searchParams.get("hub.mode");
  const token = searchParams.get("hub.verify_token");
  const challenge = searchParams.get("hub.challenge");

  const verifyToken = process.env.WHATSAPP_WEBHOOK_VERIFY_TOKEN;

  if (mode === "subscribe" && token === verifyToken) {
    return new NextResponse(challenge ?? "", {
      status: 200,
      headers: { "Content-Type": "text/plain" },
    });
  }

  return NextResponse.json({ error: "Verification failed" }, { status: 403 });
}

// ===============================
// Helpers
// ===============================
function escapeHtml(str = "") {
  return String(str)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function extractMessageText(incoming) {
  const msgType = incoming?.type || "unknown";

  if (msgType === "text") {
    return incoming?.text?.body || "";
  }

  if (msgType === "interactive") {
    const btn = incoming?.interactive?.button_reply?.title;
    const list = incoming?.interactive?.list_reply?.title;
    return btn || list || "Interactive reply";
  }

  if (msgType === "image") {
    return incoming?.image?.caption || "[Image]";
  }

  if (msgType === "document") {
    return (
      incoming?.document?.caption ||
      `[Document] ${incoming?.document?.filename || ""}`.trim()
    );
  }

  if (msgType === "audio") return "[Audio message]";
  if (msgType === "video") return "[Video message]";
  if (msgType === "sticker") return "[Sticker]";
  if (msgType === "location") return "[Location]";

  return `[${msgType}]`;
}

// ===============================
// POST: Receive incoming messages and email them
// ===============================
export async function POST(req) {
  try {
    const body = await req.json();
    console.log("Webhook Event:", JSON.stringify(body, null, 2));

    const value = body?.entry?.[0]?.changes?.[0]?.value;

    // Ignore non-message events
    if (!value?.messages?.length) {
      return NextResponse.json(
        { received: true, type: "non-message" },
        { status: 200 },
      );
    }

    const incoming = value.messages[0];
    const from = incoming?.from || "unknown";
    const profileName = value?.contacts?.[0]?.profile?.name || "Unknown";

    const messageText = extractMessageText(incoming) || "[Empty message]";

    // العنوان: اسم + رقم
    const subject = `${profileName} - ${from}`;

    // النص: الرسالة فقط
    const emailText = messageText;

    // HTML بسيط جدًا (نفس الرسالة فقط)
    const emailHtml = `<div style="font-family:Arial,sans-serif;white-space:pre-wrap;">${escapeHtml(messageText)}</div>`;

    await sendEmail({
      subject,
      text: emailText,
      html: emailHtml,
    });

    return NextResponse.json(
      { received: true, emailed: true },
      { status: 200 },
    );
  } catch (error) {
    console.error("Webhook POST error:", error);
    return NextResponse.json(
      { error: String(error?.message || error) },
      { status: 400 },
    );
  }
}
