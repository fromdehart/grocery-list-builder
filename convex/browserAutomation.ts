import { internalAction } from "./_generated/server";
import { internal } from "./_generated/api";
import { v } from "convex/values";

export const addToCart = internalAction({
  args: {
    householdId: v.id("households"),
    retailer: v.union(
      v.literal("amazon"),
      v.literal("target"),
      v.literal("wegmans"),
      v.literal("costco"),
    ),
    productUrl: v.string(),
    canonicalName: v.string(),
  },
  handler: async (ctx, args) => {
    const household = await ctx.runQuery(internal.households.getHouseholdById, {
      householdId: args.householdId,
    });

    const workerUrl = household?.playwrightWorkerUrl;
    if (!workerUrl) {
      return {
        success: false,
        cartUrl: null,
        error: "Playwright worker not configured — set it in Settings",
      };
    }

    const cookiesMap = {
      amazon: household?.amazonSessionCookies,
      target: household?.targetSessionCookies,
      wegmans: household?.wegmansSessionCookies,
      costco: household?.costcoSessionCookies,
    };
    const cookiesJson = cookiesMap[args.retailer];

    try {
      const res = await fetch(`${workerUrl}/automate`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Worker-Secret": process.env.PLAYWRIGHT_WORKER_SECRET ?? "",
        },
        body: JSON.stringify({
          retailer: args.retailer,
          productUrl: args.productUrl,
          sessionCookies: cookiesJson ?? "[]",
        }),
      });

      const data = (await res.json()) as {
        success: boolean;
        cartUrl?: string | null;
        error?: string | null;
      };
      return {
        success: data.success,
        cartUrl: data.cartUrl ?? null,
        error: data.error ?? null,
      };
    } catch (e) {
      return {
        success: false,
        cartUrl: null,
        error: "Worker unreachable",
      };
    }
  },
});
