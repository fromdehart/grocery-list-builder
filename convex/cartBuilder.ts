import { internalAction } from "./_generated/server";
import { internal } from "./_generated/api";
import { v } from "convex/values";
import { Id } from "./_generated/dataModel";

type Retailer = "amazon" | "target" | "instacart";

function retailerHeuristic(category: string): Retailer {
  const instacartCategories = ["produce", "dairy", "bakery", "frozen", "meat", "seafood", "deli", "beverages", "snacks", "condiments", "pantry", "canned", "grain"];
  const amazonCategories = ["electronics", "supplements", "vitamins", "books", "office", "cleaning", "personal care", "health", "beauty", "toys"];
  const targetCategories = ["clothing", "home", "decor", "kitchen", "bedding", "apparel"];
  const lower = category.toLowerCase();
  if (instacartCategories.some((c) => lower.includes(c))) return "instacart";
  if (amazonCategories.some((c) => lower.includes(c))) return "amazon";
  if (targetCategories.some((c) => lower.includes(c))) return "target";
  return "instacart";
}

type ExecutionResult = {
  canonicalName: string;
  retailer: Retailer | "unknown";
  status: "success" | "failed" | "skipped";
  detail?: string;
  productName?: string;
};

function formatReply(
  items: Array<{ canonicalName: string }>,
  results: ExecutionResult[],
  cartUrls: { amazonCartUrl?: string; targetCartUrl?: string; instacartCartUrl?: string }
): string {
  const successCount = results.filter((r) => r.status === "success").length;
  const total = results.length;

  let text = total > 0
    ? `Cart built: ${successCount}/${total} items added`
    : "Items queued for cart";

  for (const r of results) {
    const icon = r.status === "success" ? "✅" : r.status === "skipped" ? "⏭" : "❌";
    text += `\n${icon} ${r.canonicalName} (${r.retailer})${r.detail ? " — " + r.detail : ""}`;
  }

  if (cartUrls.amazonCartUrl) text += `\n\n🛒 Amazon: ${cartUrls.amazonCartUrl}`;
  if (cartUrls.targetCartUrl) text += `\n🛒 Target: ${cartUrls.targetCartUrl}`;
  if (cartUrls.instacartCartUrl) text += `\n🛒 Instacart: ${cartUrls.instacartCartUrl}`;

  return text;
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

      // Assign retailers
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
          ? constraint
          : existingItem?.preferredRetailer
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

      // Upsert new items
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

      // Log pending events
      for (const item of itemsWithRetailer) {
        await ctx.runMutation(internal.cartSessions.internalLogEvent, {
          sessionId,
          householdId: args.householdId,
          canonicalName: item.canonicalName,
          itemId: item.itemId,
          retailer: item.retailer,
          status: "pending",
          productUrl: item.existingItem?.[`${item.retailer}Url` as "amazonUrl" | "targetUrl"] ?? undefined,
        });
      }

      // Group by retailer
      const instacartItems = itemsWithRetailer.filter((i) => i.retailer === "instacart");
      const amazonItems = itemsWithRetailer.filter((i) => i.retailer === "amazon");
      const targetItems = itemsWithRetailer.filter((i) => i.retailer === "target");

      const executionResults: ExecutionResult[] = [];
      let amazonCartUrl: string | undefined;
      let targetCartUrl: string | undefined;
      let instacartCartUrl: string | undefined;

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

      // Amazon
      for (const item of amazonItems) {
        const productUrl = item.existingItem?.amazonUrl;
        if (!productUrl) {
          executionResults.push({
            canonicalName: item.canonicalName,
            retailer: "amazon",
            status: "skipped",
            detail: "No amazon_url in memory — add it in the web app",
          });
          continue;
        }
        const result = await ctx.runAction(internal.browserAutomation.addToCart, {
          householdId: args.householdId,
          retailer: "amazon",
          productUrl,
          canonicalName: item.canonicalName,
        });
        if (result.cartUrl) amazonCartUrl = result.cartUrl;
        executionResults.push({
          canonicalName: item.canonicalName,
          retailer: "amazon",
          status: result.success ? "success" : "failed",
          detail: result.error ?? undefined,
        });
      }

      // Target
      for (const item of targetItems) {
        const productUrl = item.existingItem?.targetUrl;
        if (!productUrl) {
          executionResults.push({
            canonicalName: item.canonicalName,
            retailer: "target",
            status: "skipped",
            detail: "No target_url in memory — add it in the web app",
          });
          continue;
        }
        const result = await ctx.runAction(internal.browserAutomation.addToCart, {
          householdId: args.householdId,
          retailer: "target",
          productUrl,
          canonicalName: item.canonicalName,
        });
        if (result.cartUrl) targetCartUrl = result.cartUrl;
        executionResults.push({
          canonicalName: item.canonicalName,
          retailer: "target",
          status: result.success ? "success" : "failed",
          detail: result.error ?? undefined,
        });
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
      });

      const replyText = formatReply(parsed.items, executionResults, {
        amazonCartUrl,
        targetCartUrl,
        instacartCartUrl,
      });

      await ctx.runAction(internal.telegram.sendMessage, {
        chatId: args.chatId,
        message: replyText,
      });
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
