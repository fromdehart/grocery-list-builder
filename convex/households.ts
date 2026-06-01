import { ConvexError } from "convex/values";
import { mutation, query, internalQuery } from "./_generated/server";
import { v } from "convex/values";

export const create = mutation({
  args: { name: v.string() },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new ConvexError("Not authenticated");
    const user = await ctx.db
      .query("users")
      .filter((q) => q.eq(q.field("_id"), identity.subject))
      .first();
    if (!user) throw new ConvexError("User not found");

    const householdId = await ctx.db.insert("households", {
      name: args.name,
      createdAt: Date.now(),
    });
    await ctx.db.insert("householdMembers", {
      householdId,
      userId: user._id,
      role: "owner",
    });
    return householdId;
  },
});

export const getMyHousehold = query({
  args: {},
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) return null;
    const user = await ctx.db
      .query("users")
      .filter((q) => q.eq(q.field("_id"), identity.subject))
      .first();
    if (!user) return null;

    const member = await ctx.db
      .query("householdMembers")
      .withIndex("by_userId", (q) => q.eq("userId", user._id))
      .first();
    if (!member) return null;

    const household = await ctx.db.get(member.householdId);
    if (!household) return null;

    return { household, member };
  },
});

export const updateSettings = mutation({
  args: {
    instacartApiKey: v.optional(v.string()),
    playwrightWorkerUrl: v.optional(v.string()),
    amazonSessionCookies: v.optional(v.string()),
    targetSessionCookies: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new ConvexError("Not authenticated");
    const user = await ctx.db
      .query("users")
      .filter((q) => q.eq(q.field("_id"), identity.subject))
      .first();
    if (!user) throw new ConvexError("User not found");

    const member = await ctx.db
      .query("householdMembers")
      .withIndex("by_userId", (q) => q.eq("userId", user._id))
      .first();
    if (!member) throw new ConvexError("No household found");

    const patch: Record<string, string | undefined> = {};
    if (args.instacartApiKey !== undefined) patch.instacartApiKey = args.instacartApiKey;
    if (args.playwrightWorkerUrl !== undefined) patch.playwrightWorkerUrl = args.playwrightWorkerUrl;
    if (args.amazonSessionCookies !== undefined) patch.amazonSessionCookies = args.amazonSessionCookies;
    if (args.targetSessionCookies !== undefined) patch.targetSessionCookies = args.targetSessionCookies;

    await ctx.db.patch(member.householdId, patch);
    return null;
  },
});

export const getByTelegramUserId = internalQuery({
  args: { telegramUserId: v.string() },
  handler: async (ctx, args) => {
    const member = await ctx.db
      .query("householdMembers")
      .withIndex("by_telegramUserId", (q) =>
        q.eq("telegramUserId", args.telegramUserId)
      )
      .first();
    if (!member) return null;
    return { householdId: member.householdId, userId: member.userId };
  },
});

export const getHouseholdById = internalQuery({
  args: { householdId: v.id("households") },
  handler: async (ctx, args) => {
    return await ctx.db.get(args.householdId);
  },
});
