import { internalMutation, internalQuery } from "./_generated/server";
import { v } from "convex/values";
import { Id } from "./_generated/dataModel";

export const create = internalMutation({
  args: {
    chatId: v.string(),
    householdId: v.id("households"),
    canonicalName: v.string(),
    retailer: v.string(),
    itemId: v.optional(v.id("householdItems")),
    options: v.array(v.object({ name: v.string(), url: v.string() })),
  },
  handler: async (ctx, args) => {
    return await ctx.db.insert("pendingChoices", {
      ...args,
      createdAt: Date.now(),
    });
  },
});

export const getByChatId = internalQuery({
  args: { chatId: v.string() },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("pendingChoices")
      .withIndex("by_chatId", (q) => q.eq("chatId", args.chatId))
      .first();
  },
});

export const getById = internalQuery({
  args: { id: v.id("pendingChoices") },
  handler: async (ctx, args) => {
    return await ctx.db.get(args.id);
  },
});

export const remove = internalMutation({
  args: { id: v.id("pendingChoices") },
  handler: async (ctx, args) => {
    await ctx.db.delete(args.id);
  },
});
