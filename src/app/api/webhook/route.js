import { NextResponse } from "next/server";

export const runtime = "nodejs";

/**
 * Advanced Demo WhatsApp Bot (Next.js Route) - JavaScript Version
 * ---------------------------------------------------------------
 * Features (Demo):
 * - Multi-tenant (عدة عملاء/غرف)
 * - Language selection (AR/EN) + language switch
 * - Main menu + services menu
 * - Meeting booking flow
 * - Lead qualification flow (service + budget + timeline + notes)
 * - Human handover (demo ticket logging)
 * - Working hours / after-hours response
 * - In-memory sessions (NO DB)
 *
 * NOTE:
 * - This is DEMO ONLY (in-memory state).
 * - Production should use DB + Redis + Queue + Logs + Admin Dashboard.
 */

// ===============================
// In-memory state (DEMO ONLY)
// ===============================
const userSessions = new Map();
const handoverTickets = []; // demo only
const leadSubmissions = []; // demo only
const meetingRequests = []; // demo only

// ===============================
// Multi-tenant config (غرف العملاء)
// ===============================
const tenants = {
  default: {
    id: "default",
    nameAr: "الشركة الرئيسية",
    nameEn: "Main Company",

    supportPhone: "+201000000000",

    workingHours: {
      timezoneOffsetMinutes: 120, // Egypt UTC+2 (demo)
      days: [0, 1, 2, 3, 4], // Sun-Thu
      startHour: 9,
      endHour: 17, // exclusive
    },

    meetingLabelAr: "حجز اجتماع",
    meetingLabelEn: "Book Meeting",

    handoverLabelAr: "التحدث مع موظف",
    handoverLabelEn: "Talk to Agent",

    introAr:
      "بوت تجريبي للشركة الرئيسية )ديمو(. يمكنه الرد الآلي، جمع بيانات العملاء، وتحويلهم للدعم.",
    introEn:
      "Demo bot for Main Company. It can auto-reply, collect lead info, and hand over to support.",

    services: [
      {
        id: "srv_whatsapp_bot",
        titleAr: "بوت واتساب",
        titleEn: "WhatsApp Bot",
        descAr:
          "بوت واتساب ذكي للرد الآلي + توجيه العملاء + ربط مع لوحة تحكم + قابل للتوسع.",
        descEn:
          "Smart WhatsApp bot for auto-reply + customer routing + dashboard integration + scalability.",
      },
      {
        id: "srv_dashboard",
        titleAr: "لوحة تحكم",
        titleEn: "Dashboard",
        descAr:
          "لوحة تحكم لإدارة المحادثات والاشتراكات والمستخدمين والتقارير بشكل مركزي.",
        descEn:
          "Dashboard to manage chats, subscriptions, users, and reports centrally.",
      },
    ],

    faq: [
      {
        keywordsAr: ["سعر", "تكلفة", "الاسعار", "السعر"],
        keywordsEn: ["price", "pricing", "cost"],
        answerAr:
          "💰 السعر يعتمد على المتطلبات )عدد المستخدمين / عدد العملاء / نوع التكاملات(. يمكنني جمع احتياجك أولًا ثم إرسال عرض مناسب.",
        answerEn:
          "💰 Pricing depends on requirements )number of users / tenants / integrations(. I can collect your needs first, then provide a suitable quote.",
      },
      {
        keywordsAr: ["مدة", "وقت", "تسليم"],
        keywordsEn: ["time", "timeline", "delivery"],
        answerAr:
          "⏱️ مدة التنفيذ تعتمد على التفاصيل. نسخة MVP عادة أسرع، ثم نضيف التطويرات تدريجيًا.",
        answerEn:
          "⏱️ Delivery time depends on details. An MVP version is usually faster, then advanced features can be added incrementally.",
      },
      {
        keywordsAr: ["دعم", "صيانة"],
        keywordsEn: ["support", "maintenance"],
        answerAr:
          "🛠️ يتوفر دعم وصيانة حسب الاتفاق، ويمكن إضافة باقات شهرية للدعم والمتابعة.",
        answerEn:
          "🛠️ Support and maintenance are available based on the agreement, with optional monthly support plans.",
      },
    ],
  },

  premium: {
    id: "premium",
    nameAr: "عميل مميز",
    nameEn: "Premium Client",

    supportPhone: "+201111111111",

    workingHours: {
      timezoneOffsetMinutes: 120, // Egypt UTC+2 (demo)
      days: [0, 1, 2, 3, 4, 6], // Sun-Thu + Sat (example)
      startHour: 10,
      endHour: 20,
    },

    meetingLabelAr: "جدولة مكالمة",
    meetingLabelEn: "Schedule Call",

    handoverLabelAr: "محادثة مع مختص",
    handoverLabelEn: "Talk to Specialist",

    introAr:
      "بوت تجريبي لعميل مميز )ديمو(. يوضح دعم التعددية )عدة شركات( داخل نفس النظام.",
    introEn:
      "Demo bot for a Premium Client. It demonstrates multi-tenant support )multiple companies( in the same system.",

    services: [
      {
        id: "srv_whatsapp_bot",
        titleAr: "حلول واتساب للأعمال",
        titleEn: "WhatsApp Business Solutions",
        descAr:
          "حلول محادثات واتساب متعددة العملاء )Multi-tenant( مع توجيه ورسائل تلقائية.",
        descEn:
          "Multi-tenant WhatsApp chat solutions with routing and automated messaging.",
      },
      {
        id: "srv_dashboard",
        titleAr: "لوحة إدارة الاشتراكات",
        titleEn: "Subscriptions Dashboard",
        descAr: "إدارة الاشتراكات والخطط والعملاء والمشرفين مع تقارير أداء.",
        descEn:
          "Manage subscriptions, plans, clients, admins, and performance analytics.",
      },
    ],

    faq: [
      {
        keywordsAr: ["تجربة", "ديمو", "عرض"],
        keywordsEn: ["demo", "trial", "preview"],
        answerAr:
          "🎯 يمكن تجهيز نسخة ديمو سريعة توضح الفكرة الأساسية قبل التنفيذ الكامل.",
        answerEn:
          "🎯 A quick demo version can be prepared to demonstrate the core concept before full implementation.",
      },
      {
        keywordsAr: ["تكامل", "ربط", "api"],
        keywordsEn: ["integration", "api", "connect"],
        answerAr:
          "🔗 يمكن ربط البوت مع APIs ولوحات تحكم وأنظمة خارجية حسب المتطلبات.",
        answerEn:
          "🔗 The bot can be integrated with APIs, dashboards, and external systems based on requirements.",
      },
    ],
  },
};

