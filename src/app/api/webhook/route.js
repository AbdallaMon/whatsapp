import { NextResponse } from "next/server";

export const runtime = "nodejs";

/**
 * Demo WhatsApp Bot (Next.js Route) - JavaScript Version
 * FIXED:
 * - Explicit language selection first (AR / EN)
 * - Do not resend menu on every text message
 * - Handle interactive vs text properly
 * - Better state updates and flow control
 *
 * NOTE: In-memory only for demo.
 * Production should use DB + Redis.
 */

// ===============================
// In-memory state (DEMO ONLY)
// ===============================
const userSessions = new Map();

// States:
// - CHOOSE_LANGUAGE
// - MAIN_MENU
// - SERVICES_MENU
// - BOOK_MEETING_NAME
// - BOOK_MEETING_EMAIL
// - BOOK_MEETING_TOPIC

// ===============================
// Multi-tenant demo config (غرف العملاء)
// ===============================
const tenants = {
  default: {
    id: "default",
    nameAr: "الشركة الرئيسية",
    nameEn: "Main Company",
    meetingLabelAr: "حجز اجتماع",
    meetingLabelEn: "Book Meeting",
    supportPhone: "+201000000000",
  },
  premium: {
    id: "premium",
    nameAr: "عميل مميز",
    nameEn: "Premium Client",
    meetingLabelAr: "جدولة مكالمة",
    meetingLabelEn: "Schedule Call",
    supportPhone: "+201111111111",
  },
};

function resolveTenantId(from) {
  const lastDigit = Number(from?.[from.length - 1] || 0);
  return lastDigit % 2 === 0 ? "premium" : "default";
}

// ===============================
// Helpers
// ===============================
function containsArabic(text) {
  return /[\u0600-\u06FF]/.test(text || "");
}

function detectLanguage(text) {
  return containsArabic(text) ? "ar" : "en";
}

function isValidEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email || "");
}

function t(lang, ar, en) {
  return lang === "ar" ? ar : en;
}

function normalizeText(text) {
  return (text || "").trim();
}

function normalizeLower(text) {
  return normalizeText(text).toLowerCase();
}

function isMenuCommand(text) {
  const v = normalizeLower(text);
  return [
    "menu",
    "start",
    "main menu",
    "back",
    "القائمة",
    "ابدأ",
    "ابدء",
    "رجوع",
    "منيو",
  ].includes(v);
}

function isGreeting(text) {
  const v = normalizeLower(text);
  return [
    "hi",
    "hello",
    "hey",
    "مرحبا",
    "السلام عليكم",
    "اهلا",
    "أهلا",
  ].includes(v);
}

function getSession(from) {
  let session = userSessions.get(from);

  if (!session) {
    session = {
      state: "CHOOSE_LANGUAGE",
      lang: null, // "ar" | "en"
      tenantId: resolveTenantId(from),
      data: {
        name: "",
        email: "",
        topic: "",
      },
    };
    userSessions.set(from, session);
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
  };

  userSessions.set(from, next);
  return next;
}

function resetCollectedData(from) {
  const current = getSession(from);
  userSessions.set(from, {
    ...current,
    data: { name: "", email: "", topic: "" },
  });
}

