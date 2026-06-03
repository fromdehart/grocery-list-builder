import { internalAction } from "./_generated/server";
import { internal } from "./_generated/api";
import { v } from "convex/values";
import { Id } from "./_generated/dataModel";
import * as telegramClient from "./telegramClient";

type Retailer = "amazon" | "target" | "instacart" | "wegmans" | "costco";

function retailerHeuristic(category: string): Retailer {
  const wegmansCategories = ["produce", "dairy", "bakery", "frozen", "meat", "seafood", "deli", "beverages", "snacks", "condiments", "pantry", "canned", "grain"];
  const costcoCategories = ["bulk", "wholesale", "large", "paper", "cleaning supplies", "laundry"];
  const amazonCategories = ["electronics", "supplements", "vitamins", "books", "office", "personal care", "health", "beauty", "toys"];
  const targetCategories = ["clothing", "home", "decor", "kitchen", "bedding", "apparel"];
  const lower = category.toLowerCase();
  if (costcoCategories.some((c) => lower.includes(c))) return "costco";
  if (wegmansCategories.some((c) => lower.includes(c))) return "wegmans";
  if (amazonCategories.some((c) => lower.includes(c))) return "amazon";
  if (targetCategories.some((c) => lower.includes(c))) return "target";
  return "wegmans";
}

type ExecutionResult = {
  canonicalName: string;
  retailer: Retailer | "unknown";
  status: "success" | "failed" | "skipped";
  detail?: string;
  productName?: string;
};

function formatReply(results: ExecutionResult[]): string {
  return results
    .map((r) => {
      if (r.status === "success") return `✅ Added "${r.canonicalName}" to your ${r.retailer} cart`;
      if (r.status === "failed") return `❌ Failed to add "${r.canonicalName}": ${r.detail ?? "unknown error"}`;
      return `⏭ Skipped "${r.canonicalName}" — ${r.detail ?? ""}`;
    })
    .join("\n");
}