// Demo: تحديد الغرفة/العميل بناءً على رقم الواتساب )آخر رقم(
function resolveTenantId(from) {
  const lastChar = String(from || "").slice(-1);
  const lastDigit = Number(lastChar || 0);

  // even => premium / odd => default
  return Number.isNaN(lastDigit)
    ? "default"
    : lastDigit % 2 === 0
      ? "premium"
      : "default";
}

// ===============================
// Helpers
// ===============================
function containsArabic(text) {
  return /[\u0600-\u06FF]/.test(text || "");
}

function detectLanguage(text) {
  if (!text) return "ar";
  return containsArabic(text) ? "ar" : "en";
}

function isValidEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email || "");
}

function t(lang, ar, en) {
  return lang === "ar" ? ar : en;
}

function normalizeText(text) {
  return String(text || "").trim();
}

function lower(text) {
  return normalizeText(text).toLowerCase();
}

function getTenant(tenantId) {
  return tenants[tenantId] || tenants.default;
}

function nowInTenantTime(tenant) {
  const offset = tenant?.workingHours?.timezoneOffsetMinutes ?? 0;
  const nowUtc = new Date();
  const utcMs = nowUtc.getTime() + nowUtc.getTimezoneOffset() * 60 * 1000;
  return new Date(utcMs + offset * 60 * 1000);
}

function isWithinWorkingHours(tenant) {
  const nowLocal = nowInTenantTime(tenant);
  const day = nowLocal.getDay();
  const hour = nowLocal.getHours();

  const wh = tenant.workingHours;
  if (!wh) return true;

  const dayAllowed = wh.days.includes(day);
  const timeAllowed = hour >= wh.startHour && hour < wh.endHour;

  return dayAllowed && timeAllowed;
}

