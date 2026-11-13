import { telegram } from "@/lib/telegram";

export const runtime = "nodejs";
export const maxDuration = 30;

export async function GET(request: Request) {
  const url = new URL(request.url);
  const supplied = url.searchParams.get("key");
  const expected = process.env.TELEGRAM_SETUP_SECRET;

  if (!expected || !supplied || supplied !== expected) {
    return new Response("Unauthorized", { status: 401 });
  }

  const host = request.headers.get("x-forwarded-host") || url.host;
  const protocol = request.headers.get("x-forwarded-proto") || "https";
  const webhookUrl = `${protocol}://${host}/api/telegram`;

  try {
    await telegram("setWebhook", {
      url: webhookUrl,
      secret_token: process.env.TELEGRAM_WEBHOOK_SECRET,
      allowed_updates: ["message"],
      drop_pending_updates: true,
    });
    await telegram("setMyCommands", {
      commands: [
        { command: "start", description: "Начать разговор" },
        { command: "reset", description: "Начать разговор заново" },
        { command: "proactive_on", description: "Разрешить редкие сообщения первым" },
        { command: "proactive_off", description: "Отключить сообщения первым" }
      ]
    });
    const info = await telegram("getWebhookInfo");
    return Response.json({ ok: true, webhookUrl, info });
  } catch (error) {
    console.error("Webhook setup failed:", error);
    return Response.json({ ok: false, error: "Webhook setup failed. Check Vercel logs." }, { status: 500 });
  }
}
