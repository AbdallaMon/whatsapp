import { NextResponse } from "next/server";

export const runtime = "nodejs";

/**
 * Demo WhatsApp Bot (Next.js Route) - JavaScript Version
 * - Auto language detection (AR/EN)
 * - Main menu + services + meeting booking flow
 * - Simple multi-tenant concept (demo)
 *
 * NOTE: In-memory only for demo.
 * Production should use DB + Redis.
 */

// ===============================
// In-memory state (DEMO ONLY)
// ===============================
const userSessions = new Map();

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

// ديمو بسيط: تحديد الغرفة/العميل بناءً على رقم الواتساب (آخر رقم)
function resolveTenantId(from) {
  const lastDigit = Number(from[from.length - 1] || 0);
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
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

function t(lang, ar, en) {
  return lang === "ar" ? ar : en;
}

function getSession(from, incomingText) {
  const existing = userSessions.get(from);
  if (existing) return existing;

  const tenantId = resolveTenantId(from);
  const lang = incomingText ? detectLanguage(incomingText) : "ar";

  const session = {
    state: "MAIN_MENU",
    lang,
    tenantId,
    data: {
      name: "",
      email: "",
      topic: "",
    },
  };

  userSessions.set(from, session);
  return session;
}

function setSession(from, patch) {
  const current = userSessions.get(from) || {
    state: "MAIN_MENU",
    lang: "ar",
    tenantId: "default",
    data: { name: "", email: "", topic: "" },
  };

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

function resetFlow(from) {
  const current = userSessions.get(from);
  if (!current) return;

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
// Menus
// ===============================
async function sendMainMenu(to, session) {
  const tenant = tenants[session.tenantId] || tenants.default;
  const lang = session.lang;

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
  const lang = session.lang;

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
// POST: Receive incoming messages/events
// ===============================
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

    // If text message
    if (incomingMessage.type === "text") {
      const textBody = incomingMessage?.text?.body?.trim() || "";
      const session = getSession(from, textBody);

      // Update language based on current incoming text
      session.lang = detectLanguage(textBody);

      // Global shortcuts
      const lowered = textBody.toLowerCase();
      if (
        [
          "menu",
          "start",
          "hi",
          "hello",
          "القائمة",
          "ابدأ",
          "ابدء",
          "مرحبا",
          "السلام عليكم",
        ].includes(lowered) ||
        containsArabic(textBody)
      ) {
        // لو المستخدم في منتصف الفورم، هنكمل حسب الحالة
        // لو مش في حالة إدخال، نعرض المينيو
      }

      // Handle state-based text flow
      if (session.state === "BOOK_MEETING_NAME") {
        setSession(from, {
          state: "BOOK_MEETING_EMAIL",
          data: { name: textBody },
        });

        await sendText(
          from,
          t(
            session.lang,
            "ممتاز ✅\nمن فضلك اكتب الإيميل الخاص بك 📧",
            "Great ✅\nPlease enter your email address 📧",
          ),
        );

        return NextResponse.json(
          { received: true, replied: true },
          { status: 200 },
        );
      }

      if (session.state === "BOOK_MEETING_EMAIL") {
        if (!isValidEmail(textBody)) {
          await sendText(
            from,
            t(
              session.lang,
              "❌ الإيميل غير صحيح.\nمثال: example@mail.com",
              "❌ Invalid email format.\nExample: example@mail.com",
            ),
          );
          return NextResponse.json(
            { received: true, replied: true },
            { status: 200 },
          );
        }

        setSession(from, {
          state: "BOOK_MEETING_TOPIC",
          data: { email: textBody },
        });

        await sendText(
          from,
          t(
            session.lang,
            "ممتاز ✅\nاكتب باختصار موضوع الاجتماع )مثال: مناقشة البوت / التسعير / التكامل(",
            "Great ✅\nPlease write a short meeting topic )e.g. bot discussion / pricing / integration(",
          ),
        );

        return NextResponse.json(
          { received: true, replied: true },
          { status: 200 },
        );
      }

      if (session.state === "BOOK_MEETING_TOPIC") {
        const updated = setSession(from, {
          state: "MAIN_MENU",
          data: { topic: textBody },
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

        // Optional: clear collected data after confirmation
        resetFlow(from);

        return NextResponse.json(
          { received: true, replied: true },
          { status: 200 },
        );
      }

      // Default behavior for normal text: show main menu
      setSession(from, { state: "MAIN_MENU" });
      await sendMainMenu(from, session);

      return NextResponse.json(
        { received: true, replied: true },
        { status: 200 },
      );
    }

    // If interactive button clicked
    if (incomingMessage.type === "interactive") {
      const buttonReply = incomingMessage?.interactive?.button_reply;
      const session = getSession(from);

      if (buttonReply) {
        const selectedId = buttonReply.id;

        // Main actions
        if (selectedId === "services") {
          setSession(from, { state: "SERVICES_MENU" });
          await sendServicesMenu(from, session);
          return NextResponse.json(
            { received: true, replied: true },
            { status: 200 },
          );
        }

        if (selectedId === "book_meeting") {
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

          return NextResponse.json(
            { received: true, replied: true },
            { status: 200 },
          );
        }

        if (selectedId === "support") {
          const tenant = tenants[session.tenantId] || tenants.default;
          await sendText(
            from,
            t(
              session.lang,
              `☎️ الدعم الفني\nيمكنك التواصل على:\n${tenant.supportPhone}\n\nأرسل "القائمة" للرجوع.`,
              `☎️ Support\nYou can contact us at:\n${tenant.supportPhone}\n\nSend "menu" to go back.`,
            ),
          );

          return NextResponse.json(
            { received: true, replied: true },
            { status: 200 },
          );
        }

        // Services submenu
        if (selectedId === "srv_whatsapp_bot") {
          await sendText(
            from,
            t(
              session.lang,
              "🤖 خدمة بوت واتساب\nبوت ذكي للرد الآلي + توجيه العملاء + ربط بلوحة تحكم + قابلية التوسع لعدة عملاء.",
              "🤖 WhatsApp Bot Service\nSmart auto-reply bot + customer routing + dashboard integration + scalable for multi-client usage.",
            ),
          );
          await sendServicesMenu(from, session);
          return NextResponse.json(
            { received: true, replied: true },
            { status: 200 },
          );
        }

        if (selectedId === "srv_dashboard") {
          await sendText(
            from,
            t(
              session.lang,
              "📊 لوحة التحكم\nإدارة المحادثات / الاشتراكات / المستخدمين / تقارير الأداء بشكل مركزي.",
              "📊 Dashboard\nManage chats / subscriptions / users / performance reports centrally.",
            ),
          );
          await sendServicesMenu(from, session);
          return NextResponse.json(
            { received: true, replied: true },
            { status: 200 },
          );
        }

        if (selectedId === "back_main") {
          setSession(from, { state: "MAIN_MENU" });
          await sendMainMenu(from, session);
          return NextResponse.json(
            { received: true, replied: true },
            { status: 200 },
          );
        }
      }
    }

    // Fallback for unsupported types
    const session = getSession(from);
    await sendText(
      from,
      t(
        session.lang,
        "حالياً البوت يدعم النصوص والأزرار فقط ✅\nأرسل أي رسالة لعرض القائمة.",
        "Currently, the bot supports text and buttons only ✅\nSend any message to view the menu.",
      ),
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