function getSession(from) {
  const existing = userSessions.get(from);
  if (existing) return existing;

  const tenantId = resolveTenantId(from);

  const session = {
    state: "LANG_SELECT", // first step
    lang: null, // selected explicitly by user
    tenantId,
    meta: {
      createdAt: new Date().toISOString(),
      lastActiveAt: new Date().toISOString(),
    },
    data: {
      // meeting flow
      name: "",
      email: "",
      topic: "",

      // lead qualification
      leadService: "",
      budget: "",
      timeline: "",
      notes: "",

      // handover
      handoverReason: "",
    },
  };

  userSessions.set(from, session);
  return session;
}

function setSession(from, patch) {
  const current = userSessions.get(from) || {
    state: "LANG_SELECT",
    lang: null,
    tenantId: "default",
    meta: {
      createdAt: new Date().toISOString(),
      lastActiveAt: new Date().toISOString(),
    },
    data: {
      name: "",
      email: "",
      topic: "",
      leadService: "",
      budget: "",
      timeline: "",
      notes: "",
      handoverReason: "",
    },
  };

  const next = {
    ...current,
    ...patch,
    meta: {
      ...current.meta,
      ...(patch.meta || {}),
      lastActiveAt: new Date().toISOString(),
    },
    data: {
      ...current.data,
      ...(patch.data || {}),
    },
  };

  userSessions.set(from, next);
  return next;
}

function resetToMainMenu(from) {
  const current = userSessions.get(from);
  if (!current) return;

  userSessions.set(from, {
    ...current,
    state: "MAIN_MENU",
    meta: {
      ...current.meta,
      lastActiveAt: new Date().toISOString(),
    },
    data: {
      name: "",
      email: "",
      topic: "",
      leadService: "",
      budget: "",
      timeline: "",
      notes: "",
      handoverReason: "",
    },
  });
}

function clearSession(from) {
  userSessions.delete(from);
}

function classifyLead(data) {
  const budget = (data.budget || "").toLowerCase();
  const timeline = (data.timeline || "").toLowerCase();

  const highBudget = [
    "high",
    "enterprise",
    "large",
    "مرتفعة",
    "عالية",
    "كبير",
  ].some((k) => budget.includes(k));

  const urgent = [
    "urgent",
    "asap",
    "this week",
    "فوري",
    "عاجل",
    "هذا الاسبوع",
  ].some((k) => timeline.includes(k));

  if (highBudget && urgent) return "HOT";
  if (highBudget || urgent) return "WARM";
  return "COLD";
}

function matchesKeyword(text, keywords = []) {
  const l = lower(text);
  return keywords.some((k) => l.includes(lower(k)));
}