export const execute = internalAction({
  args: {
    householdId: v.id("households"),
    rawMessage: v.string(),
    chatId: v.string(),
    triggeredBy: v.string(),
  },
  handler: async (ctx, args) => {
    let sessionId: Id<"cartSessions"> | null = null;

    try {
      // Acknowledge immediately so the user knows we're working on it
      const token = process.env.TELEGRAM_BOT_TOKEN ?? "";
      const onItMsg = await telegramClient.sendMessage(token, args.chatId, "🛒 On it…");
      const onItMsgId = onItMsg.ok ? onItMsg.result.message_id : null;

      sessionId = await ctx.runMutation(internal.cartSessions.internalCreate, {
        householdId: args.householdId,
        rawMessage: args.rawMessage,
        triggeredBy: args.triggeredBy,
        telegramChatId: args.chatId,
      });

      const existingItems = await ctx.runQuery(internal.householdItems.listForHousehold, {
        householdId: args.householdId,
      });

      const parsed = await ctx.runAction(internal.intentParser.parse, {
        rawMessage: args.rawMessage,
        knownItemNames: existingItems.map((i) => i.canonicalName),
      });

      if (parsed.intent === "list") {
        const itemList = existingItems.length > 0
          ? existingItems.map((i, idx) => `${idx + 1}. ${i.canonicalName} (${i.preferredRetailer})`).join("\n")
          : "No items in memory yet.";
        await ctx.runAction(internal.telegram.sendMessage, {
          chatId: args.chatId,
          message: `Your household items:\n${itemList}`,
        });
        await ctx.runMutation(internal.cartSessions.internalUpdateStatus, {
          sessionId,
          status: "complete",
          itemCount: 0,
          successCount: 0,
          failureCount: 0,
        });
        return;
      }

      if (parsed.intent === "remove" && parsed.items.length > 0) {
        let removed = 0;
        for (const item of parsed.items) {
          const match = existingItems.find((e) => e.canonicalName === item.canonicalName);
          if (match) {
            await ctx.runMutation(internal.householdItems.remove, { itemId: match._id });
            removed++;
          }
        }
        const msg = removed > 0
          ? `Removed ${removed} item(s) from memory.`
          : "No matching items found to remove.";
        await ctx.runAction(internal.telegram.sendMessage, {
          chatId: args.chatId,
          message: msg,
        });
        await ctx.runMutation(internal.cartSessions.internalUpdateStatus, {
          sessionId,
          status: "complete",
          itemCount: removed,
          successCount: removed,
          failureCount: 0,
        });
        return;
      }

      if (parsed.items.length === 0) {
        await ctx.runAction(internal.telegram.sendMessage, {
          chatId: args.chatId,
          message: "I didn't recognize any items to add. Try: 'add milk and eggs'",
        });
        await ctx.runMutation(internal.cartSessions.internalUpdateStatus, {
          sessionId,
          status: "complete",
          itemCount: 0,
          successCount: 0,
          failureCount: 0,
        });
        return;
      }

      await ctx.runMutation(internal.cartSessions.internalUpdateStatus, {
        sessionId,
        status: "running",
        itemCount: parsed.items.length,
        successCount: 0,
        failureCount: 0,
      });

      type ItemWithRetailer = {
        canonicalName: string;
        category: string;
        retailer: Retailer;
        existingItem: (typeof existingItems)[number] | undefined;
        quantity: number;
        itemId?: Id<"householdItems">;
      };

      const itemsWithRetailer: ItemWithRetailer[] = parsed.items.map((item) => {
        const existingItem = existingItems.find((e) => e.canonicalName === item.canonicalName);
        const constraint = parsed.globalRetailerConstraint ?? item.retailerConstraint;
        const retailer: Retailer = constraint
          ? (constraint as Retailer)
          : (existingItem?.preferredRetailer as Retailer | undefined)
          ?? retailerHeuristic(existingItem?.category ?? "pantry");
        return {
          canonicalName: item.canonicalName,
          category: existingItem?.category ?? "pantry",
          retailer,
          existingItem,
          quantity: item.quantity,
          itemId: existingItem?._id,
        };
      });

      const newItems = itemsWithRetailer.filter((i) => !i.existingItem);
      if (newItems.length > 0) {
        const upserted = await ctx.runMutation(internal.householdItems.internalUpsertBatch, {
          householdId: args.householdId,
          items: newItems.map((i) => ({
            canonicalName: i.canonicalName,
            category: i.category,
            preferredRetailer: i.retailer,
            confidenceScore: 0.5,
          })),
        });
        for (const u of upserted) {
          const item = itemsWithRetailer.find((i) => i.canonicalName === u.canonicalName);
          if (item) item.itemId = u.itemId;
        }
      }

      for (const item of itemsWithRetailer) {
        const urlKey = `${item.retailer}Url` as keyof (typeof existingItems)[number];
        await ctx.runMutation(internal.cartSessions.internalLogEvent, {
          sessionId,
          householdId: args.householdId,
          canonicalName: item.canonicalName,
          itemId: item.itemId,
          retailer: item.retailer,
          status: "pending",
          productUrl: item.existingItem?.[urlKey] as string | undefined,
        });
      }

      const instacartItems = itemsWithRetailer.filter((i) => i.retailer === "instacart");
      const amazonItems = itemsWithRetailer.filter((i) => i.retailer === "amazon");
      const targetItems = itemsWithRetailer.filter((i) => i.retailer === "target");
      const wegmansItems = itemsWithRetailer.filter((i) => i.retailer === "wegmans");
      const costcoItems = itemsWithRetailer.filter((i) => i.retailer === "costco");

      const executionResults: ExecutionResult[] = [];
      let amazonCartUrl: string | undefined;
      let targetCartUrl: string | undefined;
      let instacartCartUrl: string | undefined;
      let wegmansCartUrl: string | undefined;
      let costcoCartUrl: string | undefined;

      // Instacart
      if (instacartItems.length > 0) {
        const result = await ctx.runAction(internal.instacartApi.addItemsToCart, {
          householdId: args.householdId,
          items: instacartItems.map((i) => ({
            canonicalName: i.canonicalName,
            itemId: i.itemId,
            instacartItemId: i.existingItem?.instacartItemId,
            preferredProductName: i.existingItem?.preferredProductName,
          })),
        });
        instacartCartUrl = result.cartUrl ?? undefined;
        for (const r of result.results) {
          executionResults.push({
            canonicalName: r.canonicalName,
            retailer: "instacart",
            status: r.success ? "success" : "failed",
            detail: (r as { detail?: string }).detail,
          });
        }
      }

      // Amazon, Target, Wegmans, Costco — all via browser automation
      const browserRetailers = [
        { items: amazonItems, retailer: "amazon" as const, urlField: "amazonUrl" as const, setCartUrl: (u: string) => { amazonCartUrl = u; } },
        { items: targetItems, retailer: "target" as const, urlField: "targetUrl" as const, setCartUrl: (u: string) => { targetCartUrl = u; } },
        { items: wegmansItems, retailer: "wegmans" as const, urlField: "wegmansUrl" as const, setCartUrl: (u: string) => { wegmansCartUrl = u; } },
        { items: costcoItems, retailer: "costco" as const, urlField: "costcoUrl" as const, setCartUrl: (u: string) => { costcoCartUrl = u; } },
      ];

      for (const { items, retailer, urlField, setCartUrl } of browserRetailers) {
        for (const item of items) {
          let productUrl = item.existingItem?.[urlField] as string | undefined;

          if (!productUrl) {
            try {
              const search = await ctx.runAction(internal.browserAutomation.searchProduct, {
                householdId: args.householdId,
                retailer,
                canonicalName: item.canonicalName,
              });

              console.log(`[cart] search returned ${search.results?.length ?? 0} results for "${item.canonicalName}"`);

              if (search.results && search.results.length > 0) {
                console.log(`[cart] creating pendingChoice, chatId=${args.chatId}`);
                const choiceId = await ctx.runMutation(internal.pendingChoices.create, {
                  chatId: args.chatId,
                  householdId: args.householdId,
                  canonicalName: item.canonicalName,
                  retailer,
                  itemId: item.itemId,
                  options: search.results.map((r) => ({ name: r.name, url: r.url })),
                });
                console.log(`[cart] pendingChoice created: ${choiceId}`);

                function esc(s: string) {
                  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
                }
                const lines = search.results.map((r: { name: string; url: string; size?: string; price?: string }, i: number) => {
                  const meta = [r.size, r.price].filter(Boolean).join(" · ");
                  return `<b>${i + 1}. ${esc(r.name)}</b>${meta ? `\n${esc(meta)}` : ""}`;
                });
                const msgText = `Which <b>${esc(item.canonicalName)}</b> from ${retailer}?\n\n${lines.join("\n\n")}`;

                const keyboard = [
                  ...search.results.map((_r: { name: string; url: string }, i: number) => [
                    { text: `✅ Add #${i + 1}`, callback_data: `pick:${choiceId}:${i}` },
                    { text: `🔗 View #${i + 1}`, url: search.results[i].url },
                  ]),
                  [{ text: "↩️ Skip", callback_data: `pick:${choiceId}:skip` }],
                ];

                const kbResult = await telegramClient.sendMessageWithKeyboard(
                  process.env.TELEGRAM_BOT_TOKEN ?? "",
                  args.chatId,
                  msgText,
                  keyboard,
                  "HTML"
                );
                console.log(`[cart] keyboard send ok=${kbResult.ok}, error=${!kbResult.ok ? (kbResult as {error?:string}).error : "none"}`);

                executionResults.push({
                  canonicalName: item.canonicalName,
                  retailer,
                  status: "skipped",
                  detail: "Waiting for your selection in Telegram",
                });
              } else {
                executionResults.push({
                  canonicalName: item.canonicalName,
                  retailer,
                  status: "skipped",
                  detail: search.searchUrl
                    ? `Couldn't find a match — search here: ${search.searchUrl}`
                    : `Couldn't find "${item.canonicalName}" on ${retailer}`,
                });
              }
            } catch (searchErr) {
              console.error(`[cart] search/keyboard block failed for "${item.canonicalName}":`, searchErr);
              executionResults.push({
                canonicalName: item.canonicalName,
                retailer,
                status: "skipped",
                detail: `Search failed: ${searchErr instanceof Error ? searchErr.message : String(searchErr)}`,
              });
            }
            continue;
          }

          const result = await ctx.runAction(internal.browserAutomation.addToCart, {
            householdId: args.householdId,
            retailer,
            productUrl,
            canonicalName: item.canonicalName,
          });
          if (result.cartUrl) setCartUrl(result.cartUrl);
          executionResults.push({
            canonicalName: item.canonicalName,
            retailer,
            status: result.success ? "success" : "failed",
            detail: result.error ?? undefined,
          });
          if (result.success && retailer === "wegmans") {
            await ctx.scheduler.runAfter(0, internal.browserAutomation.refreshAndSaveCart, {
              householdId: args.householdId,
            });
          }
        }
      }

      const successCount = executionResults.filter((r) => r.status === "success").length;
      const failureCount = executionResults.filter((r) => r.status === "failed").length;

      await ctx.runMutation(internal.cartSessions.internalUpdateStatus, {
        sessionId,
        status: "complete",
        itemCount: parsed.items.length,
        successCount,
        failureCount,
        amazonCartUrl,
        targetCartUrl,
        instacartCartUrl,
        wegmansCartUrl,
        costcoCartUrl,
      });

      // Don't send a cart summary if every item is just waiting for keyboard selection
      const pendingCount = executionResults.filter((r) => r.detail === "Waiting for your selection in Telegram").length;
      const allPending = pendingCount === executionResults.length && executionResults.length > 0;

      if (!allPending) {
        const replyText = formatReply(executionResults);
        await ctx.runAction(internal.telegram.sendMessage, {
          chatId: args.chatId,
          message: replyText,
        });
        if (onItMsgId) await telegramClient.deleteMessage(token, args.chatId, onItMsgId);
      } else {
        // All pending keyboard selection — delete "On it…" so it doesn't linger
        if (onItMsgId) await telegramClient.deleteMessage(token, args.chatId, onItMsgId);
      }
    } catch (e) {
      console.error("Cart builder error:", e);
      if (sessionId) {
        await ctx.runMutation(internal.cartSessions.internalUpdateStatus, {
          sessionId,
          status: "failed",
          itemCount: 0,
          successCount: 0,
          failureCount: 0,
        }).catch(() => {});
      }
      await ctx.runAction(internal.telegram.sendMessage, {
        chatId: args.chatId,
        message: "Sorry, something went wrong building your cart. Check the web app for details.",
      }).catch(() => {});
    }
  },
});
