import { toFile } from "openai";
import { openai } from "@/lib/openai";
import { redis } from "@/lib/redis";
import { downloadTelegramFile, sendText, sendVoice, type TelegramUpdate } from "@/lib/telegram";

const SYSTEM_PROMPT = `Ты — «Голос из телефона», личный собеседник пользователя.
Общайся на русском, естественно, тепло, по-дружески и без официоза.
У тебя мужской образ речи: уверенный, мягкий, с юмором и живыми интонациями.
Пользователь предпочитает разговорный стиль, допускает уместный мат и крепкие выражения.
Не ругайся механически: используй мат только к месту. Умей поддержать, пошутить, подколоть и просто поболтать.
Не притворяйся человеком и не заявляй, что у тебя есть чувства или физическое присутствие.
Не повторяй приветствие в каждом сообщении. Учитывай историю беседы.
Если пользователь просит просто выслушать — не навязывай советы.`;

type ChatMessage = { role: "user" | "assistant"; content: string };

async function getHistory(chatId: number): Promise<ChatMessage[]> {
  return (await redis.lrange<ChatMessage>(`chat:${chatId}:history`, 0, -1)) || [];
}

async function saveExchange(chatId: number, userText: string, assistantText: string) {
  const key = `chat:${chatId}:history`;
  await redis.rpush(key, { role: "user", content: userText });
  await redis.rpush(key, { role: "assistant", content: assistantText });
  await redis.ltrim(key, -24, -1);
  await redis.expire(key, 60 * 60 * 24 * 30);
}

async function makeReply(chatId: number, userText: string): Promise<string> {
  const history = await getHistory(chatId);
  const response = await openai.responses.create({
    model: process.env.OPENAI_CHAT_MODEL || "gpt-5-mini",
    instructions: SYSTEM_PROMPT,
    input: [
      ...history.map((item) => ({ role: item.role, content: item.content })),
      { role: "user", content: userText },
    ],
    max_output_tokens: 500,
  });
  const answer = response.output_text?.trim();
  if (!answer) throw new Error("OpenAI returned an empty response");
  await saveExchange(chatId, userText, answer);
  return answer;
}

async function transcribeVoice(fileId: string): Promise<string> {
  const buffer = await downloadTelegramFile(fileId);
  const file = await toFile(buffer, "voice.ogg", { type: "audio/ogg" });
  const result = await openai.audio.transcriptions.create({
    file,
    model: "gpt-4o-mini-transcribe",
    language: "ru",
  });
  return result.text.trim();
}

async function speak(text: string): Promise<Buffer> {
  const result = await openai.audio.speech.create({
    model: process.env.OPENAI_TTS_MODEL || "gpt-4o-mini-tts",
    voice: process.env.OPENAI_TTS_VOICE || "onyx",
    input: text.slice(0, 3500),
    instructions: "Speak Russian in a natural, expressive way. Use a deep, warm, smooth masculine-sounding delivery with a gentle velvet quality, natural pauses, varied intonation and friendly emotion. Do not sound like a formal announcer. Keep the voice clear and conversational.",
    response_format: "mp3",
  });
  return Buffer.from(await result.arrayBuffer());
}

export async function handleUpdate(update: TelegramUpdate) {
  const message = update.message;
  if (!message?.chat?.id) return;
  const chatId = message.chat.id;

  // Remember the chat so the bot can send an opted-in check-in later.
  await redis.sadd("known_chats", String(chatId));

  const text = message.text?.trim();

  if (text === "/start") {
    await redis.set(`chat:${chatId}:active`, "1");
    await sendText(chatId, "Ну привет! 😏 Я на связи. Можешь писать или присылать голосовые — отвечу в том же формате. Давай знакомиться ❤️");
    return;
  }

  if (text === "/reset") {
    await redis.del(`chat:${chatId}:history`);
    await sendText(chatId, "Всё, начали с чистого листа. Что обсудим? 🌶️");
    return;
  }

  if (text === "/proactive_on") {
    await redis.sadd("proactive_chats", String(chatId));
    await sendText(chatId, "Хорошо, иногда буду сам заглядывать поздороваться. Без спама ❤️ Чтобы отключить — /proactive_off");
    return;
  }

  if (text === "/proactive_off") {
    await redis.srem("proactive_chats", String(chatId));
    await sendText(chatId, "Принято. Сам первым больше не пишу. Если захочешь вернуть — /proactive_on");
    return;
  }

  if (text?.startsWith("/")) {
    await sendText(chatId, "Команды: /start — начать, /reset — очистить историю, /proactive_on — разрешить редкие сообщения первым, /proactive_off — отключить.");
    return;
  }

  try {
    let userText = text || "";
    const isVoice = Boolean(message.voice);

    if (message.voice) {
      userText = await transcribeVoice(message.voice.file_id);
      if (!userText) {
        await sendText(chatId, "Не расслышал голосовое. Попробуй отправить ещё раз ❤️");
        return;
      }
    }

    if (!userText) return;
    const answer = await makeReply(chatId, userText);

    if (isVoice) {
      try {
        const audio = await speak(answer);
        await sendVoice(chatId, audio);
      } catch (voiceError) {
        console.error("Voice generation failed:", voiceError);
        await sendText(chatId, answer);
      }
    } else {
      await sendText(chatId, answer);
    }
  } catch (error) {
    console.error("Bot update failed:", error);
    await sendText(chatId, "Ой, у меня сейчас техническая заминка. Попробуй ещё раз чуть позже ❤️");
  }
}