function findFaqAnswer(tenant, lang, text) {
  for (const item of tenant.faq || []) {
    const hit =
      lang === "ar"
        ? matchesKeyword(text, item.keywordsAr || [])
        : matchesKeyword(text, item.keywordsEn || []);

    if (hit) return lang === "ar" ? item.answerAr : item.answerEn;
  }
  return null;
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
        buttons: buttons.slice(0, 3).map((btn) => ({
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
// UI Senders
// ===============================
async function sendLanguageMenu(to) {
  return sendButtons(
    to,
    "👋 Welcome / أهلاً بك\nPlease choose your language / من فضلك اختر اللغة",
    [
      { id: "lang_ar", title: "العربية" },
      { id: "lang_en", title: "English" },
    ],
  );
}

async function sendMainMenu(to, session) {
  const tenant = getTenant(session.tenantId);
  const lang = session.lang || "ar";

  const body = t(
    lang,
    `أهلاً 👋\nمرحبًا بك في ${tenant.nameAr}\n\n${tenant.introAr}\n\nاختر من القائمة:`,
    `Hello 👋\nWelcome to ${tenant.nameEn}\n\n${tenant.introEn}\n\nChoose an option:`,
  );

  const meetingLabel = t(lang, tenant.meetingLabelAr, tenant.meetingLabelEn);

  return sendButtons(to, body, [
    { id: "services", title: t(lang, "الخدمات", "Services") },
    { id: "book_meeting", title: meetingLabel },
    { id: "lead_start", title: t(lang, "طلب عرض", "Get Quote") },
  ]);
}

async function sendMoreMenu(to, session) {
  const tenant = getTenant(session.tenantId);
  const lang = session.lang || "ar";

  return sendButtons(
    to,
    t(
      lang,
      `خيارات إضافية في ${tenant.nameAr}:`,
      `More options in ${tenant.nameEn}:`,
    ),
    [
      { id: "support", title: t(lang, "الدعم", "Support") },
      {
        id: "talk_agent",
        title: t(lang, tenant.handoverLabelAr, tenant.handoverLabelEn),
      },
      { id: "back_main", title: t(lang, "رجوع", "Back") },
    ],
  );
}

async function sendServicesMenu(to, session) {
  const tenant = getTenant(session.tenantId);
  const lang = session.lang || "ar";

  const services = tenant.services || [];
  const s1 = services[0];
  const s2 = services[1];

  return sendButtons(
    to,
    t(
      lang,
      "📦 خدماتنا التجريبية\nاختر خدمة لمعرفة تفاصيلها:",
      "📦 Demo Services\nChoose a service to learn more:",
    ),
    [
      {
        id: s1?.id || "srv_whatsapp_bot",
        title: s1
          ? lang === "ar"
            ? s1.titleAr
            : s1.titleEn
          : t(lang, "بوت واتساب", "WhatsApp Bot"),
      },
      {
        id: s2?.id || "srv_dashboard",
        title: s2
          ? lang === "ar"
            ? s2.titleAr
            : s2.titleEn
          : t(lang, "لوحة تحكم", "Dashboard"),
      },
      { id: "more_menu", title: t(lang, "المزيد", "More") },
    ],
  );
}

async function sendLeadServiceButtons(to, session) {
  const lang = session.lang || "ar";
  return sendButtons(
    to,
    t(
      lang,
      "🎯 طلب عرض سعر\nاختر نوع الخدمة المطلوبة:",
      "🎯 Get a Quote\nChoose the required service type:",
    ),
    [
      { id: "lead_srv_whatsapp", title: t(lang, "بوت واتساب", "WhatsApp Bot") },
      { id: "lead_srv_dashboard", title: t(lang, "لوحة تحكم", "Dashboard") },
      { id: "lead_srv_other", title: t(lang, "خدمة أخرى", "Other") },
    ],
  );
}

async function sendLeadBudgetButtons(to, session) {
  const lang = session.lang || "ar";
  return sendButtons(
    to,
    t(lang, "💰 اختر الميزانية التقريبية:", "💰 Choose an approximate budget:"),
    [
      { id: "budget_low", title: t(lang, "منخفضة", "Low") },
      { id: "budget_mid", title: t(lang, "متوسطة", "Medium") },
      { id: "budget_high", title: t(lang, "مرتفعة", "High") },
    ],
  );
}

async function sendLeadTimelineButtons(to, session) {
  const lang = session.lang || "ar";
  return sendButtons(
    to,
    t(lang, "⏱️ متى تريد البدء؟", "⏱️ When do you want to start?"),
    [
      { id: "timeline_urgent", title: t(lang, "فوري", "Urgent") },
      { id: "timeline_soon", title: t(lang, "خلال شهر", "Within 1 month") },
      { id: "timeline_later", title: t(lang, "لاحقًا", "Later") },
    ],
  );
}

async function sendAfterHoursNotice(to, session) {
  const tenant = getTenant(session.tenantId);
  const lang = session.lang || "ar";
  const wh = tenant.workingHours;

  await sendText(
    to,
    t(
      lang,
      `⏰ خارج أوقات العمل حاليًا\nساعات العمل: من ${wh.startHour}:00 إلى ${wh.endHour}:00\nيمكنك ترك بياناتك الآن وسنتواصل معك في وقت العمل.`,
      `⏰ We are currently outside working hours.\nWorking hours: ${wh.startHour}:00 - ${wh.endHour}:00\nYou can leave your details now and we will contact you during business hours.`,
    ),
  );
}

// ===============================
// Message Handlers
// ===============================
async function handleGlobalTextCommands(from, session, textBody) {
  const cmd = lower(textBody);

  // commands available in any state
  const menuCommands = [
    "menu",
    "start",
    "القائمة",
    "ابدأ",
    "ابدء",
    "main menu",
  ];
  const langCommands = ["lang", "language", "اللغة", "تغيير اللغة"];
  const resetCommands = ["reset", "restart", "ابدأ من جديد", "اعادة", "إعادة"];
  const supportCommands = ["support", "دعم"];
  const agentCommands = ["agent", "موظف", "بشر", "human"];
  const moreCommands = ["more", "المزيد"];

  if (menuCommands.includes(cmd)) {
    const updated = setSession(from, { state: "MAIN_MENU" });
    await sendMainMenu(from, updated);
    return true;
  }

  if (moreCommands.includes(cmd)) {
    const updated = setSession(from, { state: "MORE_MENU" });
    await sendMoreMenu(from, updated);
    return true;
  }

  if (langCommands.includes(cmd)) {
    setSession(from, { state: "LANG_SELECT" });
    await sendLanguageMenu(from);
    return true;
  }

  if (resetCommands.includes(cmd)) {
    // keeps tenant and lang if available, clears flow data
    resetToMainMenu(from);
    const updated = getSession(from);

    if (!updated.lang) {
      await sendLanguageMenu(from);
    } else {
      await sendText(
        from,
        t(
          updated.lang,
          "تمت إعادة ضبط المحادثة ✅",
          "Conversation has been reset ✅",
        ),
      );
      await sendMainMenu(from, updated);
    }
    return true;
  }

  if (supportCommands.includes(cmd)) {
    const tenant = getTenant(session.tenantId);
    const updated = setSession(from, { state: "MORE_MENU" });

    await sendText(
      from,
      t(
        updated.lang || "ar",
        `☎️ الدعم الفني\nيمكنك التواصل على:\n${tenant.supportPhone}`,
        `☎️ Support\nYou can contact us at:\n${tenant.supportPhone}`,
      ),
    );
    await sendMoreMenu(from, updated);
    return true;
  }

  if (agentCommands.includes(cmd)) {
    setSession(from, { state: "HANDOVER_REASON" });
    await sendText(
      from,
      t(
        session.lang || "ar",
        "👨‍💼 تحويل لموظف\nمن فضلك اكتب سبب طلب التحويل أو سؤالك باختصار:",
        "👨‍💼 Human handover\nPlease write the reason for handover or your question briefly:",
      ),
    );
    return true;
  }

  return false;
}

async function handleTextMessage(from, session, textBody) {
  const lang = session.lang || detectLanguage(textBody);
  const tenant = getTenant(session.tenantId);

  // 1) If language not selected yet => force language menu
  if (!session.lang || session.state === "LANG_SELECT") {
    await sendLanguageMenu(from);
    return;
  }

  // 2) Global commands
  const handledGlobal = await handleGlobalTextCommands(from, session, textBody);
  if (handledGlobal) return;

  // 3) State-based flows
  if (session.state === "BOOK_MEETING_NAME") {
    setSession(from, {
      state: "BOOK_MEETING_EMAIL",
      data: { name: textBody },
    });

    await sendText(
      from,
      t(
        lang,
        "ممتاز ✅\nمن فضلك اكتب الإيميل الخاص بك 📧",
        "Great ✅\nPlease enter your email address 📧",
      ),
    );
    return;
  }

  if (session.state === "BOOK_MEETING_EMAIL") {
    if (!isValidEmail(textBody)) {
      await sendText(
        from,
        t(
          lang,
          "❌ الإيميل غير صحيح.\nمثال: example@mail.com",
          "❌ Invalid email format.\nExample: example@mail.com",
        ),
      );
      return;
    }

    setSession(from, {
      state: "BOOK_MEETING_TOPIC",
      data: { email: textBody },
    });

    await sendText(
      from,
      t(
        lang,
        "ممتاز ✅\nاكتب باختصار موضوع الاجتماع )مثال: مناقشة البوت / التسعير / التكامل(",
        "Great ✅\nPlease write a short meeting topic )e.g. bot discussion / pricing / integration(",
      ),
    );
    return;
  }

  if (session.state === "BOOK_MEETING_TOPIC") {
    const updated = setSession(from, {
      state: "MAIN_MENU",
      data: { topic: textBody },
    });

    const meetingEntry = {
      tenantId: updated.tenantId,
      tenantName: lang === "ar" ? tenant.nameAr : tenant.nameEn,
      from,
      lang: updated.lang,
      name: updated.data.name,
      email: updated.data.email,
      topic: updated.data.topic,
      createdAt: new Date().toISOString(),
    };
    meetingRequests.push(meetingEntry);

    console.log("DEMO meeting request saved:", meetingEntry);

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

    resetToMainMenu(from);
    return;
  }

  // Lead qualification
  if (session.state === "LEAD_OTHER_SERVICE_TEXT") {
    setSession(from, {
      state: "LEAD_BUDGET",
      data: { leadService: textBody },
    });
    await sendLeadBudgetButtons(from, session);
    return;
  }

  if (session.state === "LEAD_NOTES") {
    const updated = setSession(from, {
      state: "MAIN_MENU",
      data: { notes: textBody },
    });

    const score = classifyLead(updated.data);
    const leadEntry = {
      tenantId: updated.tenantId,
      from,
      lang: updated.lang,
      service: updated.data.leadService,
      budget: updated.data.budget,
      timeline: updated.data.timeline,
      notes: updated.data.notes,
      score,
      createdAt: new Date().toISOString(),
    };
    leadSubmissions.push(leadEntry);

    console.log("DEMO lead saved:", leadEntry);

    await sendText(
      from,
      t(
        updated.lang,
        `✅ تم تسجيل طلبك بنجاح

📌 الخدمة: ${updated.data.leadService}
💰 الميزانية: ${updated.data.budget}
⏱️ وقت البدء: ${updated.data.timeline}
📝 ملاحظات: ${updated.data.notes || "لا يوجد"}

🔎 تصنيف مبدئي )ديمو(: ${score}

سيتم التواصل معك قريبًا.
أرسل "القائمة" للرجوع.`,
        `✅ Your request has been submitted successfully

📌 Service: ${updated.data.leadService}
💰 Budget: ${updated.data.budget}
⏱️ Start Time: ${updated.data.timeline}
📝 Notes: ${updated.data.notes || "N/A"}

🔎 Initial score )demo(: ${score}

We will contact you soon.
Send "menu" to return.`,
      ),
    );

    return;
  }

  // Human handover reason
  if (session.state === "HANDOVER_REASON") {
    const updated = setSession(from, {
      state: "MAIN_MENU",
      data: { handoverReason: textBody },
    });

    const ticket = {
      tenantId: updated.tenantId,
      from,
      lang: updated.lang,
      reason: updated.data.handoverReason,
      status: "OPEN",
      createdAt: new Date().toISOString(),
    };
    handoverTickets.push(ticket);

    console.log("DEMO handover ticket:", ticket);

    const inHours = isWithinWorkingHours(tenant);

    await sendText(
      from,
      t(
        updated.lang,
        inHours
          ? `✅ تم تحويل طلبك لأحد الموظفين )ديمو(\n📝 السبب: ${updated.data.handoverReason}\n☎️ رقم الدعم: ${tenant.supportPhone}\nسيتم الرد عليك قريبًا.`
          : `✅ تم تسجيل طلب التحويل )ديمو(\n📝 السبب: ${updated.data.handoverReason}\n⏰ خارج أوقات العمل حاليًا، وسيتم الرد عليك في أقرب وقت عمل.\n☎️ رقم الدعم: ${tenant.supportPhone}`,
        inHours
          ? `✅ Your request has been handed over to an agent )demo(\n📝 Reason: ${updated.data.handoverReason}\n☎️ Support: ${tenant.supportPhone}\nYou will be contacted soon.`
          : `✅ Your handover request has been recorded )demo(\n📝 Reason: ${updated.data.handoverReason}\n⏰ We are currently outside working hours. We will respond during business hours.\n☎️ Support: ${tenant.supportPhone}`,
      ),
    );

    return;
  }

  // 4) FAQ simple fallback before main menu
  const faqAnswer = findFaqAnswer(tenant, lang, textBody);
  if (faqAnswer) {
    await sendText(from, faqAnswer);
    await sendMoreMenu(from, session);
    return;
  }

  // 5) Default behavior => main menu
  const updated = setSession(from, { state: "MAIN_MENU" });
  await sendMainMenu(from, updated);
}

async function handleInteractiveMessage(from, session, incomingMessage) {
  const buttonReply = incomingMessage?.interactive?.button_reply;
  if (!buttonReply) return false;

  const selectedId = buttonReply.id;
  const tenant = getTenant(session.tenantId);

  // Language selection
  if (selectedId === "lang_ar") {
    const updated = setSession(from, { lang: "ar", state: "MAIN_MENU" });

    await sendText(from, "تم اختيار اللغة العربية ✅");

    if (!isWithinWorkingHours(tenant)) {
      await sendAfterHoursNotice(from, updated);
    }

    await sendMainMenu(from, updated);
    return true;
  }

  if (selectedId === "lang_en") {
    const updated = setSession(from, { lang: "en", state: "MAIN_MENU" });

    await sendText(from, "English selected ✅");

    if (!isWithinWorkingHours(tenant)) {
      await sendAfterHoursNotice(from, updated);
    }

    await sendMainMenu(from, updated);
    return true;
  }

  const lang = session.lang || "ar";

  // Main / Navigation
  if (selectedId === "services") {
    const updated = setSession(from, { state: "SERVICES_MENU" });
    await sendServicesMenu(from, updated);
    return true;
  }

  if (selectedId === "more_menu") {
    const updated = setSession(from, { state: "MORE_MENU" });
    await sendMoreMenu(from, updated);
    return true;
  }

  if (selectedId === "back_main") {
    const updated = setSession(from, { state: "MAIN_MENU" });
    await sendMainMenu(from, updated);
    return true;
  }

  if (selectedId === "support") {
    await sendText(
      from,
      t(
        lang,
        `☎️ الدعم الفني\nيمكنك التواصل على:\n${tenant.supportPhone}\n\nأرسل "القائمة" للرجوع.`,
        `☎️ Support\nYou can contact us at:\n${tenant.supportPhone}\n\nSend "menu" to go back.`,
      ),
    );
    return true;
  }

  if (selectedId === "talk_agent") {
    setSession(from, { state: "HANDOVER_REASON" });

    if (!isWithinWorkingHours(tenant)) {
      await sendAfterHoursNotice(from, session);
    }

    await sendText(
      from,
      t(
        lang,
        "👨‍💼 تحويل لموظف\nمن فضلك اكتب سبب طلب التحويل أو سؤالك باختصار:",
        "👨‍💼 Human handover\nPlease write the reason for handover or your question briefly:",
      ),
    );
    return true;
  }

  // Booking meeting
  if (selectedId === "book_meeting") {
    setSession(from, {
      state: "BOOK_MEETING_NAME",
      data: { name: "", email: "", topic: "" },
    });

    if (!isWithinWorkingHours(tenant)) {
      await sendAfterHoursNotice(from, session);
    }

    await sendText(
      from,
      t(
        lang,
        "📅 حجز اجتماع\nمن فضلك اكتب اسمك الكامل:",
        "📅 Book Meeting\nPlease enter your full name:",
      ),
    );
    return true;
  }

  // Start lead flow
  if (selectedId === "lead_start") {
    setSession(from, {
      state: "LEAD_SERVICE",
      data: { leadService: "", budget: "", timeline: "", notes: "" },
    });

    if (!isWithinWorkingHours(tenant)) {
      await sendAfterHoursNotice(from, session);
    }

    await sendLeadServiceButtons(from, session);
    return true;
  }

  // Services details
  if (selectedId === "srv_whatsapp_bot" || selectedId === "srv_dashboard") {
    const item = (tenant.services || []).find((s) => s.id === selectedId);

    if (item) {
      await sendText(from, lang === "ar" ? item.descAr : item.descEn);
    } else {
      await sendText(
        from,
        t(
          lang,
          "📦 تفاصيل الخدمة غير متوفرة حاليًا.",
          "📦 Service details are not available right now.",
        ),
      );
    }

    await sendMoreMenu(from, session);
    return true;
  }

  // Lead service selection
  if (selectedId === "lead_srv_whatsapp") {
    setSession(from, {
      state: "LEAD_BUDGET",
      data: { leadService: t(lang, "بوت واتساب", "WhatsApp Bot") },
    });
    await sendLeadBudgetButtons(from, session);
    return true;
  }

  if (selectedId === "lead_srv_dashboard") {
    setSession(from, {
      state: "LEAD_BUDGET",
      data: { leadService: t(lang, "لوحة تحكم", "Dashboard") },
    });
    await sendLeadBudgetButtons(from, session);
    return true;
  }

  if (selectedId === "lead_srv_other") {
    setSession(from, { state: "LEAD_OTHER_SERVICE_TEXT" });
    await sendText(
      from,
      t(
        lang,
        "اكتب نوع الخدمة المطلوبة باختصار:",
        "Please write the required service type briefly:",
      ),
    );
    return true;
  }

  // Lead budget
  if (["budget_low", "budget_mid", "budget_high"].includes(selectedId)) {
    const budgetMap = {
      budget_low: t(lang, "منخفضة", "Low"),
      budget_mid: t(lang, "متوسطة", "Medium"),
      budget_high: t(lang, "مرتفعة", "High"),
    };

    setSession(from, {
      state: "LEAD_TIMELINE",
      data: { budget: budgetMap[selectedId] },
    });

    await sendLeadTimelineButtons(from, session);
    return true;
  }

  // Lead timeline
  if (
    ["timeline_urgent", "timeline_soon", "timeline_later"].includes(selectedId)
  ) {
    const timelineMap = {
      timeline_urgent: t(lang, "فوري", "Urgent"),
      timeline_soon: t(lang, "خلال شهر", "Within 1 month"),
      timeline_later: t(lang, "لاحقًا", "Later"),
    };

    setSession(from, {
      state: "LEAD_NOTES",
      data: { timeline: timelineMap[selectedId] },
    });

    await sendText(
      from,
      t(
        lang,
        "📝 اكتب أي تفاصيل إضافية )اختياري( ثم أرسلها الآن.",
        "📝 Please write any extra details )optional( and send now.",
      ),
    );
    return true;
  }

  return false;
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
    const from = incomingMessage?.from;

    if (!from) {
      return NextResponse.json(
        { received: true, type: "missing-from" },
        { status: 200 },
      );
    }

    const session = getSession(from);

    // TEXT
    if (incomingMessage.type === "text") {
      const textBody = normalizeText(incomingMessage?.text?.body);

      // لو لسه اللغة غير مختارة، ممكن نستخدم detect كـ hint فقط )بدون تثبيت(
      if (!session.lang && textBody) {
        // optional hint only; do not lock language
        const hintLang = detectLanguage(textBody);
        setSession(from, { meta: { hintLang } });
      }

      await handleTextMessage(from, getSession(from), textBody);

      return NextResponse.json(
        { received: true, replied: true },
        { status: 200 },
      );
    }

    // INTERACTIVE BUTTONS
    if (incomingMessage.type === "interactive") {
      const handled = await handleInteractiveMessage(
        from,
        getSession(from),
        incomingMessage,
      );

      if (handled) {
        return NextResponse.json(
          { received: true, replied: true },
          { status: 200 },
        );
      }
    }

    // Fallback for unsupported types
    const fallbackSession = getSession(from);

    if (!fallbackSession.lang) {
      await sendLanguageMenu(from);
    } else {
      await sendText(
        from,
        t(
          fallbackSession.lang,
          "حالياً البوت يدعم النصوص والأزرار فقط ✅\nأرسل أي رسالة لعرض القائمة.",
          "Currently, the bot supports text and buttons only ✅\nSend any message to view the menu.",
        ),
      );
    }

    return NextResponse.json(
      { received: true, replied: true },
      { status: 200 },
    );
  } catch (error) {
    console.error("Webhook POST error:", error);
    return NextResponse.json({ error: "Invalid payload" }, { status: 400 });
  }
}
