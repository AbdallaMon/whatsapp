import { NextResponse } from "next/server";
import nodemailer from "nodemailer";

export const runtime = "nodejs";

// ===============================
// Email Config (from env)
// ===============================
const ALERT_EMAIL_TO = process.env.ALERT_EMAIL_TO || "abdotlos60@gmail.com";

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
    auth: {
      user,
      pass,
    },
  });
}

async function sendEmailAlert({ subject, text, html }) {
  const transporter = getMailer();

  const from = process.env.SMTP_FROM || "Whatsapp <info@example.com>";

  const info = await transporter.sendMail({
    from,
    to: ALERT_EMAIL_TO,
    subject,
    text,
    html,
  });

  return info;
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
    return `[Interactive Reply] ${btn || list || "No title"}`;
  }

  if (msgType === "image") {
    const caption = incoming?.image?.caption || "";
    return `[Image message]${caption ? `\nCaption: ${caption}` : ""}`;
  }

  if (msgType === "document") {
    const filename = incoming?.document?.filename || "Unknown file";
    const caption = incoming?.document?.caption || "";
    return `[Document message]\nFile: ${filename}${caption ? `\nCaption: ${caption}` : ""}`;
  }

  if (msgType === "audio") return "[Audio message]";
  if (msgType === "video") return "[Video message]";
  if (msgType === "sticker") return "[Sticker message]";
  if (msgType === "location") {
    const loc = incoming?.location;
    return `[Location]\nLat: ${loc?.latitude}\nLng: ${loc?.longitude}\nName: ${loc?.name || ""}\nAddress: ${loc?.address || ""}`;
  }

  return `[Unsupported message type: ${msgType}]`;
}

// ===============================
// POST: Receive incoming messages and send email alert
// ===============================
export async function POST(req) {
  try {
    const body = await req.json();
    console.log("Webhook Event:", JSON.stringify(body, null, 2));

    const value = body?.entry?.[0]?.changes?.[0]?.value;

    // Ignore non-message events (statuses, delivery...)
    if (!value?.messages?.length) {
      return NextResponse.json(
        { received: true, type: "non-message" },
        { status: 200 },
      );
    }

    const incoming = value.messages[0];
    const from = incoming?.from || "unknown";
    const msgType = incoming?.type || "unknown";
    const messageId = incoming?.id || "no-id";
    const timestamp = incoming?.timestamp || "";
    const profileName = value?.contacts?.[0]?.profile?.name || "Unknown";

    const messageText = extractMessageText(incoming);

    const subject = `WhatsApp Alert | ${profileName} | ${from}`;

    const emailText = `📩 New incoming WhatsApp message

From: ${profileName}
WA ID: ${from}
Type: ${msgType}
Message ID: ${messageId}
Timestamp: ${timestamp}

Message:
${messageText}

-----------------------
Raw (short):
${JSON.stringify(incoming, null, 2)}
`;

    const emailHtml = `
      <div style="font-family:Arial,sans-serif;line-height:1.6">
        <h2>📩 New incoming WhatsApp message</h2>
        <p><b>From:</b> ${escapeHtml(profileName)}</p>
        <p><b>WA ID:</b> ${escapeHtml(from)}</p>
        <p><b>Type:</b> ${escapeHtml(msgType)}</p>
        <p><b>Message ID:</b> ${escapeHtml(messageId)}</p>
        <p><b>Timestamp:</b> ${escapeHtml(timestamp)}</p>
        <hr />
        <p><b>Message:</b></p>
        <pre style="white-space:pre-wrap;background:#f6f6f6;padding:12px;border-radius:8px">${escapeHtml(messageText)}</pre>
      </div>
    `;

    await sendEmailAlert({
      subject,
      text: emailText,
      html: emailHtml,
    });

    // اختياري: ترد على العميل
    // لو مش عايز أي رد، سيبها مقفولة
    // await sendText(from, "تم استلام رسالتك ✅");

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
