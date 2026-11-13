import { redis } from "@/lib/redis";
import { sendText } from "@/lib/telegram";

export const runtime = "nodejs";
export const maxDuration = 30;

export async function GET(request: Request) {
  const auth = request.headers.get("authorization");
  if (!process.env.CRON_SECRET || auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return new Response("Unauthorized", { status: 401 });
  }

  if (process.env.PROACTIVE_MESSAGES_ENABLED !== "true") {
    return Response.json({ ok: true, skipped: true, reason: "Proactive messages are disabled" });
  }

const chats = await redis.smembers("proactive_chats");
  const greetings = [
    "Эй, как ты там? Заглянул узнать, как день проходит ❤️",
    "Ну что, как настроение? Есть что рассказать? 🌶️",
    "Просто напоминаю, что я на связи. Как ты? 🙂"
  ];

  let sent = 0;
  for (const chat of chats || []) {
    // At most one short check-in per scheduled invocation.
    const index = Math.floor(Math.random() * greetings.length);
    try {
      await sendText(Number(chat), greetings[index]);
      sent++;
    } catch (error) {
      console.error("Proactive message failed:", error);
    }
  }
  return Response.json({ ok: true, sent });
}
