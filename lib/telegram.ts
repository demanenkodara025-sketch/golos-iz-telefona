export type TelegramUpdate = {
  update_id: number;
  message?: {
    message_id: number;
    chat: { id: number; type: string };
    from?: { id: number; first_name?: string };
    text?: string;
    voice?: { file_id: string; duration?: number; mime_type?: string };
  };
};

const token = process.env.TELEGRAM_BOT_TOKEN;

function apiUrl(method: string) {
  if (!token) throw new Error("Missing TELEGRAM_BOT_TOKEN");
  return `https://api.telegram.org/bot${token}/${method}`;
}

export async function telegram<T = unknown>(method: string, body?: Record<string, unknown>): Promise<T> {
  const response = await fetch(apiUrl(method), {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body ?? {}),
    cache: "no-store",
  });
  const data = await response.json();
  if (!response.ok || !data.ok) {
    throw new Error(`Telegram ${method} failed: ${data.description || response.statusText}`);
  }
  return data.result as T;
}

export async function sendText(chatId: number, text: string) {
  // Telegram text messages are limited to 4096 characters.
  const safeText = text.length > 4000 ? text.slice(0, 3990) + "…" : text;
  return telegram("sendMessage", { chat_id: chatId, text: safeText });
}

export async function sendVoice(chatId: number, audio: Buffer) {
  if (!token) throw new Error("Missing TELEGRAM_BOT_TOKEN");
  const form = new FormData();
  form.set("chat_id", String(chatId));
  form.set("voice", new Blob([new Uint8Array(audio)], { type: "audio/mpeg" }), "reply.mp3");
  const response = await fetch(apiUrl("sendVoice"), { method: "POST", body: form, cache: "no-store" });
  const data = await response.json();
  if (!response.ok || !data.ok) {
    throw new Error(`Telegram sendVoice failed: ${data.description || response.statusText}`);
  }
  return data.result;
}

export async function downloadTelegramFile(fileId: string): Promise<Buffer> {
  const result = await telegram<{ file_path?: string }>("getFile", { file_id: fileId });
  if (!result.file_path || !token) throw new Error("Telegram did not return a file path");
  const response = await fetch(`https://api.telegram.org/file/bot${token}/${result.file_path}`, { cache: "no-store" });
  if (!response.ok) throw new Error("Could not download Telegram voice message");
  return Buffer.from(await response.arrayBuffer());
}
