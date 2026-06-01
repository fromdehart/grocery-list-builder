import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

export default defineSchema({
  // ── Template tables ──────────────────────────────────────────────────────
  events: defineTable({
    challengeId: v.string(),
    sessionId: v.string(),
    eventName: v.string(),
    metadata: v.any(),
    timestamp: v.number(),
  }).index("by_challengeId", ["challengeId"]),

  data: defineTable({
    challengeId: v.string(),
    key: v.string(),
    value: v.any(),
    createdAt: v.number(),
  })
    .index("by_challengeId", ["challengeId"])
    .index("by_challenge_and_key", ["challengeId", "key"]),

  leads: defineTable({
    challengeId: v.string(),
    email: v.string(),
    createdAt: v.number(),
  })
    .index("by_challengeId", ["challengeId"])
    .index("by_challenge_and_email", ["challengeId", "email"]),

  // ── App tables ──────────────────────────────────────────────────────────

  households: defineTable({
    name: v.string(),
    createdAt: v.number(),
    instacartApiKey: v.optional(v.string()),
    playwrightWorkerUrl: v.optional(v.string()),
    amazonSessionCookies: v.optional(v.string()),
    targetSessionCookies: v.optional(v.string()),
    wegmansSessionCookies: v.optional(v.string()),
    costcoSessionCookies: v.optional(v.string()),
  }),

  householdMembers: defineTable({
    householdId: v.id("households"),
    userId: v.string(),
    role: v.union(v.literal("owner"), v.literal("member")),
    telegramUserId: v.optional(v.string()),
    telegramUsername: v.optional(v.string()),
  })
    .index("by_householdId", ["householdId"])
    .index("by_userId", ["userId"])
    .index("by_telegramUserId", ["telegramUserId"]),

  householdItems: defineTable({
    householdId: v.id("households"),
    canonicalName: v.string(),
    category: v.string(),
    preferredRetailer: v.union(
      v.literal("amazon"),
      v.literal("target"),
      v.literal("instacart"),
      v.literal("wegmans"),
      v.literal("costco"),
    ),
    preferredProductName: v.optional(v.string()),
    amazonUrl: v.optional(v.string()),
    targetUrl: v.optional(v.string()),
    instacartItemId: v.optional(v.string()),
    wegmansUrl: v.optional(v.string()),
    costcoUrl: v.optional(v.string()),
    purchaseFrequency: v.optional(v.string()),
    confidenceScore: v.number(),
    lastAddedAt: v.optional(v.number()),
    notes: v.optional(v.string()),
  })
    .index("by_householdId", ["householdId"])
    .index("by_household_and_name", ["householdId", "canonicalName"]),

  cartSessions: defineTable({
    householdId: v.id("households"),
    createdAt: v.number(),
    status: v.union(
      v.literal("pending"),
      v.literal("running"),
      v.literal("complete"),
      v.literal("failed"),
    ),
    triggeredBy: v.string(),
    rawMessage: v.optional(v.string()),
    itemCount: v.number(),
    successCount: v.number(),
    failureCount: v.number(),
    amazonCartUrl: v.optional(v.string()),
    targetCartUrl: v.optional(v.string()),
    instacartCartUrl: v.optional(v.string()),
    wegmansCartUrl: v.optional(v.string()),
    costcoCartUrl: v.optional(v.string()),
    telegramChatId: v.optional(v.string()),
  }).index("by_householdId", ["householdId"]),

  executionEvents: defineTable({
    sessionId: v.id("cartSessions"),
    householdId: v.id("households"),
    canonicalName: v.string(),
    itemId: v.optional(v.id("householdItems")),
    retailer: v.union(
      v.literal("amazon"),
      v.literal("target"),
      v.literal("instacart"),
      v.literal("wegmans"),
      v.literal("costco"),
      v.literal("unknown"),
    ),
    status: v.union(
      v.literal("pending"),
      v.literal("success"),
      v.literal("failed"),
      v.literal("skipped"),
    ),
    productName: v.optional(v.string()),
    productUrl: v.optional(v.string()),
    detail: v.optional(v.string()),
    executedAt: v.optional(v.number()),
  })
    .index("by_sessionId", ["sessionId"])
    .index("by_householdId", ["householdId"]),

  linkTokens: defineTable({
    token: v.string(),
    userId: v.string(),
    expiresAt: v.number(),
    used: v.boolean(),
  }).index("by_token", ["token"]),
});
