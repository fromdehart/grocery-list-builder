import { ConvexError } from "convex/values";
import { mutation, query, internalQuery, internalMutation, MutationCtx, QueryCtx } from "./_generated/server";
import { v } from "convex/values";
import { Id } from "./_generated/dataModel";

const retailerValidator = v.union(
  v.literal("amazon"),
  v.literal("target"),
  v.literal("instacart"),
);

async function getHouseholdId(ctx: MutationCtx | QueryCtx): Promise<Id<"households">> {
  const identity = await ctx.auth.getUserIdentity();
  if (!identity) throw new ConvexError("Not authenticated");
  const member = await ctx.db
    .query("householdMembers")
    .withIndex("by_userId", (q) => q.eq("userId", identity.subject))
    .first();
  if (!member) throw new ConvexError("No household found");
  return member.householdId;
}

export const list = query({
  args: {},
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) return [];
    const member = await ctx.db
      .query("householdMembers")
      .withIndex("by_userId", (q) => q.eq("userId", identity.subject))
      .first();
    if (!member) return [];

    const items = await ctx.db
      .query("householdItems")
      .withIndex("by_householdId", (q) => q.eq("householdId", member.householdId))
      .collect();
    return items.sort((a, b) => a.canonicalName.localeCompare(b.canonicalName));
  },
});

export const listForHousehold = internalQuery({
  args: { householdId: v.id("households") },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("householdItems")
      .withIndex("by_householdId", (q) => q.eq("householdId", args.householdId))
      .collect();
  },
});

export const upsert = mutation({
  args: {
    canonicalName: v.string(),
    category: v.string(),
    preferredRetailer: retailerValidator,
    preferredProductName: v.optional(v.string()),
    amazonUrl: v.optional(v.string()),
    targetUrl: v.optional(v.string()),
    instacartItemId: v.optional(v.string()),
    purchaseFrequency: v.optional(v.string()),
    confidenceScore: v.number(),
    notes: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const householdId = await getHouseholdId(ctx);
    const existing = await ctx.db
      .query("householdItems")
      .withIndex("by_household_and_name", (q) =>
        q.eq("householdId", householdId).eq("canonicalName", args.canonicalName)
      )
      .first();
    if (existing) {
      await ctx.db.patch(existing._id, args);
      return existing._id;
    }
    return await ctx.db.insert("householdItems", {
      ...args,
      householdId,
      lastAddedAt: Date.now(),
    });
  },
});

export const update = mutation({
  args: {
    itemId: v.id("householdItems"),
    patch: v.object({
      preferredProductName: v.optional(v.string()),
      amazonUrl: v.optional(v.string()),
      targetUrl: v.optional(v.string()),
      instacartItemId: v.optional(v.string()),
      preferredRetailer: v.optional(retailerValidator),
      notes: v.optional(v.string()),
    }),
  },
  handler: async (ctx, args) => {
    const householdId = await getHouseholdId(ctx);
    const item = await ctx.db.get(args.itemId);
    if (!item || item.householdId !== householdId) {
      throw new ConvexError("Item not found");
    }
    await ctx.db.patch(args.itemId, args.patch);
    return null;
  },
});

export const remove = mutation({
  args: { itemId: v.id("householdItems") },
  handler: async (ctx, args) => {
    const householdId = await getHouseholdId(ctx);
    const item = await ctx.db.get(args.itemId);
    if (!item || item.householdId !== householdId) {
      throw new ConvexError("Item not found");
    }
    await ctx.db.delete(args.itemId);
    return null;
  },
});

export const internalUpsertBatch = internalMutation({
  args: {
    householdId: v.id("households"),
    items: v.array(v.object({
      canonicalName: v.string(),
      category: v.string(),
      preferredRetailer: retailerValidator,
      confidenceScore: v.number(),
    })),
  },
  handler: async (ctx, args) => {
    const results: Array<{ canonicalName: string; itemId: Id<"householdItems"> }> = [];
    for (const item of args.items) {
      const existing = await ctx.db
        .query("householdItems")
        .withIndex("by_household_and_name", (q) =>
          q.eq("householdId", args.householdId).eq("canonicalName", item.canonicalName)
        )
        .first();
      if (existing) {
        results.push({ canonicalName: item.canonicalName, itemId: existing._id });
      } else {
        const itemId = await ctx.db.insert("householdItems", {
          householdId: args.householdId,
          canonicalName: item.canonicalName,
          category: item.category,
          preferredRetailer: item.preferredRetailer,
          confidenceScore: item.confidenceScore,
          lastAddedAt: Date.now(),
        });
        results.push({ canonicalName: item.canonicalName, itemId });
      }
    }
    return results;
  },
});
