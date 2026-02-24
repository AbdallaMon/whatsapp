import { NextResponse } from "next/server";

export const runtime = "nodejs";

// ===== Simple in-memory state (demo only) =====
// states:
// - MAIN_MENU
// - Q1_SUB_MENU
// - WAITING_EMAIL
const userStates = new Map();

// ===== Helpers =====
function isValidEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

async function sendWhatsAppRequest(payload) {
  const token = process.env.WHATSAPP_ACCESS_TOKEN;
  const phoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID;

  if (!token || !phoneNumberId) {
    throw new Error(
      "Missing WHATSAPP_ACCESS_TOKEN or WHATSAPP_PHONE_NUMBER_ID",
    );
  }

  const url = `https://graph.facebook.com/v21.0/${phoneNumberId}/messages`;

  const res = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });

  const data = await res.json();

  if (!res.ok) {
    console.error("WhatsApp API error:", data);
    throw new Error(data?.error?.message || "Failed to send WhatsApp message");
  }

  return data;
}

async function sendText(to, body) {
  return sendWhatsAppRequest({
    messaging_product: "whatsapp",
    to,
    type: "text",
    text: { body },
  });
}

// Main menu as BUTTONS
async function sendMainMenu(to) {
  return sendWhatsAppRequest({
    messaging_product: "whatsapp",
    to,
    type: "interactive",
    interactive: {
      type: "button",
      body: {
        text: "أهلاً 👋\nاختر من القائمة:",
      },
      action: {
        buttons: [
          {
            type: "reply",
            reply: {
              id: "q1",
              title: "سؤال واحد",
            },
          },
          {
            type: "reply",
            reply: {
              id: "q2",
              title: "سؤال اتنين",
            },
          },
        ],
      },
    },
  });
}

// Sub menu for Question 1 as BUTTONS
async function sendQ1SubMenu(to) {
  return sendWhatsAppRequest({
    messaging_product: "whatsapp",
    to,
    type: "interactive",
    interactive: {
      type: "button",
      body: {
        text: "ممتاز ✅\nاختر من سؤال واحد:",
      },
      action: {
        buttons: [
          {
            type: "reply",
            reply: {
              id: "q1_sub_1",
              title: "اختيار 1",
            },
          },
          {
            type: "reply",
            reply: {
              id: "q1_sub_2",
              title: "اختيار 2",
            },
          },
        ],
      },
    },
  });
}

// ===== GET: Meta webhook verification =====
export async function GET(req) {
  const searchParams = req.nextUrl.searchParams;

  const mode = searchParams.get("hub.mode");
  const token = searchParams.get("hub.verify_token");
  const challenge = searchParams.get("hub.challenge");

  const verifyToken = process.env.WHATSAPP_WEBHOOK_VERIFY_TOKEN;

  if (mode === "subscribe" && token && token === verifyToken) {
    return new NextResponse(challenge ?? "", {
      status: 200,
      headers: { "Content-Type": "text/plain" },
    });
  }

  return NextResponse.json({ error: "Verification failed" }, { status: 403 });
}

// ===== POST: Receive incoming messages/events =====
export async function POST(req) {
  try {
    const body = await req.json();

    console.log("WhatsApp Webhook Event:", JSON.stringify(body, null, 2));

    const change = body?.entry?.[0]?.changes?.[0];
    const value = change?.value;

    // Ignore non-message events
    if (!value?.messages?.length) {
      return NextResponse.json(
        { received: true, type: "non-message-event" },
        { status: 200 },
      );
    }

    const incomingMessage = value.messages[0];
    const from = incomingMessage.from;

    // Current user state (default = MAIN_MENU)
    const currentState = userStates.get(from) || "MAIN_MENU";

    // 1) If user sends ANY text and not waiting email -> send main menu
    if (incomingMessage.type === "text") {
      const textBody = incomingMessage?.text?.body?.trim() || "";

      // If we are waiting for email, validate email
      if (currentState === "WAITING_EMAIL") {
        if (isValidEmail(textBody)) {
          userStates.set(from, "MAIN_MENU");

          await sendText(
            from,
            `✅ تم استلام الإيميل بنجاح\n📧 الإيميل: ${textBody}\n\nأرسل أي رسالة لعرض القائمة مرة أخرى.`,
          );
        } else {
          await sendText(
            from,
            "❌ الإيميل غير صحيح.\nمن فضلك اكتب إيميل صحيح مثل:\nexample@mail.com",
          );
        }

        return NextResponse.json(
          { received: true, replied: true },
          { status: 200 },
        );
      }

      // Any text (not waiting email) => send main menu
      userStates.set(from, "MAIN_MENU");
      await sendMainMenu(from);

      return NextResponse.json(
        { received: true, replied: true },
        { status: 200 },
      );
    }

    // 2) If user clicked an interactive button
    if (incomingMessage.type === "interactive") {
      const buttonReply = incomingMessage?.interactive?.button_reply;

      if (buttonReply) {
        const selectedId = buttonReply.id;

        // Main menu -> Question 1
        if (selectedId === "q1") {
          userStates.set(from, "Q1_SUB_MENU");
          await sendQ1SubMenu(from);
          return NextResponse.json(
            { received: true, replied: true },
            { status: 200 },
          );
        }

        // Main menu -> Question 2
        if (selectedId === "q2") {
          userStates.set(from, "MAIN_MENU");
          await sendText(from, "شكراً 🙏");
          return NextResponse.json(
            { received: true, replied: true },
            { status: 200 },
          );
        }

        // Sub menu choices -> ask for email
        if (selectedId === "q1_sub_1" || selectedId === "q1_sub_2") {
          userStates.set(from, "WAITING_EMAIL");
          await sendText(from, "من فضلك اكتب الإيميل الخاص بك 📧");
          return NextResponse.json(
            { received: true, replied: true },
            { status: 200 },
          );
        }
      }
    }

    // Fallback for unsupported types
    await sendText(
      from,
      "حالياً البوت يدعم النصوص والأزرار فقط ✅\nأرسل أي رسالة لعرض القائمة.",
    );

    return NextResponse.json(
      { received: true, replied: true },
      { status: 200 },
    );
  } catch (error) {
    console.error("Webhook POST error:", error);
    return NextResponse.json({ error: "Invalid payload" }, { status: 400 });
  }
}
