import { ConvexError } from "convex/values";
import { query, internalMutation, QueryCtx } from "./_generated/server";
import { v } from "convex/values";
import { Id } from "./_generated/dataModel";

const statusValidator = v.union(
  v.literal("pending"),
  v.literal("running"),
  v.literal("complete"),
  v.literal("failed"),
);

const retailerValidator = v.union(
  v.literal("amazon"),
  v.literal("target"),
  v.literal("instacart"),
  v.literal("wegmans"),
  v.literal("costco"),
  v.literal("unknown"),
);

const eventStatusValidator = v.union(
  v.literal("pending"),
  v.literal("success"),
  v.literal("failed"),
  v.literal("skipped"),
);

async function getCallerHouseholdId(ctx: QueryCtx): Promise<Id<"households"> | null> {
  const identity = await ctx.auth.getUserIdentity();
  if (!identity) return null;
  const member = await ctx.db
    .query("householdMembers")
    .withIndex("by_userId", (q) => q.eq("userId", identity.subject))
    .first();
  return member?.householdId ?? null;
}

export const list = query({
  args: { limit: v.optional(v.number()) },
  handler: async (ctx, args) => {
    const householdId = await getCallerHouseholdId(ctx);
    if (!householdId) return [];
    const limit = args.limit ?? 20;
    const sessions = await ctx.db
      .query("cartSessions")
      .withIndex("by_householdId", (q) => q.eq("householdId", householdId))
      .collect();
    return sessions
      .sort((a, b) => b.createdAt - a.createdAt)
      .slice(0, limit);
  },
});

export const listItemHistory = query({
  args: { limit: v.optional(v.number()) },
  handler: async (ctx, args) => {
    const householdId = await getCallerHouseholdId(ctx);
    if (!householdId) return [];
    const events = await ctx.db
      .query("executionEvents")
      .withIndex("by_householdId", (q) => q.eq("householdId", householdId))
      .collect();
    return events
      .sort((a, b) => (b.executedAt ?? 0) - (a.executedAt ?? 0))
      .slice(0, args.limit ?? 100);
  },
});

export const getWithEvents = query({
  args: { sessionId: v.id("cartSessions") },
  handler: async (ctx, args) => {
    const householdId = await getCallerHouseholdId(ctx);
    if (!householdId) return null;
    const session = await ctx.db.get(args.sessionId);
    if (!session || session.householdId !== householdId) return null;
    const events = await ctx.db
      .query("executionEvents")
      .withIndex("by_sessionId", (q) => q.eq("sessionId", args.sessionId))
      .collect();
    return { session, events };
  },
});

export const internalCreate = internalMutation({
  args: {
    householdId: v.id("households"),
    rawMessage: v.string(),
    triggeredBy: v.string(),
    telegramChatId: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    return await ctx.db.insert("cartSessions", {
      householdId: args.householdId,
      rawMessage: args.rawMessage,
      triggeredBy: args.triggeredBy,
      telegramChatId: args.telegramChatId,
      status: "pending",
      itemCount: 0,
      successCount: 0,
      failureCount: 0,
      createdAt: Date.now(),
    });
  },
});

export const internalUpdateStatus = internalMutation({
  args: {
    sessionId: v.id("cartSessions"),
    status: statusValidator,
    itemCount: v.number(),
    successCount: v.number(),
    failureCount: v.number(),
    amazonCartUrl: v.optional(v.string()),
    targetCartUrl: v.optional(v.string()),
    instacartCartUrl: v.optional(v.string()),
    wegmansCartUrl: v.optional(v.string()),
    costcoCartUrl: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.sessionId, {
      status: args.status,
      itemCount: args.itemCount,
      successCount: args.successCount,
      failureCount: args.failureCount,
      amazonCartUrl: args.amazonCartUrl,
      targetCartUrl: args.targetCartUrl,
      instacartCartUrl: args.instacartCartUrl,
      wegmansCartUrl: args.wegmansCartUrl,
      costcoCartUrl: args.costcoCartUrl,
    });
    return null;
  },
});

export const internalLogEvent = internalMutation({
  args: {
    sessionId: v.id("cartSessions"),
    householdId: v.id("households"),
    canonicalName: v.string(),
    itemId: v.optional(v.id("householdItems")),
    retailer: retailerValidator,
    status: eventStatusValidator,
    productName: v.optional(v.string()),
    productUrl: v.optional(v.string()),
    detail: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    await ctx.db.insert("executionEvents", {
      ...args,
      executedAt: Date.now(),
    });
    return null;
  },
});
