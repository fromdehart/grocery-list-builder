import { internalAction } from "./_generated/server";
import { internal } from "./_generated/api";
import { v } from "convex/values";
import { Id } from "./_generated/dataModel";

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

function formatReply(
  items: Array<{ canonicalName: string }>,
  results: ExecutionResult[],
  cartUrls: {
    amazonCartUrl?: string;
    targetCartUrl?: string;
    instacartCartUrl?: string;
    wegmansCartUrl?: string;
    costcoCartUrl?: string;
  }
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
  if (cartUrls.wegmansCartUrl) text += `\n🛒 Wegmans: ${cartUrls.wegmansCartUrl}`;
  if (cartUrls.costcoCartUrl) text += `\n🛒 Costco: ${cartUrls.costcoCartUrl}`;
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
            // Search the retailer site for the product
            const search = await ctx.runAction(internal.browserAutomation.searchProduct, {
              householdId: args.householdId,
              retailer,
              canonicalName: item.canonicalName,
            });

            if (search.topResult?.url) {
              // Save URL to memory so next time we don't need to search
              if (item.itemId) {
                await ctx.runMutation(internal.householdItems.saveProductUrl, {
                  itemId: item.itemId,
                  retailer,
                  url: search.topResult.url,
                });
              }
              productUrl = search.topResult.url;
            } else {
              // Couldn't find it — send the search URL so the user can pick the right one
              const searchUrl = search.searchUrl;
              executionResults.push({
                canonicalName: item.canonicalName,
                retailer,
                status: "skipped",
                detail: searchUrl
                  ? `Couldn't find a match. Verify here: ${searchUrl}`
                  : `Couldn't find "${item.canonicalName}" on ${retailer}`,
              });
              continue;
            }
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

      const replyText = formatReply(parsed.items, executionResults, {
        amazonCartUrl,
        targetCartUrl,
        instacartCartUrl,
        wegmansCartUrl,
        costcoCartUrl,
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
