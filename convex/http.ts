import { httpRouter } from "convex/server";
import { httpAction } from "./_generated/server";
import { internal } from "./_generated/api";

const http = httpRouter();

http.route({
  path: "/telegram-webhook",
  method: "POST",
  handler: httpAction(async (ctx, request) => {
    const secret = process.env.TELEGRAM_WEBHOOK_SECRET;
    if (secret) {
      const headerSecret = request.headers.get("X-Telegram-Secret");
      const url = new URL(request.url);
      const querySecret = url.searchParams.get("secret");
      const provided = headerSecret ?? querySecret ?? "";
      if (provided !== secret) {
        return new Response("Forbidden", { status: 403 });
      }
    }

    if (request.method !== "POST") {
      return new Response("Method Not Allowed", { status: 405 });
    }

    let body: {
      update_id: number;
      message?: {
        chat: { id: number };
        from?: { id: number; username?: string; first_name?: string };
        text?: string;
      };
      callback_query?: {
        id: string;
        from: { id: number; username?: string };
        message: { chat: { id: number }; message_id: number };
        data?: string;
      };
    };
    try {
      body = (await request.json()) as typeof body;
    } catch {
      return new Response("Bad Request", { status: 400 });
    }

    const updateId = body.update_id ?? 0;

    if (body.callback_query) {
      const cq = body.callback_query;
      const chatId = String(cq.message.chat.id);
      await ctx.runMutation(internal.telegram.storeCallback, {
        callbackQueryId: cq.id,
        chatId,
        from: cq.from,
        data: cq.data ?? "",
        messageId: cq.message.message_id,
        updateId,
      });
      return new Response(null, { status: 200 });
    }

    const message = body.message;
    const chatId = message?.chat?.id != null ? String(message.chat.id) : "";
    const from = message?.from;
    const text = message?.text;

    if (chatId) {
      await ctx.runMutation(internal.telegram.storeIncoming, {
        chatId,
        from: from ?? undefined,
        text: text ?? undefined,
        updateId,
      });
    }

    return new Response(null, { status: 200 });
  }),
});

// Voice command endpoint — called by HA Assist automation
// Treats the text exactly as if the user sent it to the Telegram bot
http.route({
  path: "/voice-command",
  method: "POST",
  handler: httpAction(async (ctx, request) => {
    const secret = request.headers.get("X-Voice-Secret");
    if (secret !== process.env.PLAYWRIGHT_WORKER_SECRET) {
      return new Response("Forbidden", { status: 403 });
    }

    let body: { text: string };
    try {
      body = (await request.json()) as typeof body;
    } catch {
      return new Response("Bad Request", { status: 400 });
    }

    if (!body.text?.trim()) {
      return new Response("Bad Request: missing text", { status: 400 });
    }

    // Look up the household by the owner's Telegram user ID
    const household = await ctx.runQuery(internal.households.getMyHouseholdForVoice);
    if (!household) {
      return new Response("No household configured", { status: 404 });
    }

    // Dispatch exactly like a Telegram message — responses go back to Telegram
    await ctx.runAction(internal.botHandler.dispatch, {
      chatId: household.telegramChatId,
      telegramUserId: household.telegramUserId,
      telegramUsername: "",
      text: body.text.trim(),
    });

    return new Response(JSON.stringify({ ok: true }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  }),
});

export default http;
