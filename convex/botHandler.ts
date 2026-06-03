import { internalAction } from "./_generated/server";
import { internal } from "./_generated/api";
import { v } from "convex/values";
import { Id } from "./_generated/dataModel";
import * as telegramClient from "./telegramClient";

export const handleCallback = internalAction({
  args: {
    callbackQueryId: v.string(),
    chatId: v.string(),
    telegramUserId: v.string(),
    data: v.string(),
    messageId: v.number(),
  },
  handler: async (ctx, args) => {
    const token = getToken();
    if (!token) return;

    // Parse "pick:<docId>:<idx|skip>"
    const parts = args.data.split(":");
    if (parts[0] !== "pick" || parts.length < 3) return;

    const docId = parts[1] as Id<"pendingChoices">;
    const selection = parts[2];

    const choice = await ctx.runQuery(internal.pendingChoices.getById, { id: docId });

    if (!choice) {
      await telegramClient.answerCallbackQuery(token, args.callbackQueryId, "This choice has expired.");
      return;
    }

    await ctx.runMutation(internal.pendingChoices.remove, { id: choice._id });

    if (selection === "skip") {
      await telegramClient.answerCallbackQuery(token, args.callbackQueryId);
      await telegramClient.editMessageText(
        token, args.chatId, args.messageId,
        `⏭ Skipped "${choice.canonicalName}"`
      );
      return;
    }

    const idx = parseInt(selection, 10);
    const picked = choice.options[idx];
    if (!picked) {
      await telegramClient.answerCallbackQuery(token, args.callbackQueryId, "Invalid selection.");
      return;
    }

    // Save URL to item memory
    if (choice.itemId) {
      await ctx.runMutation(internal.householdItems.saveProductUrl, {
        itemId: choice.itemId,
        retailer: choice.retailer as "amazon" | "target" | "wegmans" | "costco",
        url: picked.url,
      });
    }

    // Clear the keyboard immediately so no attachment is generated
    await telegramClient.clearKeyboard(token, args.chatId, args.messageId);
    await telegramClient.answerCallbackQuery(token, args.callbackQueryId);
    const addingMsg = await telegramClient.sendMessage(token, args.chatId, `⏳ Adding "${picked.name}" to your ${choice.retailer} cart…`);
    const addingMsgId = addingMsg.ok ? addingMsg.result.message_id : null;

    const result = await ctx.runAction(internal.browserAutomation.addToCart, {
      householdId: choice.householdId,
      retailer: choice.retailer as "amazon" | "target" | "wegmans" | "costco",
      productUrl: picked.url,
      canonicalName: choice.canonicalName,
    });

    const statusLine = result.success
      ? `✅ Added "${picked.name}" to your ${choice.retailer} cart`
      : `❌ Failed to add "${picked.name}": ${result.error ?? "unknown error"}`;

    await telegramClient.sendMessage(token, args.chatId, statusLine);
    if (addingMsgId) await telegramClient.deleteMessage(token, args.chatId, addingMsgId);
    if (result.success) {
      await telegramClient.deleteMessage(token, args.chatId, args.messageId);
      if (choice.retailer === "wegmans") {
        await ctx.scheduler.runAfter(0, internal.browserAutomation.refreshAndSaveCart, {
          householdId: choice.householdId,
        });
      }
    }
  },
});

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
        "Hi! I'm Cart Gremlin 🛒\n\nCommands:\n/cart — show your Wegmans cart with store locations\n/list — show your item memory\n/remove <item> — remove from memory\n\nOr just send me items to add: 'add milk and eggs'"
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

    if (cmd === "/cart") {
      if (!household) {
        await telegramClient.sendMessage(token, args.chatId, notConnectedMsg);
        return null;
      }
      await telegramClient.sendMessage(token, args.chatId, "🔍 Checking your Wegmans cart…");
      const result = await ctx.runAction(internal.browserAutomation.getWegmansCart, {
        householdId: household.householdId,
      });
      if (result.items.length > 0) {
        await ctx.runMutation(internal.cartSnapshots.save, {
          householdId: household.householdId,
          retailer: "wegmans",
          items: result.items,
        });
      }
      if (result.error && result.items.length === 0) {
        await telegramClient.sendMessage(token, args.chatId,
          result.error === "Worker not configured"
            ? `Playwright worker not configured — set it in Settings:\n${settingsUrl}`
            : "Couldn't read your cart. Make sure your Wegmans session is saved in Settings."
        );
        return null;
      }
      if (result.items.length === 0) {
        await telegramClient.sendMessage(token, args.chatId, "Your Wegmans cart is empty.");
        return null;
      }
      const AISLE_EMOJI: Record<string, string> = {
        "bakery": "🥖", "beverage": "🥤", "dairy": "🥛", "deli": "🧀",
        "floral": "💐", "frozen": "🧊", "meat": "🥩", "produce": "🥦",
        "seafood": "🐟", "snack": "🍿", "bulk": "🏪", "cleaning": "🧹",
        "paper": "🧻", "pharmacy": "💊", "baby": "🍼", "international": "🌍",
        "natural": "🌿", "organic": "🌿", "wine": "🍷", "beer": "🍺",
      };
      function aisleEmoji(aisle: string | null): string {
        if (!aisle) return "🛒";
        const lower = aisle.toLowerCase();
        for (const [key, emoji] of Object.entries(AISLE_EMOJI)) {
          if (lower.includes(key)) return emoji;
        }
        return "🛒";
      }
      function escapeHtml(s: string): string {
        return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
      }

      // Group items by aisle
      const byAisle = new Map<string, typeof result.items>();
      for (const item of result.items) {
        const key = item.aisle ?? "Other";
        if (!byAisle.has(key)) byAisle.set(key, []);
        byAisle.get(key)!.push(item);
      }

      const sections: string[] = [];
      for (const [aisle, items] of byAisle) {
        const emoji = aisleEmoji(aisle === "Other" ? null : aisle);
        const header = `${emoji} <b>${escapeHtml(aisle)}</b>`;
        const itemLines = items.map((item) => {
          const qty = item.quantity > 1 ? ` ×${item.quantity}` : "";
          const price = item.price ? ` · ${item.price}` : "";
          const locParts = [
            item.aisleSide,
            item.section != null ? `Section ${item.section}` : null,
            item.shelf != null ? `Shelf ${item.shelf}` : null,
          ].filter(Boolean);
          const loc = locParts.length ? `  <i>${escapeHtml(locParts.join(" · "))}</i>` : "";
          return `${escapeHtml(item.name)}${qty}${price}${loc}`;
        });
        sections.push([header, ...itemLines].join("\n"));
      }

      const count = result.items.length;
      const header = `🛒 <b>Your Wegmans cart</b> — ${count} item${count === 1 ? "" : "s"}`;
      await telegramClient.sendMessage(
        token,
        args.chatId,
        `${header}\n\n${sections.join("\n\n")}`,
        "HTML"
      );
      return null;
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
