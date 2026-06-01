import { ConvexError } from "convex/values";
import { mutation, internalMutation } from "./_generated/server";
import { v } from "convex/values";

export const generate = mutation({
  args: {},
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new ConvexError("Not authenticated");
    const user = await ctx.db
      .query("users")
      .filter((q) => q.eq(q.field("_id"), identity.subject))
      .first();
    if (!user) throw new ConvexError("User not found");

    const token = crypto.randomUUID();
    await ctx.db.insert("linkTokens", {
      token,
      userId: user._id,
      expiresAt: Date.now() + 15 * 60 * 1000,
      used: false,
    });

    const appUrl = process.env.APP_URL ?? "http://localhost:5173";
    const linkUrl = `${appUrl}/link?token=${token}`;
    return { token, linkUrl };
  },
});

export const consume = mutation({
  args: {
    token: v.string(),
    telegramUserId: v.string(),
    telegramUsername: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) return { success: false, error: "Not authenticated" };
    const user = await ctx.db
      .query("users")
      .filter((q) => q.eq(q.field("_id"), identity.subject))
      .first();
    if (!user) return { success: false, error: "User not found" };

    const tokenRecord = await ctx.db
      .query("linkTokens")
      .withIndex("by_token", (q) => q.eq("token", args.token))
      .first();
    if (!tokenRecord) return { success: false, error: "Invalid token" };
    if (tokenRecord.used || tokenRecord.expiresAt < Date.now()) {
      return { success: false, error: "Token expired" };
    }
    if (tokenRecord.userId !== user._id) {
      return { success: false, error: "Token belongs to a different account" };
    }

    await ctx.db.patch(tokenRecord._id, { used: true });

    const member = await ctx.db
      .query("householdMembers")
      .withIndex("by_userId", (q) => q.eq("userId", user._id))
      .first();
    if (member) {
      await ctx.db.patch(member._id, {
        telegramUserId: args.telegramUserId,
        telegramUsername: args.telegramUsername,
      });
    }

    return { success: true };
  },
});

export const bindTelegramDirect = mutation({
  args: {
    telegramUserId: v.string(),
    telegramUsername: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) return { success: false };
    const user = await ctx.db
      .query("users")
      .filter((q) => q.eq(q.field("_id"), identity.subject))
      .first();
    if (!user) return { success: false };

    const member = await ctx.db
      .query("householdMembers")
      .withIndex("by_userId", (q) => q.eq("userId", user._id))
      .first();
    if (!member) return { success: false };

    const patch: { telegramUserId?: string; telegramUsername?: string } = {};
    if (args.telegramUserId === "") {
      patch.telegramUserId = undefined;
      patch.telegramUsername = undefined;
    } else {
      patch.telegramUserId = args.telegramUserId;
      if (args.telegramUsername !== undefined) {
        patch.telegramUsername = args.telegramUsername;
      }
    }
    await ctx.db.patch(member._id, patch);
    return { success: true };
  },
});

export const generateForBot = internalMutation({
  args: {
    telegramUserId: v.string(),
    telegramUsername: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const token = crypto.randomUUID();
    const appUrl = process.env.APP_URL ?? "http://localhost:5173";
    const linkUrl = `${appUrl}/link?tgid=${args.telegramUserId}`;
    return { token, linkUrl };
  },
});
