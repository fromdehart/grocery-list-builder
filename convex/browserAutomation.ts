import { internalAction } from "./_generated/server";
import { internal } from "./_generated/api";
import { v } from "convex/values";

const retailerValidator = v.union(
  v.literal("amazon"),
  v.literal("target"),
  v.literal("wegmans"),
  v.literal("costco"),
);

export const searchProduct = internalAction({
  args: {
    householdId: v.id("households"),
    retailer: retailerValidator,
    canonicalName: v.string(),
  },
  handler: async (ctx, args) => {
    const household = await ctx.runQuery(internal.households.getHouseholdById, {
      householdId: args.householdId,
    });

    const workerUrl = household?.playwrightWorkerUrl;
    if (!workerUrl) return { topResult: null, searchUrl: null };

    const cookiesMap: Record<string, string | undefined> = {
      amazon: household?.amazonSessionCookies,
      target: household?.targetSessionCookies,
      wegmans: household?.wegmansSessionCookies,
      costco: household?.costcoSessionCookies,
    };

    try {
      const res = await fetch(`${workerUrl}/search`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Worker-Secret": process.env.PLAYWRIGHT_WORKER_SECRET ?? "",
        },
        body: JSON.stringify({
          retailer: args.retailer,
          query: args.canonicalName,
          // No session cookies for search — Algolia results are public and
          // passing an expired session causes redirects to login
        }),
      });

      const data = (await res.json()) as {
        results: Array<{ name: string; url: string }>;
        searchUrl: string;
      };

      return {
        results: data.results ?? [],
        searchUrl: data.searchUrl ?? null,
      };
    } catch (e) {
      console.error("searchProduct failed:", e);
      return { results: [], searchUrl: null };
    }
  },
});

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
