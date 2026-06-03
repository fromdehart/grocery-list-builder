import { internalMutation, internalQuery, query } from "./_generated/server";
import { v } from "convex/values";

const itemValidator = v.object({
  name: v.string(),
  quantity: v.number(),
  price: v.optional(v.string()),
  aisle: v.optional(v.string()),
  shelf: v.optional(v.string()),
  aisleSide: v.optional(v.string()),
  section: v.optional(v.string()),
});

export const save = internalMutation({
  args: {
    householdId: v.id("households"),
    retailer: v.string(),
    items: v.array(itemValidator),
  },
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query("cartSnapshots")
      .withIndex("by_household_retailer", (q) =>
        q.eq("householdId", args.householdId).eq("retailer", args.retailer)
      )
      .unique();

    if (existing) {
      await ctx.db.patch(existing._id, { items: args.items, updatedAt: Date.now() });
    } else {
      await ctx.db.insert("cartSnapshots", {
        householdId: args.householdId,
        retailer: args.retailer,
        items: args.items,
        updatedAt: Date.now(),
      });
    }
  },
});

export const getByHousehold = internalQuery({
  args: { householdId: v.id("households"), retailer: v.string() },
  handler: async (ctx, args) => {
    return ctx.db
      .query("cartSnapshots")
      .withIndex("by_household_retailer", (q) =>
        q.eq("householdId", args.householdId).eq("retailer", args.retailer)
      )
      .unique();
  },
});

// Public query for the display — no auth needed since it's identified by householdId
export const getForDisplay = query({
  args: { householdId: v.id("households"), retailer: v.string() },
  handler: async (ctx, args) => {
    return ctx.db
      .query("cartSnapshots")
      .withIndex("by_household_retailer", (q) =>
        q.eq("householdId", args.householdId).eq("retailer", args.retailer)
      )
      .unique();
  },
});
