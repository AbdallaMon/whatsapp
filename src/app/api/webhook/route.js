import { NextResponse } from "next/server";

export const runtime = "nodejs";

/**
 * Demo WhatsApp Bot (Next.js Route) - English Only
 * FIXES:
 * - English only (removed language selection flow)
 * - Better in-memory persistence using globalThis (helps across hot reloads)
 * - Webhook duplicate message protection (Meta retries / duplicate delivery)
 * - Session TTL cleanup
 * - Cleaner state transitions
 *
 * NOTE:
 * - Still in-memory only (NO DB). Sessions can be lost on server restart/redeploy.
 * - For production reliability use Redis / DB.
 */

// =====================================================
// Global in-memory store (survives module reload in same Node process)
// =====================================================
const SESSION_TTL_MS = 1000 * 60 * 60 * 6; // 6 hours
const DEDUPE_TTL_MS = 1000 * 60 * 10; // 10 minutes for processed message IDs

function getGlobalStore() {
  if (!globalThis.__WA_BOT_STORE__) {
    globalThis.__WA_BOT_STORE__ = {
      userSessions: new Map(), // key: wa_id => session
      processedMessageIds: new Map(), // key: messageId => timestamp
      lastCleanupAt: 0,
    };
  }
  return globalThis.__WA_BOT_STORE__;
}

const store = getGlobalStore();

// States:
// - MAIN_MENU
// - SERVICES_MENU
// - BOOK_MEETING_NAME
// - BOOK_MEETING_EMAIL
// - BOOK_MEETING_TOPIC

// ===============================
// Multi-tenant demo config
// ===============================
const tenants = {
  default: {
    id: "default",
    nameEn: "Main Company",
    meetingLabelEn: "Book Meeting",
    supportPhone: "+201000000000",
  },
  premium: {
    id: "premium",
    nameEn: "Premium Client",
    meetingLabelEn: "Schedule Call",
    supportPhone: "+201111111111",
  },
};

function resolveTenantId(from) {
  const lastDigit = Number(from?.[from.length - 1] || 0);
  return Number.isNaN(lastDigit)
    ? "default"
    : lastDigit % 2 === 0
      ? "premium"
      : "default";
}

// ===============================
// Helpers
// ===============================
function isValidEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test((email || "").trim());
}

function normalizeText(text) {
  return (text || "").trim();
}

function normalizeLower(text) {
  return normalizeText(text).toLowerCase();
}

function isMenuCommand(text) {
  const v = normalizeLower(text);
  return ["menu", "start", "main menu", "back", "home"].includes(v);
}

function isGreeting(text) {
  const v = normalizeLower(text);
  return ["hi", "hello", "hey", "good morning", "good evening"].includes(v);
}

function cleanupStoreIfNeeded() {
  const now = Date.now();

  // run cleanup every ~2 minutes max
  if (now - store.lastCleanupAt < 1000 * 60 * 2) return;
  store.lastCleanupAt = now;

  // Cleanup sessions
  for (const [waId, session] of store.userSessions.entries()) {
    if (!session?.updatedAt || now - session.updatedAt > SESSION_TTL_MS) {
      store.userSessions.delete(waId);
    }
  }

  // Cleanup processed message IDs
  for (const [messageId, ts] of store.processedMessageIds.entries()) {
    if (now - ts > DEDUPE_TTL_MS) {
      store.processedMessageIds.delete(messageId);
    }
  }
}

function isDuplicateMessage(messageId) {
  if (!messageId) return false;
  cleanupStoreIfNeeded();

  if (store.processedMessageIds.has(messageId)) {
    return true;
  }

  store.processedMessageIds.set(messageId, Date.now());
  return false;
}

function getSession(from) {
  cleanupStoreIfNeeded();

  let session = store.userSessions.get(from);

  if (!session) {
    session = {
      state: "MAIN_MENU",
      lang: "en", // forced English only
      tenantId: resolveTenantId(from),
      data: {
        name: "",
        email: "",
        topic: "",
      },
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };
    store.userSessions.set(from, session);
  }

  return session;
}

function setSession(from, patch) {
  const current = getSession(from);

  const next = {
    ...current,
    ...patch,
    data: {
      ...current.data,
      ...(patch.data || {}),
    },
    updatedAt: Date.now(),
  };

  store.userSessions.set(from, next);
  return next;
}

function resetCollectedData(from) {
  const current = getSession(from);
  store.userSessions.set(from, {
    ...current,
    data: { name: "", email: "", topic: "" },
    updatedAt: Date.now(),
  });
}

