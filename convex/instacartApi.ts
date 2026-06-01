import { internalAction } from "./_generated/server";
import { internal } from "./_generated/api";
import { v } from "convex/values";

export const addItemsToCart = internalAction({
  args: {
    householdId: v.id("households"),
    items: v.array(v.object({
      canonicalName: v.string(),
      itemId: v.optional(v.id("householdItems")),
      instacartItemId: v.optional(v.string()),
      preferredProductName: v.optional(v.string()),
    })),
  },
  handler: async (ctx, args) => {
    const household = await ctx.runQuery(internal.households.getHouseholdById, {
      householdId: args.householdId,
    });

    const instacartApiKey = household?.instacartApiKey;

    const fallbackUrl = `https://www.instacart.com/store/s?k=${encodeURIComponent(
      args.items[0]?.preferredProductName ?? args.items[0]?.canonicalName ?? "groceries"
    )}`;

    if (instacartApiKey) {
      try {
        const res = await fetch("https://connect.instacart.com/idp/v1/products/products_link", {
          method: "POST",
          headers: {
            Authorization: `Bearer ${instacartApiKey}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            line_items: args.items.map((i) => ({
              name: i.preferredProductName ?? i.canonicalName,
              quantity: 1,
            })),
          }),
        });

        if (res.ok) {
          const data = (await res.json()) as { products_link_url?: string };
          if (data.products_link_url) {
            return {
              cartUrl: data.products_link_url,
              results: args.items.map((i) => ({
                canonicalName: i.canonicalName,
                success: true,
              })),
            };
          }
        }
      } catch (e) {
        console.error("Instacart API error:", e);
      }
    }

    return {
      cartUrl: fallbackUrl,
      results: args.items.map((i) => ({
        canonicalName: i.canonicalName,
        success: false,
        detail: instacartApiKey
          ? "Instacart API error — use the deeplink to add manually"
          : "No Instacart API key — use the deeplink to add manually",
      })),
    };
  },
});
