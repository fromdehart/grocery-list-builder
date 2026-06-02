import { internalAction } from "./_generated/server";
import { internal } from "./_generated/api";
import { v } from "convex/values";

const retailerValidator = v.union(
  v.literal("amazon"),
  v.literal("target"),
  v.literal("wegmans"),
  v.literal("costco"),
);

async function searchWegmansAlgolia(query: string): Promise<{ results: Array<{ name: string; url: string }>; searchUrl: string | null }> {
  const appId = process.env.WEGMANS_ALGOLIA_APP_ID;
  const apiKey = process.env.WEGMANS_ALGOLIA_API_KEY;
  const searchUrl = `https://www.wegmans.com/shop/search?q=${encodeURIComponent(query)}`;

  if (!appId || !apiKey) {
    console.error("[search:wegmans] Algolia credentials not configured");
    return { results: [], searchUrl };
  }

  // Normalize accents: açaí → acai
  const normalizedQuery = query.normalize("NFD").replace(/[̀-ͯ]/g, "");

  try {
    const res = await fetch(`https://${appId.toLowerCase()}-dsn.algolia.net/1/indexes/*/queries`, {
      method: "POST",
      headers: {
        "X-Algolia-Application-Id": appId,
        "X-Algolia-API-Key": apiKey,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        requests: [{
          indexName: "products",
          query: normalizedQuery,
          hitsPerPage: 50,
          filters: "fulfilmentType:instore AND excludeFromWeb:false AND isSoldAtStore:true",
          attributesToRetrieve: ["productName", "slug", "skuId"],
        }],
      }),
    });

    const data = (await res.json()) as {
      results: Array<{ hits: Array<{ productName?: string; slug?: string; skuId?: string }> }>;
    };

    const allHits = data.results?.[0]?.hits ?? [];

    // Deduplicate by skuId — same product appears once per store in the index
    const seen = new Set<string>();
    const hits = allHits.filter((h) => {
      const key = h.skuId ?? h.slug ?? "";
      if (!key || seen.has(key)) return false;
      seen.add(key);
      return true;
    }).slice(0, 10);

    console.log(`[search:wegmans:algolia] query="${normalizedQuery}" → ${hits.length} unique hits (from ${allHits.length} total)`);

    const results = hits
      .filter((h) => h.slug || h.skuId)
      .map((h) => ({
        name: h.productName ?? "",
        url: `https://www.wegmans.com/shop/product/${h.slug ?? h.skuId}`,
      }));

    return { results, searchUrl };
  } catch (e) {
    console.error("[search:wegmans:algolia] failed:", e);
    return { results: [], searchUrl };
  }
}

async function lookupPlanograms(
  skuIds: string[]
): Promise<Record<string, { aisle?: string; shelf?: string }>> {
  const appId = process.env.WEGMANS_ALGOLIA_APP_ID;
  const apiKey = process.env.WEGMANS_ALGOLIA_API_KEY;
  if (!appId || !apiKey || skuIds.length === 0) return {};

  try {
    const filters = skuIds.map((id) => `skuId:${id}`).join(" OR ");
    const res = await fetch(`https://${appId.toLowerCase()}-dsn.algolia.net/1/indexes/*/queries`, {
      method: "POST",
      headers: {
        "X-Algolia-Application-Id": appId,
        "X-Algolia-API-Key": apiKey,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        requests: [{
          indexName: "products",
          query: "",
          hitsPerPage: 100,
          filters,
          attributesToRetrieve: ["skuId", "planogram"],
        }],
      }),
    });
    const data = (await res.json()) as {
      results: Array<{ hits: Array<{ skuId?: string; planogram?: { aisle?: string; shelf?: string } }> }>;
    };
    const map: Record<string, { aisle?: string; shelf?: string }> = {};
    for (const hit of data.results?.[0]?.hits ?? []) {
      if (hit.skuId) map[hit.skuId] = hit.planogram ?? {};
    }
    return map;
  } catch {
    return {};
  }
}

export const getWegmansCart = internalAction({
  args: { householdId: v.id("households") },
  handler: async (ctx, args) => {
    const household = await ctx.runQuery(internal.households.getHouseholdById, {
      householdId: args.householdId,
    });
    const workerUrl = household?.playwrightWorkerUrl;
    if (!workerUrl) return { items: [], error: "Worker not configured" };

    try {
      const res = await fetch(`${workerUrl}/cart-contents`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Worker-Secret": process.env.PLAYWRIGHT_WORKER_SECRET ?? "",
        },
        body: JSON.stringify({ sessionCookies: household?.wegmansSessionCookies ?? "[]" }),
      });

      const data = (await res.json()) as {
        items: Array<{ skuId: string; name: string; quantity: number }>;
        error?: string;
      };

      const items = data.items ?? [];
      if (items.length === 0) return { items: [], error: data.error };

      const skuIds = [...new Set(items.map((i) => i.skuId))];
      const planograms = await lookupPlanograms(skuIds);

      return {
        items: items.map((item) => ({
          name: item.name,
          quantity: item.quantity,
          aisle: planograms[item.skuId]?.aisle,
          shelf: planograms[item.skuId]?.shelf,
        })),
        error: null,
      };
    } catch (e) {
      return { items: [], error: "Worker unreachable" };
    }
  },
});

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
    if (!workerUrl) {
      console.log("[search] no workerUrl configured");
      return { results: [], searchUrl: null };
    }

    // Wegmans: use Algolia API directly (no browser needed, much faster)
    if (args.retailer === "wegmans") {
      return searchWegmansAlgolia(args.canonicalName);
    }

    console.log(`[search] calling ${workerUrl}/search retailer=${args.retailer} query="${args.canonicalName}"`);

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
        }),
      });

      console.log(`[search] HTTP ${res.status}`);

      const data = (await res.json()) as {
        results: Array<{ name: string; url: string }>;
        searchUrl: string;
        error?: string;
      };

      console.log(`[search] got ${data.results?.length ?? 0} results, error=${data.error ?? "none"}`);

      return {
        results: data.results ?? [],
        searchUrl: data.searchUrl ?? null,
      };
    } catch (e) {
      console.error("[search] fetch failed:", e);
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