function resetToMain(from) {
  const current = getSession(from);
  store.userSessions.set(from, {
    ...current,
    state: "MAIN_MENU",
    data: { name: "", email: "", topic: "" },
    updatedAt: Date.now(),
  });
}

// ===============================
// WhatsApp API
// ===============================
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

async function sendButtons(to, bodyText, buttons) {
  return sendWhatsAppRequest({
    messaging_product: "whatsapp",
    to,
    type: "interactive",
    interactive: {
      type: "button",
      body: { text: bodyText },
      action: {
        buttons: buttons.map((btn) => ({
          type: "reply",
          reply: {
            id: btn.id,
            title: btn.title,
          },
        })),
      },
    },
  });
}

// ===============================
// Menus / Screens (English only)
// ===============================
async function sendMainMenu(to, session) {
  const tenant = tenants[session.tenantId] || tenants.default;

  const title = `Hello 👋
Welcome to ${tenant.nameEn}
Choose an option:`;

  const meetingLabel = tenant.meetingLabelEn;

  return sendButtons(to, title, [
    { id: "services", title: "Services" },
    { id: "book_meeting", title: meetingLabel },
    { id: "support", title: "Support" },
  ]);
}

async function sendServicesMenu(to) {
  return sendButtons(to, "📦 Demo Services\nChoose a service to learn more:", [
    { id: "srv_whatsapp_bot", title: "WhatsApp Bot" },
    { id: "srv_dashboard", title: "Dashboard" },
    { id: "back_main", title: "Back" },
  ]);
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

  if (mode === "subscribe" && token && token === verifyToken) {
    return new NextResponse(challenge ?? "", {
      status: 200,
      headers: { "Content-Type": "text/plain" },
    });
  }

  return NextResponse.json({ error: "Verification failed" }, { status: 403 });
}

// ===============================
// Handlers
// ===============================
async function handleTextMessage(from, textBody) {
  const session = getSession(from);
  const text = normalizeText(textBody);

  // 1) Global menu command
  if (isMenuCommand(text)) {
    const updated = setSession(from, { state: "MAIN_MENU" });
    await sendMainMenu(from, updated);
    return;
  }

  // 2) Greeting behavior in MAIN_MENU
  if (isGreeting(text) && session.state === "MAIN_MENU") {
    await sendMainMenu(from, session);
    return;
  }

  // 3) State-based form flow
  if (session.state === "BOOK_MEETING_NAME") {
    if (!text) {
      await sendText(
        from,
        'Please enter your full name.\nOr send "menu" to go back.',
      );
      return;
    }

    setSession(from, {
      state: "BOOK_MEETING_EMAIL",
      data: { name: text },
    });

    await sendText(from, "Great ✅\nPlease enter your email address 📧");
    return;
  }

  if (session.state === "BOOK_MEETING_EMAIL") {
    if (!isValidEmail(text)) {
      await sendText(
        from,
        '❌ Invalid email format.\nExample: example@mail.com\n\nOr send "menu" to go back.',
      );
      return;
    }

    setSession(from, {
      state: "BOOK_MEETING_TOPIC",
      data: { email: text },
    });

    await sendText(
      from,
      "Great ✅\nPlease write a short meeting topic )e.g. bot discussion / pricing / integration(",
    );
    return;
  }

  if (session.state === "BOOK_MEETING_TOPIC") {
    if (!text) {
      await sendText(
        from,
        'Please write a short topic.\nOr send "menu" to go back.',
      );
      return;
    }

    const updated = setSession(from, {
      state: "MAIN_MENU",
      data: { topic: text },
    });

    const tenant = tenants[updated.tenantId] || tenants.default;

    await sendText(
      from,
      `✅ Meeting request submitted successfully

👤 Name: ${updated.data.name}
📧 Email: ${updated.data.email}
📝 Topic: ${updated.data.topic}

Our team will contact you soon.
☎️ Support: ${tenant.supportPhone}

Send "menu" to show options again.`,
    );

    resetCollectedData(from);
    return;
  }

  // 4) If user is in SERVICES_MENU and sends text instead of button
  if (session.state === "SERVICES_MENU") {
    await sendText(
      from,
      'Please choose using the buttons 👇\nOr send "menu" to return.',
    );
    await sendServicesMenu(from);
    return;
  }

  // 5) Default text behavior in MAIN_MENU:
  // Do NOT resend menu on every message automatically
  await sendText(
    from,
    'Send "menu" to show options, or use the visible buttons 👇',
  );
}

