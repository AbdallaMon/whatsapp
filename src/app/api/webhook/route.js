import { NextResponse } from "next/server";

// GET: Meta webhook verification
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

// POST: Receive incoming messages/events
export async function POST(req) {
  try {
    const body = await req.json();

    // Log webhook payload (important for testing)
    console.log("WhatsApp Webhook Event:", JSON.stringify(body, null, 2));

    return NextResponse.json({ received: true }, { status: 200 });
  } catch (error) {
    console.error("Webhook POST error:", error);
    return NextResponse.json({ error: "Invalid payload" }, { status: 400 });
  }
}