function resetToMain(from) {
  const current = getSession(from);
  userSessions.set(from, {
    ...current,
    state: "MAIN_MENU",
    data: { name: "", email: "", topic: "" },
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
// Menus / Screens
// ===============================
async function sendLanguageMenu(to) {
  return sendButtons(
    to,
    "👋 Welcome / أهلاً\nPlease choose your language / من فضلك اختر اللغة",
    [
      { id: "lang_ar", title: "العربية" },
      { id: "lang_en", title: "English" },
    ],
  );
}

async function sendMainMenu(to, session) {
  const tenant = tenants[session.tenantId] || tenants.default;
  const lang = session.lang || "ar";

  const title = t(
    lang,
    `أهلاً 👋\nمرحبًا بك في ${tenant.nameAr}\nاختر من القائمة:`,
    `Hello 👋\nWelcome to ${tenant.nameEn}\nChoose an option:`,
  );

  const meetingLabel = t(lang, tenant.meetingLabelAr, tenant.meetingLabelEn);

  return sendButtons(to, title, [
    { id: "services", title: t(lang, "الخدمات", "Services") },
    { id: "book_meeting", title: meetingLabel },
    { id: "support", title: t(lang, "الدعم", "Support") },
  ]);
}

async function sendServicesMenu(to, session) {
  const lang = session.lang || "ar";

  return sendButtons(
    to,
    t(
      lang,
      "📦 خدماتنا التجريبية\nاختر الخدمة التي تريد معرفة تفاصيلها:",
      "📦 Demo Services\nChoose a service to learn more:",
    ),
    [
      { id: "srv_whatsapp_bot", title: t(lang, "بوت واتساب", "WhatsApp Bot") },
      { id: "srv_dashboard", title: t(lang, "لوحة تحكم", "Dashboard") },
      { id: "back_main", title: t(lang, "رجوع", "Back") },
    ],
  );
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

  // 1) If no language selected yet -> force language selection first
  if (!session.lang || session.state === "CHOOSE_LANGUAGE") {
    // Optional support typing language manually
    const lower = normalizeLower(text);

    if (["ar", "arabic", "عربي", "العربية"].includes(lower)) {
      const updated = setSession(from, { lang: "ar", state: "MAIN_MENU" });
      await sendMainMenu(from, updated);
      return;
    }

    if (["en", "english", "انجليزي", "english language"].includes(lower)) {
      const updated = setSession(from, { lang: "en", state: "MAIN_MENU" });
      await sendMainMenu(from, updated);
      return;
    }

    // Any text before language selection => ask language menu again
    await sendLanguageMenu(from);
    return;
  }

  // 2) Global menu command (works from most states)
  // Important: don't break form flow unless user explicitly asks menu/back/start
  if (isMenuCommand(text)) {
    const updated = setSession(from, { state: "MAIN_MENU" });
    await sendMainMenu(from, updated);
    return;
  }

  // 3) Greeting behavior (optional)
  if (isGreeting(text) && session.state === "MAIN_MENU") {
    await sendMainMenu(from, session);
    return;
  }

  // 4) State-based form flow
  if (session.state === "BOOK_MEETING_NAME") {
    setSession(from, {
      state: "BOOK_MEETING_EMAIL",
      data: { name: text },
    });

    await sendText(
      from,
      t(
        session.lang,
        "ممتاز ✅\nمن فضلك اكتب الإيميل الخاص بك 📧",
        "Great ✅\nPlease enter your email address 📧",
      ),
    );
    return;
  }

  if (session.state === "BOOK_MEETING_EMAIL") {
    if (!isValidEmail(text)) {
      await sendText(
        from,
        t(
          session.lang,
          "❌ الإيميل غير صحيح.\nمثال: example@mail.com\n\nأو أرسل )القائمة( للرجوع.",
          "❌ Invalid email format.\nExample: example@mail.com\n\nOr send )menu( to go back.",
        ),
      );
      return;
    }

    setSession(from, {
      state: "BOOK_MEETING_TOPIC",
      data: { email: text },
    });

    await sendText(
      from,
      t(
        session.lang,
        "ممتاز ✅\nاكتب باختصار موضوع الاجتماع )مثال: مناقشة البوت / التسعير / التكامل(",
        "Great ✅\nPlease write a short meeting topic )e.g. bot discussion / pricing / integration(",
      ),
    );
    return;
  }

  if (session.state === "BOOK_MEETING_TOPIC") {
    const updated = setSession(from, {
      state: "MAIN_MENU",
      data: { topic: text },
    });

    const tenant = tenants[updated.tenantId] || tenants.default;

    await sendText(
      from,
      t(
        updated.lang,
        `✅ تم تسجيل طلب الاجتماع بنجاح

👤 الاسم: ${updated.data.name}
📧 الإيميل: ${updated.data.email}
📝 الموضوع: ${updated.data.topic}

سيتم التواصل معك قريبًا.
☎️ الدعم: ${tenant.supportPhone}

أرسل "القائمة" لعرض الخيارات مرة أخرى.`,
        `✅ Meeting request submitted successfully

👤 Name: ${updated.data.name}
📧 Email: ${updated.data.email}
📝 Topic: ${updated.data.topic}

Our team will contact you soon.
☎️ Support: ${tenant.supportPhone}

Send "menu" to show options again.`,
      ),
    );

    resetCollectedData(from);
    return;
  }

  // 5) If user is in SERVICES_MENU and sends text instead of button
  if (session.state === "SERVICES_MENU") {
    await sendText(
      from,
      t(
        session.lang,
        "من فضلك اختر من الأزرار 👇\nأو أرسل )القائمة( للرجوع.",
        "Please choose using the buttons 👇\nOr send )menu( to return.",
      ),
    );
    await sendServicesMenu(from, session);
    return;
  }

  // 6) Default text behavior in MAIN_MENU:
  // لا نعيد المينيو لكل رسالة تلقائيًا، فقط نرد رسالة توجيه بسيطة
  await sendText(
    from,
    t(
      session.lang,
      "أرسل )القائمة( لعرض الخيارات، أو اختر من الأزرار إذا كانت ظاهرة 👇",
      "Send )menu( to show options, or use the visible buttons 👇",
    ),
  );
}

async function handleInteractiveButton(from, buttonId) {
  const session = getSession(from);

  // If language not selected yet -> only accept language buttons
  if (!session.lang || session.state === "CHOOSE_LANGUAGE") {
    if (buttonId === "lang_ar") {
      const updated = setSession(from, { lang: "ar", state: "MAIN_MENU" });
      await sendMainMenu(from, updated);
      return;
    }

    if (buttonId === "lang_en") {
      const updated = setSession(from, { lang: "en", state: "MAIN_MENU" });
      await sendMainMenu(from, updated);
      return;
    }

    await sendLanguageMenu(from);
    return;
  }

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

    await sendText(
      from,
      t(
        session.lang,
        "📅 حجز اجتماع\nمن فضلك اكتب اسمك الكامل:",
        "📅 Book Meeting\nPlease enter your full name:",
      ),
    );
    return;
  }

  if (buttonId === "support") {
    const tenant = tenants[session.tenantId] || tenants.default;

    await sendText(
      from,
      t(
        session.lang,
        `☎️ الدعم الفني\nيمكنك التواصل على:\n${tenant.supportPhone}\n\nأرسل "القائمة" للرجوع.`,
        `☎️ Support\nYou can contact us at:\n${tenant.supportPhone}\n\nSend "menu" to go back.`,
      ),
    );
    return;
  }

  // Services submenu
  if (buttonId === "srv_whatsapp_bot") {
    // نخلي الحالة كما هي SERVICES_MENU
    await sendText(
      from,
      t(
        session.lang,
        "🤖 خدمة بوت واتساب\nبوت ذكي للرد الآلي + توجيه العملاء + ربط بلوحة تحكم + قابلية التوسع لعدة عملاء.",
        "🤖 WhatsApp Bot Service\nSmart auto-reply bot + customer routing + dashboard integration + scalable for multi-client usage.",
      ),
    );

    const updated = setSession(from, { state: "SERVICES_MENU" });
    await sendServicesMenu(from, updated);
    return;
  }

  if (buttonId === "srv_dashboard") {
    await sendText(
      from,
      t(
        session.lang,
        "📊 لوحة التحكم\nإدارة المحادثات / الاشتراكات / المستخدمين / تقارير الأداء بشكل مركزي.",
        "📊 Dashboard\nManage chats / subscriptions / users / performance reports centrally.",
      ),
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
    t(
      session.lang,
      "تم استلام اختيار غير معروف. أرسل )القائمة( للبدء من جديد.",
      "Unknown selection received. Send )menu( to start again.",
    ),
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

    if (!from) {
      return NextResponse.json(
        { received: true, type: "missing-from" },
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

      if (buttonReply?.id) {
        await handleInteractiveButton(from, buttonReply.id);

        return NextResponse.json(
          { received: true, replied: true, type: "interactive-button" },
          { status: 200 },
        );
      }

      // لو interactive لكن مش button_reply (مثلا list_reply مستقبلاً)
      const session = getSession(from);
      await sendText(
        from,
        t(
          session.lang || "ar",
          "تم استلام تفاعل غير مدعوم حاليًا. أرسل )القائمة( للبدء.",
          "Unsupported interactive reply received for now. Send )menu( to start.",
        ),
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
      t(
        session.lang || "ar",
        "حالياً البوت يدعم النصوص والأزرار فقط ✅\nأرسل )القائمة( أو ابدأ باختيار اللغة.",
        "Currently, the bot supports text and buttons only ✅\nSend )menu( or start by choosing a language.",
      ),
    );

    if (!session.lang || session.state === "CHOOSE_LANGUAGE") {
      await sendLanguageMenu(from);
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