async function handleInteractiveButton(from, buttonId) {
  const session = getSession(from);

  // Main actions
  if (buttonId === "services") {
    const updated = setSession(from, { state: "SERVICES_MENU" });
    await sendServicesMenu(from, updated);
    return;
  }

  if (buttonId === "book_meeting") {
    setSession(from, {
      state: "BOOK_MEETING_NAME",
      data: { name: "", email: "", topic: "" },
    });

    await sendText(from, "📅 Book Meeting\nPlease enter your full name:");
    return;
  }

  if (buttonId === "support") {
    const tenant = tenants[session.tenantId] || tenants.default;

    await sendText(
      from,
      `☎️ Support\nYou can contact us at:\n${tenant.supportPhone}\n\nSend "menu" to go back.`,
    );
    return;
  }

  // Services submenu
  if (buttonId === "srv_whatsapp_bot") {
    await sendText(
      from,
      "🤖 WhatsApp Bot Service\nSmart auto-reply bot + customer routing + dashboard integration + scalable for multi-client usage.",
    );

    const updated = setSession(from, { state: "SERVICES_MENU" });
    await sendServicesMenu(from, updated);
    return;
  }

  if (buttonId === "srv_dashboard") {
    await sendText(
      from,
      "📊 Dashboard\nManage chats / subscriptions / users / performance reports centrally.",
    );

    const updated = setSession(from, { state: "SERVICES_MENU" });
    await sendServicesMenu(from, updated);
    return;
  }

  if (buttonId === "back_main") {
    const updated = setSession(from, { state: "MAIN_MENU" });
    await sendMainMenu(from, updated);
    return;
  }

  // Unknown button fallback
  await sendText(
    from,
    'Unknown selection received. Send "menu" to start again.',
  );
}

// ===============================
// POST: Receive incoming messages/events
// ===============================
export async function POST(req) {
  try {
    const body = await req.json();
    console.log("WhatsApp Webhook Event:", JSON.stringify(body, null, 2));

    const change = body?.entry?.[0]?.changes?.[0];
    const value = change?.value;

    // Ignore non-message events (statuses, delivery, etc.)
    if (!value?.messages?.length) {
      return NextResponse.json(
        { received: true, type: "non-message-event" },
        { status: 200 },
      );
    }

    const incomingMessage = value.messages[0];
    const from = incomingMessage?.from;
    const incomingMessageId = incomingMessage?.id;

    if (!from) {
      return NextResponse.json(
        { received: true, type: "missing-from" },
        { status: 200 },
      );
    }

    // Protect against duplicate webhook delivery (Meta retries)
    if (isDuplicateMessage(incomingMessageId)) {
      console.log("Duplicate message ignored:", incomingMessageId);
      return NextResponse.json(
        { received: true, duplicate: true },
        { status: 200 },
      );
    }

    // 1) Text message
    if (incomingMessage.type === "text") {
      const textBody = incomingMessage?.text?.body || "";
      await handleTextMessage(from, textBody);

      return NextResponse.json(
        { received: true, replied: true, type: "text" },
        { status: 200 },
      );
    }

    // 2) Interactive button reply
    if (incomingMessage.type === "interactive") {
      const buttonReply = incomingMessage?.interactive?.button_reply;
      const listReply = incomingMessage?.interactive?.list_reply;

      if (buttonReply?.id) {
        await handleInteractiveButton(from, buttonReply.id);

        return NextResponse.json(
          { received: true, replied: true, type: "interactive-button" },
          { status: 200 },
        );
      }

      // Optional future support for list_reply
      if (listReply?.id) {
        await handleInteractiveButton(from, listReply.id);

        return NextResponse.json(
          { received: true, replied: true, type: "interactive-list" },
          { status: 200 },
        );
      }

      await sendText(
        from,
        'Unsupported interactive reply received for now. Send "menu" to start.',
      );

      return NextResponse.json(
        { received: true, replied: true, type: "interactive-unsupported" },
        { status: 200 },
      );
    }

    // 3) Unsupported types fallback
    const session = getSession(from);
    await sendText(
      from,
      'Currently, the bot supports text and buttons only ✅\nSend "menu" to continue.',
    );

    // Optional: only auto-show menu if user is at main menu
    if (session.state === "MAIN_MENU") {
      await sendMainMenu(from, session);
    }

    return NextResponse.json(
      { received: true, replied: true, type: "unsupported" },
      { status: 200 },
    );
  } catch (error) {
    console.error("Webhook POST error:", error);
    return NextResponse.json({ error: "Invalid payload" }, { status: 400 });
  }
}
