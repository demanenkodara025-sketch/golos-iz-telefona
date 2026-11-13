import { timingSafeEqual } from "node:crypto";
import { handleUpdate } from "@/lib/bot";
import type { TelegramUpdate } from "@/lib/telegram";

export const runtime = "nodejs";
export const maxDuration = 60;

function validSecret(received: string | null) {
  const expected = process.env.TELEGRAM_WEBHOOK_SECRET;
  if (!expected || !received) return false;
  const a = Buffer.from(received);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

export async function POST(request: Request) {
  if (!validSecret(request.headers.get("x-telegram-bot-api-secret-token"))) {
    return new Response("Unauthorized", { status: 401 });
  }

  const update = (await request.json()) as TelegramUpdate;
  if (typeof update?.update_id !== "number") {
    return new Response("Bad request", { status: 400 });
  }

  await handleUpdate(update);
  return Response.json({ ok: true });
}
