import { internalAction } from "./_generated/server";
import { internal } from "./_generated/api";
import { v } from "convex/values";
import * as telegramClient from "./telegramClient";

function getToken(): string {
  return process.env.TELEGRAM_BOT_TOKEN ?? "";
}

export const dispatch = internalAction({
  args: {
    chatId: v.string(),
    telegramUserId: v.string(),
    telegramUsername: v.string(),
    text: v.string(),
  },
  handler: async (ctx, args) => {
    const token = getToken();
    if (!token) return null;

    const cmd = args.text.trim().toLowerCase();
    const appUrl = process.env.APP_URL ?? "http://localhost:5173";

    const settingsUrl = `${appUrl}/dashboard`;
    const notConnectedMsg = `Set your Telegram ID in Cart Gremlin settings to connect your account:\n${settingsUrl}`;

    if (cmd === "/start") {
      await telegramClient.sendMessage(
        token,
        args.chatId,
        "Hi! I'm Cart Gremlin 🛒\n\nCommands:\n/list — show your item memory\n/remove <item> — remove from memory\n\nOr just send me items to add: 'add milk and eggs'"
      );
      return null;
    }

    const household = await ctx.runQuery(internal.households.getByTelegramUserId, {
      telegramUserId: args.telegramUserId,
    });

    // Allowlist check — if the allowlist exists (even empty), sender must be in it
    if (household) {
      const allowlist = household.telegramAllowlist;
      if (allowlist !== null && allowlist !== undefined && !allowlist.includes(args.telegramUserId)) {
        await telegramClient.sendMessage(token, args.chatId, "Sorry, you're not authorized to use this bot.");
        return null;
      }
    }

    if (cmd === "/list") {
      if (!household) {
        await telegramClient.sendMessage(token, args.chatId, notConnectedMsg);
        return null;
      }
      const items = await ctx.runQuery(internal.householdItems.listForHousehold, {
        householdId: household.householdId,
      });
      const itemList = items.length > 0
        ? items.map((i, idx) => `${idx + 1}. ${i.canonicalName} (${i.preferredRetailer})`).join("\n")
        : "No items in memory yet.";
      await telegramClient.sendMessage(token, args.chatId, `Your household items:\n${itemList}`);
      return null;
    }

    if (cmd.startsWith("/remove ")) {
      const itemName = args.text.trim().slice(8).trim().toLowerCase();
      if (!household) {
        await telegramClient.sendMessage(token, args.chatId, notConnectedMsg);
        return null;
      }
      const items = await ctx.runQuery(internal.householdItems.listForHousehold, {
        householdId: household.householdId,
      });
      const match = items.find((i) => i.canonicalName === itemName);
      if (match) {
        await ctx.runMutation(internal.householdItems.remove, { itemId: match._id });
        await telegramClient.sendMessage(token, args.chatId, `Removed "${itemName}" from memory.`);
      } else {
        await telegramClient.sendMessage(token, args.chatId, `"${itemName}" not found in memory.`);
      }
      return null;
    }

    if (!household) {
      await telegramClient.sendMessage(token, args.chatId, notConnectedMsg);
      return null;
    }

    await ctx.runAction(internal.cartBuilder.execute, {
      householdId: household.householdId,
      rawMessage: args.text,
      chatId: args.chatId,
      triggeredBy: "telegram",
    });

    return null;
  },
});
