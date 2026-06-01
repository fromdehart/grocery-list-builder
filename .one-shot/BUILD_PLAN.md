# Build Plan: AI Household Grocery Cart Builder

## 1. Overview

A conversational AI system where household members send freeform shopping requests to a Telegram bot ("add milk and eggs", "build my amazon cart"). The bot parses intent via OpenAI, resolves items against a per-household product memory in Convex, routes them to Amazon/Target/Instacart, and executes carts — via Instacart Connect API deeplinks or URL-based Playwright browser automation for Amazon/Target. A web dashboard (Convex Auth gated) provides visibility into the household item memory, cart session history, and per-item execution logs. Multi-household from day one; Telegram users link their chat ID to a Convex account via a one-time token flow.

The existing template provides: Convex + React + Vite + Tailwind scaffold, an OpenAI action wrapper (Responses API), a Telegram webhook handler + client, a Resend email action, and the VoteATron3000 engagement widget. All are kept intact; this plan adds a complete application layer on top.

---

## 2. File Changes Required

### File: `convex/schema.ts`
- **Action:** MODIFY
- **Purpose:** Add `authTables` from Convex Auth plus all app-specific tables. Keep `events`, `data`, `votes`, `leads` for VoteATron3000/GateScreen.
- **Key changes:** Spread `authTables`; add `households`, `householdMembers`, `householdItems`, `cartSessions`, `executionEvents`, `linkTokens` tables.

### File: `convex/auth.ts`
- **Action:** CREATE
- **Purpose:** Configure Convex Auth providers.
- **Key changes:** Export `{ auth, signIn, signOut, store, isAuthenticated }` from `convexAuth({ providers: [Password] })`.

### File: `convex/http.ts`
- **Action:** MODIFY
- **Purpose:** Fix incorrect `"use node"` directive (httpAction always runs in default runtime, not Node.js). Add Convex Auth HTTP routes. Keep Telegram webhook.
- **Key changes:** Remove `"use node"` from top of file. Import `auth` from `./auth`. Call `auth.addHttpRoutes(http)` before the Telegram route. `process.env` access works fine in the default runtime — no Node.js needed.

### File: `convex/telegram.ts`
- **Action:** MODIFY
- **Purpose:** After storing an incoming message, schedule the bot dispatcher action.
- **Key changes:** In `storeIncoming` mutation handler, after `ctx.db.insert("events", ...)`, add `await ctx.scheduler.runAfter(0, internal.botHandler.dispatch, { chatId, telegramUserId: String(args.from?.id ?? ""), telegramUsername: args.from?.username ?? "", text: args.text ?? "" })`.

### File: `convex/households.ts`
- **Action:** CREATE
- **Purpose:** CRUD for households and membership.

### File: `convex/householdItems.ts`
- **Action:** CREATE
- **Purpose:** CRUD for household product memory — the canonical item list with per-retailer URLs.

### File: `convex/cartSessions.ts`
- **Action:** CREATE
- **Purpose:** Queries/mutations for cart session history and execution event logs.

### File: `convex/linkTokens.ts`
- **Action:** CREATE
- **Purpose:** Generate short-lived tokens for Telegram account linking; consume them in the web app.

### File: `convex/botHandler.ts`
- **Action:** CREATE
- **Purpose:** Internal action that dispatches Telegram messages to the correct command handler. Default runtime (fetch only — no "use node").

### File: `convex/intentParser.ts`
- **Action:** CREATE
- **Purpose:** OpenAI JSON-mode intent extraction. Default runtime.

### File: `convex/cartBuilder.ts`
- **Action:** CREATE
- **Purpose:** Orchestrates full cart execution: parse intent → resolve memory → route retailers → execute → log events → format reply. Default runtime.

### File: `convex/instacartApi.ts`
- **Action:** CREATE
- **Purpose:** Instacart Connect API integration with search URL fallback. Default runtime (fetch only).

### File: `convex/browserAutomation.ts`
- **Action:** CREATE
- **Purpose:** Calls external Playwright worker service via fetch. Default runtime.

### File: `convex/openai.ts`
- **Action:** MODIFY
- **Purpose:** Add a `generateJson` action that enables JSON-mode output for structured parsing.
- **Key changes:** Add exported `generateJson` action that includes `text: { format: { type: "json_object" } }` in the Responses API request body.

### File: `worker/package.json`
- **Action:** CREATE
- **Purpose:** Standalone Node.js service for Playwright automation.

### File: `worker/index.ts`
- **Action:** CREATE
- **Purpose:** Express HTTP server: `POST /automate` accepts retailer + productUrl + session cookies, runs Playwright, returns result.

### File: `worker/playwright.ts`
- **Action:** CREATE
- **Purpose:** Playwright automation logic: set cookies, navigate to product URL, click Add to Cart, return cart URL.

### File: `worker/tsconfig.json`
- **Action:** CREATE
- **Purpose:** TypeScript config for worker (Node 18, CommonJS output).

### File: `src/App.tsx`
- **Action:** MODIFY
- **Purpose:** Replace `ConvexProvider` with `ConvexAuthProvider`; add `/dashboard` and `/link` routes; remove email gate from root route.
- **Key changes:** Import `ConvexAuthProvider` from `@convex-dev/auth/react`. Root route `/` renders `<Index />` which redirects to `/dashboard`. Add routes for `/dashboard` and `/link`. Keep VoteATron3000 wrapper.

### File: `src/pages/Index.tsx`
- **Action:** MODIFY
- **Purpose:** Redirect to dashboard.
- **Key changes:** Replace entire content with `export default function Index() { return <Navigate to="/dashboard" replace />; }`.

### File: `src/pages/LoginPage.tsx`
- **Action:** CREATE
- **Purpose:** Email + password sign-in / sign-up using Convex Auth hooks.

### File: `src/pages/DashboardPage.tsx`
- **Action:** CREATE
- **Purpose:** Main authenticated dashboard with Memory, Sessions, and Settings tabs.

### File: `src/pages/LinkTelegramPage.tsx`
- **Action:** CREATE
- **Purpose:** Reads `?tgid=` from URL; if authenticated, binds the Telegram user ID to the caller's household member record.

### File: `src/components/HouseholdMemoryTable.tsx`
- **Action:** CREATE
- **Purpose:** Table of household items with inline editing of product URLs, preferred retailer, and product name.

### File: `src/components/CartSessionsList.tsx`
- **Action:** CREATE
- **Purpose:** Paginated list of recent cart sessions with status badges.

### File: `src/components/SessionDetailDrawer.tsx`
- **Action:** CREATE
- **Purpose:** Sheet/drawer showing per-item execution log for a selected session.

### File: `src/components/HouseholdSettings.tsx`
- **Action:** CREATE
- **Purpose:** Settings for Instacart API key, Playwright worker URL, Amazon/Target session cookies, and Telegram link status.

### File: `src/components/CreateHouseholdForm.tsx`
- **Action:** CREATE
- **Purpose:** Shown to new users with no household; creates one.

### File: `package.json`
- **Action:** MODIFY
- **Purpose:** Add `@convex-dev/auth` dependency.
- **Key changes:** Add `"@convex-dev/auth": "^0.0.87"` to `dependencies`.

---

## 3. Convex Schema Changes

```typescript
// convex/schema.ts
import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";
import { authTables } from "@convex-dev/auth/server";

export default defineSchema({
  ...authTables,

  // ── Template tables (keep for VoteATron3000 / GateScreen) ──────────────
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

  votes: defineTable({
    challengeId: v.string(),
    sessionId: v.string(),
    createdAt: v.number(),
  })
    .index("by_challengeId", ["challengeId"])
    .index("by_challenge_and_session", ["challengeId", "sessionId"]),

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
    // JSON arrays of Playwright cookie objects stored as strings (PoC: plaintext)
    amazonSessionCookies: v.optional(v.string()),
    targetSessionCookies: v.optional(v.string()),
  }),

  householdMembers: defineTable({
    householdId: v.id("households"),
    userId: v.id("users"),
    role: v.union(v.literal("owner"), v.literal("member")),
    telegramUserId: v.optional(v.string()),
    telegramUsername: v.optional(v.string()),
  })
    .index("by_householdId", ["householdId"])
    .index("by_userId", ["userId"])
    .index("by_telegramUserId", ["telegramUserId"]),

  householdItems: defineTable({
    householdId: v.id("households"),
    canonicalName: v.string(),           // normalized lowercase singular, e.g. "whole milk"
    category: v.string(),                // e.g. "dairy"
    preferredRetailer: v.union(
      v.literal("amazon"),
      v.literal("target"),
      v.literal("instacart"),
    ),
    preferredProductName: v.optional(v.string()),
    amazonUrl: v.optional(v.string()),
    targetUrl: v.optional(v.string()),
    instacartItemId: v.optional(v.string()),
    purchaseFrequency: v.optional(v.string()), // "weekly" | "monthly" | "occasional"
    confidenceScore: v.number(),          // 0–1; auto-added items start at 0.5
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
    triggeredBy: v.string(),              // "telegram" | "web"
    rawMessage: v.optional(v.string()),
    itemCount: v.number(),
    successCount: v.number(),
    failureCount: v.number(),
    amazonCartUrl: v.optional(v.string()),
    targetCartUrl: v.optional(v.string()),
    instacartCartUrl: v.optional(v.string()),
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
    userId: v.id("users"),
    expiresAt: v.number(),
    used: v.boolean(),
  }).index("by_token", ["token"]),
});
```

---

## 4. Convex Functions

### `convex/auth.ts`
```typescript
import { convexAuth } from "@convex-dev/auth/server";
import { Password } from "@convex-dev/auth/providers/Password";
export const { auth, signIn, signOut, store, isAuthenticated } = convexAuth({
  providers: [Password],
});
```

---

### `households/create` (mutation)
- **Purpose:** Create household; add calling user as owner.
- **Args:** `{ name: v.string() }`
- **Returns:** `v.id("households")`
- **Logic:**
  1. Call `ctx.auth.getUserIdentity()`; throw `new ConvexError("Not authenticated")` if null.
  2. Query `users` table for the record matching `identity.subject`.
  3. Insert `households`: `{ name, createdAt: Date.now() }` → `householdId`.
  4. Insert `householdMembers`: `{ householdId, userId: user._id, role: "owner" }`.
  5. Return `householdId`.

### `households/getMyHousehold` (query)
- **Purpose:** Return household + member record for the current user.
- **Args:** none
- **Returns:** `{ household: Doc<"households">, member: Doc<"householdMembers"> } | null`
- **Logic:**
  1. Get identity; return `null` if unauthenticated.
  2. Look up `users` by subject.
  3. Query `householdMembers` by `by_userId` for `user._id`; return `null` if none.
  4. Fetch household doc; return `{ household, member }`.

### `households/updateSettings` (mutation)
- **Purpose:** Update household credentials/config for the calling user's household.
- **Args:** `{ instacartApiKey: v.optional(v.string()), playwrightWorkerUrl: v.optional(v.string()), amazonSessionCookies: v.optional(v.string()), targetSessionCookies: v.optional(v.string()) }`
- **Returns:** `null`
- **Logic:** Resolve `householdId` via `getMyHousehold`; `ctx.db.patch(householdId, { ...only the args that are not undefined })`.

### `households/getByTelegramUserId` (internal query)
- **Purpose:** Resolve a Telegram user ID to a household.
- **Args:** `{ telegramUserId: v.string() }`
- **Returns:** `{ householdId: Id<"households">, userId: Id<"users"> } | null`
- **Logic:** Query `householdMembers` by `by_telegramUserId`; return `{ householdId, userId }` or `null`.

---

### `householdItems/list` (query)
- **Purpose:** Return all items in the calling user's household.
- **Args:** none
- **Returns:** `Doc<"householdItems">[]`
- **Logic:** Resolve `householdId`; collect all rows with `by_householdId` index; return sorted by `canonicalName`.

### `householdItems/listForHousehold` (internal query)
- **Purpose:** Return all items for a given householdId (used by cartBuilder without auth context).
- **Args:** `{ householdId: v.id("households") }`
- **Returns:** `Doc<"householdItems">[]`
- **Logic:** Collect all rows with `by_householdId` index.

### `householdItems/upsert` (mutation)
- **Purpose:** Create or update a household item by `canonicalName` (for use from the web dashboard).
- **Args:** `{ canonicalName: v.string(), category: v.string(), preferredRetailer: v.union(...), preferredProductName: v.optional(v.string()), amazonUrl: v.optional(v.string()), targetUrl: v.optional(v.string()), instacartItemId: v.optional(v.string()), purchaseFrequency: v.optional(v.string()), confidenceScore: v.number(), notes: v.optional(v.string()) }`
- **Returns:** `v.id("householdItems")`
- **Logic:** Resolve `householdId`. Query `by_household_and_name`. If found: patch; return `_id`. If not: insert with `lastAddedAt: Date.now()`.

### `householdItems/update` (mutation)
- **Purpose:** Patch specific editable fields on an existing item (dashboard inline edit).
- **Args:** `{ itemId: v.id("householdItems"), patch: v.object({ preferredProductName: v.optional(v.string()), amazonUrl: v.optional(v.string()), targetUrl: v.optional(v.string()), instacartItemId: v.optional(v.string()), preferredRetailer: v.optional(v.union(v.literal("amazon"), v.literal("target"), v.literal("instacart"))), notes: v.optional(v.string()) }) }`
- **Returns:** `null`
- **Logic:** Fetch item; verify `item.householdId` matches caller's household; `ctx.db.patch(itemId, patch)`.

### `householdItems/remove` (mutation)
- **Purpose:** Delete an item from household memory.
- **Args:** `{ itemId: v.id("householdItems") }`
- **Returns:** `null`
- **Logic:** Verify ownership; `ctx.db.delete(itemId)`.

### `householdItems/internalUpsertBatch` (internal mutation)
- **Purpose:** Create new household items (with low confidence) for items not yet in memory, called by cartBuilder.
- **Args:** `{ householdId: v.id("households"), items: v.array(v.object({ canonicalName: v.string(), category: v.string(), preferredRetailer: v.union(...), confidenceScore: v.number() })) }`
- **Returns:** `v.array(v.object({ canonicalName: v.string(), itemId: v.id("householdItems") }))`
- **Logic:** For each item, query `by_household_and_name`; insert if missing with the provided fields; return `[{ canonicalName, itemId }]` for all items (new or existing).

---

### `cartSessions/list` (query)
- **Purpose:** Return recent cart sessions for the calling user's household.
- **Args:** `{ limit: v.optional(v.number()) }` (default 20)
- **Returns:** `Doc<"cartSessions">[]` (most recent first)
- **Logic:** Resolve `householdId`; collect by `by_householdId`; sort `createdAt` desc; slice.

### `cartSessions/getWithEvents` (query)
- **Purpose:** Return a session plus all its execution events.
- **Args:** `{ sessionId: v.id("cartSessions") }`
- **Returns:** `{ session: Doc<"cartSessions">, events: Doc<"executionEvents">[] } | null`
- **Logic:** Fetch session; verify `householdId` matches caller; collect events by `by_sessionId`; return both.

### `cartSessions/internalCreate` (internal mutation)
- **Purpose:** Create a cart session in "pending" state.
- **Args:** `{ householdId: v.id("households"), rawMessage: v.string(), triggeredBy: v.string(), telegramChatId: v.optional(v.string()) }`
- **Returns:** `v.id("cartSessions")`
- **Logic:** Insert `{ status: "pending", itemCount: 0, successCount: 0, failureCount: 0, createdAt: Date.now(), ...args }`.

### `cartSessions/internalUpdateStatus` (internal mutation)
- **Purpose:** Update session status, counts, and cart URLs after execution.
- **Args:** `{ sessionId: v.id("cartSessions"), status: v.union(...), itemCount: v.number(), successCount: v.number(), failureCount: v.number(), amazonCartUrl: v.optional(v.string()), targetCartUrl: v.optional(v.string()), instacartCartUrl: v.optional(v.string()) }`
- **Returns:** `null`
- **Logic:** `ctx.db.patch(sessionId, { status, itemCount, successCount, failureCount, amazonCartUrl, targetCartUrl, instacartCartUrl })`.

### `cartSessions/internalLogEvent` (internal mutation)
- **Purpose:** Insert one execution event record.
- **Args:** `{ sessionId: v.id("cartSessions"), householdId: v.id("households"), canonicalName: v.string(), itemId: v.optional(v.id("householdItems")), retailer: v.union(...), status: v.union(...), productName: v.optional(v.string()), productUrl: v.optional(v.string()), detail: v.optional(v.string()) }`
- **Returns:** `null`
- **Logic:** `ctx.db.insert("executionEvents", { ...args, executedAt: Date.now() })`.

---

### `linkTokens/generate` (mutation)
- **Purpose:** Generate a short-lived link token for the authenticated user.
- **Args:** none
- **Returns:** `{ token: string, linkUrl: string }`
- **Logic:**
  1. Verify auth; resolve `userId`.
  2. `const token = crypto.randomUUID()` (Web Crypto, available in default runtime).
  3. Insert `{ token, userId, expiresAt: Date.now() + 15 * 60 * 1000, used: false }`.
  4. Build `linkUrl = \`${process.env.APP_URL}/link?token=${token}\``.
  5. Return `{ token, linkUrl }`.

### `linkTokens/consume` (mutation)
- **Purpose:** Validate a token and bind `telegramUserId` to the calling user's member record.
- **Args:** `{ token: v.string(), telegramUserId: v.string(), telegramUsername: v.optional(v.string()) }`
- **Returns:** `{ success: boolean, error?: string }`
- **Logic:**
  1. Verify auth; resolve `userId`.
  2. Query `by_token`; if not found → `{ success: false, error: "Invalid token" }`.
  3. If `used` or `expiresAt < Date.now()` → `{ success: false, error: "Token expired" }`.
  4. If `tokenRecord.userId !== userId` → `{ success: false, error: "Token belongs to a different account" }`.
  5. `ctx.db.patch(tokenRecord._id, { used: true })`.
  6. Query `householdMembers` by `by_userId` for `userId`; patch `{ telegramUserId, telegramUsername }`.
  7. Return `{ success: true }`.

### `linkTokens/bindTelegramDirect` (mutation)
- **Purpose:** Directly bind a Telegram user ID to the authenticated caller's member record. Used when the user clicks `APP_URL/link?tgid=xxx` while logged in (no token intermediary).
- **Args:** `{ telegramUserId: v.string(), telegramUsername: v.optional(v.string()) }`
- **Returns:** `{ success: boolean }`
- **Logic:**
  1. Verify auth; resolve `userId`.
  2. Query `householdMembers` by `by_userId`; if none → `{ success: false }`.
  3. Patch `{ telegramUserId, telegramUsername }`.
  4. Return `{ success: true }`.

---

### `botHandler/dispatch` (internal action)
- **Purpose:** Main Telegram bot dispatcher. Reads household for the sender, parses command, routes to handler.
- **Args:** `{ chatId: v.string(), telegramUserId: v.string(), telegramUsername: v.string(), text: v.string() }`
- **Returns:** `null`
- **Logic:**
  1. Normalize text: `const cmd = text.trim().toLowerCase()`.
  2. `/start` → send welcome: "Hi! I'm your grocery cart bot. Commands: /link to connect your account, then just message me items to add."
  3. `/link` → reply with deeplink: `${process.env.APP_URL}/link?tgid=${telegramUserId}` with instructions: "Open this link while logged into the web app to connect your account."
  4. `/list` → resolve household; if none, send link-account message; else query items, format as numbered list, send.
  5. `/remove <item>` → resolve household; remove matching item by canonicalName; reply confirmation.
  6. Any other text → resolve household via `ctx.runQuery(internal.households.getByTelegramUserId, { telegramUserId })`; if null → send "Link your account first: {APP_URL}/link?tgid={telegramUserId}"; else → `ctx.runAction(internal.cartBuilder.execute, { householdId, rawMessage: text, chatId, triggeredBy: "telegram" })`.
  7. All Telegram sends use `await telegramClient.sendMessage(token, chatId, message)` imported from `./telegramClient`.

---

### `intentParser/parse` (internal action)
- **Purpose:** Extract structured shopping intent from a raw Telegram message using OpenAI JSON mode.
- **Args:** `{ rawMessage: v.string(), knownItemNames: v.array(v.string()) }`
- **Returns:** `{ intent: "add" | "build" | "list" | "remove" | "help" | "unknown", items: Array<{ rawText: string, canonicalName: string, quantity: number, unit: string | null, retailerConstraint: "amazon" | "target" | "instacart" | null }>, globalRetailerConstraint: "amazon" | "target" | "instacart" | null }`
- **Logic:**
  1. System prompt: `"You are a grocery shopping assistant. Extract shopping intent from the user's message and respond with valid JSON only. Schema: { \"intent\": \"add|build|list|remove|help|unknown\", \"items\": [{ \"rawText\": string, \"canonicalName\": string (lowercase singular, e.g. 'bananas'→'banana'), \"quantity\": number, \"unit\": string|null, \"retailerConstraint\": \"amazon\"|\"target\"|\"instacart\"|null }], \"globalRetailerConstraint\": \"amazon\"|\"target\"|\"instacart\"|null }. If the message matches a known item, use its exact canonicalName. Known items: ${knownItemNames.join(', ')}. Intent 'add' means add items now; 'build' means build/finalize the cart; 'list' means show memory; 'remove' means delete from memory."`.
  2. POST to `https://api.openai.com/v1/responses` with `model: "gpt-4o"`, `text: { format: { type: "json_object" } }`, using the system prompt + raw message.
  3. Parse JSON; validate that `intent` and `items` are present.
  4. Return typed result. On any parse error → return `{ intent: "unknown", items: [], globalRetailerConstraint: null }`.

---

### `cartBuilder/execute` (internal action)
- **Purpose:** Full cart build pipeline from raw message to Telegram reply.
- **Args:** `{ householdId: v.id("households"), rawMessage: v.string(), chatId: v.string(), triggeredBy: v.string() }`
- **Returns:** `null`
- **Logic:**
  1. Create session: `sessionId = await ctx.runMutation(internal.cartSessions.internalCreate, { householdId, rawMessage, triggeredBy, telegramChatId: chatId })`.
  2. Fetch existing items: `const existingItems = await ctx.runQuery(internal.householdItems.listForHousehold, { householdId })`.
  3. Parse intent: `const parsed = await ctx.runAction(internal.intentParser.parse, { rawMessage, knownItemNames: existingItems.map(i => i.canonicalName) })`.
  4. If `parsed.intent === "list"`: format item list → send Telegram reply → update session status "complete" → return.
  5. If `parsed.intent === "remove"` and items present: for each parsed item, run `ctx.runMutation(internal.householdItems.remove, ...)` if a match exists → confirm reply → return.
  6. For "add" / "build" / "unknown" with items: proceed to execution.
  7. Update session status to "running".
  8. Apply `retailerHeuristic` to each item, respecting `parsed.globalRetailerConstraint` and per-item `retailerConstraint`.
  9. Upsert new items into memory: `await ctx.runMutation(internal.householdItems.internalUpsertBatch, { householdId, items: [items not already in existingItems] })`.
  10. Log a "pending" execution event per item: `await ctx.runMutation(internal.cartSessions.internalLogEvent, { sessionId, householdId, canonicalName, itemId, retailer, status: "pending", ... })`.
  11. Group items by retailer assignment.
  12. **Instacart group:** `const instacartResult = await ctx.runAction(internal.instacartApi.addItemsToCart, { householdId, items: instacartItems })`.
  13. **Amazon group:** For each item with `amazonUrl`, call `await ctx.runAction(internal.browserAutomation.addToCart, { householdId, retailer: "amazon", productUrl: item.amazonUrl, canonicalName: item.canonicalName })`. Items without `amazonUrl` get status "skipped" with detail "No amazon_url in memory — add it in the web app".
  14. **Target group:** Same pattern as Amazon with `targetUrl`.
  15. Collect results; update each execution event with final status and detail.
  16. Calculate `successCount`, `failureCount`.
  17. Update session: `ctx.runMutation(internal.cartSessions.internalUpdateStatus, { sessionId, status: "complete", itemCount: parsed.items.length, successCount, failureCount, amazonCartUrl, targetCartUrl, instacartCartUrl: instacartResult.cartUrl ?? undefined })`.
  18. Format reply via `formatReply(parsed.items, executionResults, { amazonCartUrl, targetCartUrl, instacartCartUrl: instacartResult.cartUrl })`.
  19. Send reply: `await ctx.runAction(internal.telegram.sendMessage, { chatId, message: replyText })`.
  20. On any thrown error: update session status to "failed"; send error reply "Sorry, something went wrong building your cart. Check the web app for details."

### `cartBuilder/retailerHeuristic` (module-level helper function)
- **Purpose:** Assign a retailer to an item based on category when no explicit constraint is set.
- **Signature:** `function retailerHeuristic(category: string): "amazon" | "target" | "instacart"`
- **Logic:**
  ```typescript
  const instacartCategories = ["produce", "dairy", "bakery", "frozen", "meat", "seafood", "deli", "beverages", "snacks", "condiments", "pantry", "canned", "grain"];
  const amazonCategories = ["electronics", "supplements", "vitamins", "books", "office", "cleaning", "personal care", "health", "beauty", "toys"];
  const targetCategories = ["clothing", "home", "decor", "kitchen", "bedding", "apparel"];
  const lower = category.toLowerCase();
  if (instacartCategories.some(c => lower.includes(c))) return "instacart";
  if (amazonCategories.some(c => lower.includes(c))) return "amazon";
  if (targetCategories.some(c => lower.includes(c))) return "target";
  return "instacart"; // default
  ```

### `cartBuilder/formatReply` (module-level helper function)
- **Purpose:** Format execution results into a Telegram text reply.
- **Signature:** `function formatReply(items, results, cartUrls): string`
- **Logic:** Builds multi-line string:
  - Line 1: `"Cart built: ${successCount}/${total} items added"` or `"Items queued for cart"`
  - Per item line: `"${status === 'success' ? '✅' : status === 'skipped' ? '⏭' : '❌'} ${canonicalName} (${retailer})${detail ? ' — ' + detail : ''}"`
  - Cart links section (if any URLs): `"\n🛒 Amazon: ${amazonCartUrl}"`, `"\n🛒 Target: ${targetCartUrl}"`, `"\n🛒 Instacart: ${instacartCartUrl}"`

---

### `instacartApi/addItemsToCart` (internal action)
- **Purpose:** Build an Instacart cart via Connect API or fall back to a search deeplink.
- **Args:** `{ householdId: v.id("households"), items: v.array(v.object({ canonicalName: v.string(), itemId: v.optional(v.id("householdItems")), instacartItemId: v.optional(v.string()), preferredProductName: v.optional(v.string()) })) }`
- **Returns:** `{ cartUrl: string | null, results: Array<{ canonicalName: string, success: boolean, detail?: string }> }`
- **Logic:**
  1. Fetch household; read `instacartApiKey`.
  2. **With API key:** POST to `https://connect.instacart.com/idp/v1/products/products_link` with header `Authorization: Bearer ${instacartApiKey}` and body `{ line_items: items.map(i => ({ name: i.preferredProductName ?? i.canonicalName, quantity: 1 })) }`. On success, the API returns `{ products_link_url: string }`. Return `{ cartUrl: products_link_url, results: items.map(i => ({ canonicalName: i.canonicalName, success: true })) }`. On API error, fall through to fallback.
  3. **Fallback (no API key or API error):** Generate Instacart search URL for the first item: `https://www.instacart.com/store/s?k=${encodeURIComponent(items[0].preferredProductName ?? items[0].canonicalName)}`. Return `{ cartUrl: searchUrl, results: items.map(i => ({ canonicalName: i.canonicalName, success: false, detail: "No Instacart API key — use the deeplink to add manually" })) }`.

---

### `browserAutomation/addToCart` (internal action)
- **Purpose:** Delegate a cart addition to the external Playwright worker via HTTP.
- **Args:** `{ householdId: v.id("households"), retailer: v.union(v.literal("amazon"), v.literal("target")), productUrl: v.string(), canonicalName: v.string() }`
- **Returns:** `{ success: boolean, cartUrl: string | null, error: string | null }`
- **Logic:**
  1. Fetch household; read `playwrightWorkerUrl`, `amazonSessionCookies`, `targetSessionCookies`.
  2. If no `playwrightWorkerUrl`: return `{ success: false, cartUrl: null, error: "Playwright worker not configured — set it in Settings" }`.
  3. Pick cookies: `retailer === "amazon" ? household.amazonSessionCookies : household.targetSessionCookies`.
  4. POST `${playwrightWorkerUrl}/automate` with body `{ retailer, productUrl, sessionCookies: cookiesJson ?? "[]" }` and header `X-Worker-Secret: ${process.env.PLAYWRIGHT_WORKER_SECRET ?? ""}`.
  5. Parse `{ success, cartUrl, error }` from response; return it.
  6. On fetch error: return `{ success: false, cartUrl: null, error: "Worker unreachable" }`.

---

## 5. React Components & Pages

### `LoginPage`
- **File:** `src/pages/LoginPage.tsx`
- **Props:** none
- **State:** `mode: "signIn" | "signUp"`, `email: string`, `password: string`, `error: string | null`, `loading: boolean`
- **Behavior:** `const { signIn } = useAuthActions()` from `@convex-dev/auth/react`. On submit: `await signIn("password", { email, password, flow: mode })`. On success: `navigate("/dashboard")`. Sign-up also uses `flow: "signUp"` with the same call. Shows toggle link to switch mode.
- **Key UI:** Full-page centered card. Title "Grocery Cart Builder". Email input, password input, submit button (disabled while loading). Toggle: "Don't have an account? Sign up" / "Already have an account? Sign in". Error message below form.

### `DashboardPage`
- **File:** `src/pages/DashboardPage.tsx`
- **Props:** none
- **State:** `activeTab: "memory" | "sessions" | "settings"`, `selectedSessionId: Id<"cartSessions"> | null`
- **Behavior:**
  - Check `const { isAuthenticated, isLoading } = useConvexAuth()`. While loading: spinner. If not authenticated: `<Navigate to="/" />`.
  - `const householdData = useQuery(api.households.getMyHousehold)`.
  - If `householdData === null`: render `<CreateHouseholdForm />` centered on page.
  - If `householdData` present: render full dashboard.
- **Key UI:** Top navbar: app name, household name, sign-out button (calls `useAuthActions().signOut()`). Tabs component with three tabs. Memory tab: `<HouseholdMemoryTable />`. Sessions tab: two-column layout — `<CartSessionsList onSelect={setSelectedSessionId} selectedId={selectedSessionId} />` left + `<SessionDetailDrawer sessionId={selectedSessionId} onClose={() => setSelectedSessionId(null)} />` right (on mobile: drawer overlays). Settings tab: `<HouseholdSettings />`.

### `LinkTelegramPage`
- **File:** `src/pages/LinkTelegramPage.tsx`
- **Props:** none
- **State:** `status: "idle" | "linking" | "success" | "error"`, `error: string | null`
- **Behavior:**
  1. `const [searchParams] = useSearchParams()`. Read `tgid = searchParams.get("tgid")` and `token = searchParams.get("token")`.
  2. `const { isAuthenticated, isLoading } = useConvexAuth()`.
  3. While `isLoading`: show spinner.
  4. If not authenticated: show inline `<LoginPage />` with a banner "Sign in to link your Telegram account".
  5. If authenticated and `tgid` present and status is "idle": auto-call `bindTelegramDirect({ telegramUserId: tgid })` mutation → set status "success".
  6. If authenticated and `token` present: call `consume({ token, telegramUserId: "" })` — note: for the token flow, `telegramUserId` must be embedded in the token record (stored at generation time by the bot, requiring a separate mutation `linkTokens/generateForBot`). See note below.
- **Key UI:** Centered card with icon. "Linking your Telegram account..." spinner while linking. Success state: green checkmark, "Your Telegram account is now linked! You can send messages to the bot." with link to dashboard. Error state: red message with error text.
- **Implementation note on token flow:** The `?tgid=` direct link is the primary flow for the PoC. Bot sends `APP_URL/link?tgid=<telegramUserId>` → user opens while logged in → web app calls `bindTelegramDirect`. The `?token=` flow (with pre-generated tokens) is a secondary path and requires `linkTokens/generateForBot` (internal mutation that creates a token record embedding `telegramUserId`, called by `botHandler/dispatch` for `/link`). Implement `?tgid=` first; add `?token=` as a follow-up if time permits.

### `HouseholdMemoryTable`
- **File:** `src/components/HouseholdMemoryTable.tsx`
- **Props:** none
- **State:** `editingId: Id<"householdItems"> | null`, `editDraft: Partial<Doc<"householdItems">>`, `search: string`, `deleteTarget: Id<"householdItems"> | null`
- **Behavior:**
  - `const items = useQuery(api.householdItems.list) ?? []`.
  - Filter by `search` against `canonicalName` and `category` (case-insensitive).
  - Clicking the edit icon: set `editingId` and populate `editDraft` from the item.
  - Save: `await updateItem({ itemId: editingId, patch: editDraft })`. Clear `editingId`.
  - Delete: open `<AlertDialog>` to confirm; on confirm call `removeItem({ itemId: deleteTarget })`.
- **Key UI:** Search input with magnifier icon. Table columns: **Name** (bold), **Category** (muted badge), **Retailer** (colored badge: green=instacart, orange=amazon, blue=target), **Product Name** (editable text), **Amazon URL** (truncated link), **Target URL** (truncated link), **Confidence** (badge: ≥0.8=high green, ≥0.5=medium yellow, <0.5=low red), **Last Added** (relative time), **Actions** (edit pencil icon, delete trash icon). Edit row replaces static cells with Input components for each editable field plus a Retailer Select. Empty state: "No items yet — start a conversation with the bot to build your memory."

### `CartSessionsList`
- **File:** `src/components/CartSessionsList.tsx`
- **Props:** `{ onSelect: (id: Id<"cartSessions">) => void, selectedId: Id<"cartSessions"> | null }`
- **State:** none
- **Behavior:** `const sessions = useQuery(api.cartSessions.list, { limit: 20 }) ?? []`. Click row → `onSelect(session._id)`.
- **Key UI:** Scrollable list of cards. Each card shows: relative timestamp, status badge (complete=green, running=yellow pulse, failed=red, pending=gray), truncated raw message in monospace, retailer icons (Amazon/Target/Instacart) for assignments present, success/failure counts ("3/4 items"). Selected card has highlighted ring. Empty state: "No cart sessions yet."

### `SessionDetailDrawer`
- **File:** `src/components/SessionDetailDrawer.tsx`
- **Props:** `{ sessionId: Id<"cartSessions"> | null, onClose: () => void }`
- **State:** none
- **Behavior:** `const data = useQuery(api.cartSessions.getWithEvents, { sessionId: sessionId! }, enabled by sessionId !== null)`. Renders shadcn `<Sheet open={sessionId !== null} onOpenChange={(o) => !o && onClose()}>`.
- **Key UI:** Sheet panel (right side, 480px). Header: timestamp + status badge. "Cart Links" section: clickable chips for each available cart URL (Amazon cart, Target cart, Instacart list). Execution events table: **Item** (canonicalName), **Retailer** (badge), **Status** (✅ success / ❌ failed / ⏭ skipped), **Product** (product name if available), **Detail** (error or info message). Footer: "X/Y items added successfully."

### `HouseholdSettings`
- **File:** `src/components/HouseholdSettings.tsx`
- **Props:** none
- **State:** `instacartApiKey: string`, `playwrightWorkerUrl: string`, `amazonCookies: string`, `targetCookies: string`, `saving: boolean`
- **Behavior:**
  - `const data = useQuery(api.households.getMyHousehold)`. Populate state from `data.household` on first load.
  - Save each section independently via `updateSettings` mutation with only that section's fields.
  - Telegram section reads `data.member.telegramUserId` for link status.
  - "Unlink" button calls `bindTelegramDirect({ telegramUserId: "", telegramUsername: "" })` (passing empty string to clear — note: `bindTelegramDirect` mutation should support clearing by accepting empty string and setting field to `undefined`).
- **Key UI:** Three `<Card>` components stacked vertically:
  1. **Instacart** card: heading, API key password input, save button. Help text: "Enter your Instacart Connect API key to create real carts. Leave blank to use search deeplinks."
  2. **Browser Automation** card: Worker URL input, Amazon session cookies textarea (placeholder: `[{"name":"session-id","value":"...","domain":".amazon.com","path":"/"}]`), Target session cookies textarea, save button. Help text: "Run the Playwright worker locally (`cd worker && npm start`) and enter its URL here."
  3. **Telegram** card: status display — if linked: "Linked as @{username}" with "Unlink" button; if not linked: "Not linked" with instructions: "Send `/link` to @{VITE_TELEGRAM_BOT_USERNAME} on Telegram, then open the link it sends you."

### `CreateHouseholdForm`
- **File:** `src/components/CreateHouseholdForm.tsx`
- **Props:** none
- **State:** `name: string`, `loading: boolean`, `error: string | null`
- **Behavior:** `const create = useMutation(api.households.create)`. On submit: `await create({ name })`. On success: the `getMyHousehold` query will re-run and the dashboard will update automatically.
- **Key UI:** Full-page centered card with house icon. Title: "Create your household". Subtitle: "Set up a household to start building grocery carts." Name input (placeholder: "Our Home"). "Create Household" button. Error message below.

---

## 6. Environment Variables

### Convex server-side (set via `npx convex env set KEY "value"`)
| Variable | Description |
|---|---|
| `TELEGRAM_BOT_TOKEN` | Telegram Bot API token from BotFather |
| `TELEGRAM_WEBHOOK_SECRET` | Optional shared secret for webhook verification |
| `OPENAI_API_KEY` | OpenAI API key for intent parsing |
| `RESEND_API_KEY` | Resend key (used by Convex Auth for password reset emails) |
| `RESEND_FROM` | Verified sender email, e.g. `noreply@yourdomain.com` |
| `APP_URL` | Public web app URL for Telegram deeplinks, e.g. `https://grocery-cart.vercel.app` |
| `PLAYWRIGHT_WORKER_SECRET` | Shared secret; sent as `X-Worker-Secret` header to the Playwright worker |
| `JWKS` | Auto-generated by `npx @convex-dev/auth` — do not set manually |
| `JWT_PRIVATE_KEY` | Auto-generated by `npx @convex-dev/auth` — do not set manually |
| `SITE_URL` | Set by Convex Auth; should match `APP_URL` |

### Vite client-side (in `.env.local` or Vercel env)
| Variable | Description |
|---|---|
| `VITE_CONVEX_URL` | Convex deployment URL (from `npx convex dev` output or `convex.json`) |
| `VITE_CHALLENGE_ID` | App identifier for VoteATron3000, e.g. `grocery-cart-builder` |
| `VITE_TELEGRAM_BOT_USERNAME` | Bot username without `@`, e.g. `GroceryCartBot` (displayed in Settings) |

### Worker service (in `worker/.env`)
| Variable | Description |
|---|---|
| `WORKER_PORT` | Port to bind to (default: `4000`) |
| `WORKER_SECRET` | Must match `PLAYWRIGHT_WORKER_SECRET` set in Convex |

---

## 7. Build Sequence

Follow these steps in exact order:

1. **Install Convex Auth:**
   ```bash
   npm install @convex-dev/auth
   npx @convex-dev/auth
   ```
   When prompted, select the `Password` provider. This auto-generates `convex/auth.ts` and sets `JWKS` / `JWT_PRIVATE_KEY` in the Convex deployment.

2. **Update `convex/schema.ts`** — Apply the full schema from Section 3. Keep all four template tables. Add `...authTables` at the top.

3. **Fix `convex/http.ts`** — Remove the `"use node"` directive. Add `import { auth } from "./auth"` and `auth.addHttpRoutes(http)` immediately after `const http = httpRouter()`. `process.env` access does not require Node.js runtime.

4. **Create `convex/households.ts`** — Implement `create`, `getMyHousehold`, `updateSettings`, `getByTelegramUserId` per Section 4.

5. **Create `convex/householdItems.ts`** — Implement `list`, `listForHousehold`, `upsert`, `update`, `remove`, `internalUpsertBatch` per Section 4.

6. **Create `convex/cartSessions.ts`** — Implement `list`, `getWithEvents`, `internalCreate`, `internalUpdateStatus`, `internalLogEvent` per Section 4.

7. **Create `convex/linkTokens.ts`** — Implement `generate`, `consume`, `bindTelegramDirect` per Section 4.

8. **Update `convex/telegram.ts`** — Add `ctx.scheduler.runAfter(0, internal.botHandler.dispatch, ...)` call inside `storeIncoming` after the event insert.

9. **Create `convex/intentParser.ts`** — OpenAI JSON-mode action per Section 4.

10. **Create `convex/cartBuilder.ts`** — Full orchestrator including `retailerHeuristic` and `formatReply` helpers per Section 4.

11. **Create `convex/instacartApi.ts`** — Instacart Connect API action with fallback per Section 4.

12. **Create `convex/browserAutomation.ts`** — Playwright worker fetch proxy per Section 4.

13. **Create `convex/botHandler.ts`** — Dispatcher action per Section 4. Import `telegramClient` from `./telegramClient` for direct sends.

14. **Update `convex/openai.ts`** — Add `generateJson` export (same as `generateText` but with `text: { format: { type: "json_object" } }` added to the request body).

15. **Codegen check:**
    ```bash
    npx convex codegen
    ```
    Must exit 0 with no TypeScript errors before proceeding to frontend work.

16. **Set Convex env vars:**
    ```bash
    npx convex env set OPENAI_API_KEY "sk-..."
    npx convex env set TELEGRAM_BOT_TOKEN "your-bot-token"
    npx convex env set RESEND_API_KEY "re_..."
    npx convex env set RESEND_FROM "noreply@yourdomain.com"
    npx convex env set APP_URL "http://localhost:5173"
    npx convex env set PLAYWRIGHT_WORKER_SECRET "some-secret-string"
    ```

17. **Set up Playwright worker:**
    ```bash
    mkdir worker
    # Create worker/package.json, worker/tsconfig.json, worker/index.ts, worker/playwright.ts
    cd worker && npm install && npx playwright install chromium
    ```

18. **Update `package.json`** — Add `"@convex-dev/auth": "^0.0.87"` to `dependencies`. Run `npm install`.

19. **Update `src/App.tsx`** — Replace `ConvexProvider` with `ConvexAuthProvider`; add `/dashboard` and `/link` routes.

20. **Update `src/pages/Index.tsx`** — Replace content with `<Navigate to="/dashboard" replace />`.

21. **Create `src/pages/LoginPage.tsx`**.

22. **Create `src/components/CreateHouseholdForm.tsx`**.

23. **Create `src/components/HouseholdMemoryTable.tsx`**.

24. **Create `src/components/CartSessionsList.tsx`**.

25. **Create `src/components/SessionDetailDrawer.tsx`**.

26. **Create `src/components/HouseholdSettings.tsx`**.

27. **Create `src/pages/DashboardPage.tsx`** — Compose all components; add auth guard.

28. **Create `src/pages/LinkTelegramPage.tsx`**.

29. **Frontend build check:**
    ```bash
    npm run build
    ```
    Must exit 0.

30. **Start full dev stack:**
    ```bash
    # Terminal 1:
    npm run dev:with-convex
    # Terminal 2:
    cd worker && npx ts-node index.ts
    ```

31. **Register Telegram webhook:**
    ```bash
    CONVEX_HTTP_URL=$(npx convex url)
    curl -X POST "https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/setWebhook" \
      -d "url=${CONVEX_HTTP_URL}/telegram-webhook"
    ```

32. **Run smoke tests per Section 8.**

---

## 8. Test Criteria

### Static checks
- `npm run build` exits 0 (no TypeScript errors in frontend).
- `npx convex codegen` exits 0 (no TypeScript errors in Convex functions).

### Auth smoke tests
1. Open `http://localhost:5173`. Browser redirects to `/dashboard`. Since not authenticated, `DashboardPage` redirects to `/`. `LoginPage` renders.
2. Sign up with a fresh email + password. `DashboardPage` loads. `CreateHouseholdForm` is visible.
3. Enter a household name and submit. Dashboard tabs appear (Memory, Sessions, Settings).
4. Sign out via navbar button. Redirected back to login page. Sign in with the same credentials. Dashboard loads and shows the household.

### Telegram bot smoke tests
5. Send any message to the bot. Check Convex dashboard → Logs → `telegram/storeIncoming` succeeded. `botHandler/dispatch` succeeded. Bot replies with "Link your account first" message.
6. Open `http://localhost:5173/link?tgid=12345` (substitute a real Telegram user ID). Page shows "Sign in to link..." if not authenticated. Sign in. Page shows "Linking..." then "Your Telegram account is now linked!"
7. Send any message to the bot again from the linked Telegram account. Bot now calls `cartBuilder/execute`. No "link account" error message.

### Cart building smoke tests (no real credentials)
8. Send "add milk" to the Telegram bot. Bot replies with a formatted message: item listed, retailer assigned, failure detail "No Instacart API key" or "Worker not configured".
9. In the web app, Sessions tab shows a new session. Click it. Detail drawer shows "milk" with status "failed" and the detail message.
10. Memory tab shows "milk" as a new item (auto-added with confidence 0.5).

### Inline editing smoke test
11. In Memory tab, click edit on the "milk" item. Set `amazonUrl` to a real Amazon product URL. Save. Click the row again and verify the URL is persisted.

---

## 9. Deployment Notes

### Convex
- `npx convex deploy` pushes all functions and schema. Auth tables are created automatically by `authTables`.
- After Vercel deploy: update `APP_URL` env var: `npx convex env set APP_URL "https://your-app.vercel.app"`.
- Re-register the Telegram webhook with the production Convex HTTP URL after deploy.
- The `SITE_URL` Convex Auth env var should be set to match `APP_URL`.

### Vercel
- Set `VITE_CONVEX_URL`, `VITE_CHALLENGE_ID`, `VITE_TELEGRAM_BOT_USERNAME` as Vercel environment variables.
- No Vercel serverless functions are needed — all backend runs on Convex.
- The Playwright worker cannot run on Vercel (no persistent process). Host separately.

### Playwright Worker
- Host the `worker/` directory as a standalone Node.js process on any always-on server (Railway, Render free tier, VPS).
- After deploying the worker, each household owner sets the worker URL in **Settings → Browser Automation**.
- The worker must have Chromium installed: `npx playwright install chromium` is required before the first run.
- Secure the worker with the `WORKER_SECRET` / `X-Worker-Secret` header check in `worker/index.ts`.

### Telegram Webhook
- Telegram webhooks require HTTPS. Use ngrok (`ngrok http 3000`) during local dev to get a public HTTPS URL for the Convex dev deployment, or register the webhook against the production Convex deployment from day one.

---

## 10. Auth Notes

This project uses **Convex Auth** (not Clerk).

- **Installation:** `npm install @convex-dev/auth` then `npx @convex-dev/auth` to run the setup wizard. This generates `convex/auth.ts`, sets the `JWKS` and `JWT_PRIVATE_KEY` env vars in the Convex deployment automatically.
- **Provider:** `Password` from `@convex-dev/auth/providers/Password`. Supports email + password sign-up and sign-in. For password reset emails, Resend must be configured (`RESEND_API_KEY` and `RESEND_FROM`).
- **Schema:** Spread `authTables` from `@convex-dev/auth/server` into `defineSchema()`. This adds managed `users`, `authAccounts`, `authSessions`, `authVerificationCodes`, `authRefreshTokens` tables. The `users` table is referenced by `v.id("users")` in `householdMembers`.
- **HTTP routes:** `convex/http.ts` must call `auth.addHttpRoutes(http)` to register Convex Auth's internal endpoints (token exchange, etc.). **This file must NOT have `"use node"` at the top** — HTTP actions always run in the default runtime. The existing template incorrectly includes this directive; it must be removed.
- **Frontend wrapper:** Replace `<ConvexProvider client={convex}>` with `<ConvexAuthProvider client={convex}>` from `@convex-dev/auth/react`. The same `convex` client instance is passed.
- **Auth state:** Use `useConvexAuth()` for `{ isAuthenticated, isLoading }` in components. Use `useAuthActions()` for `{ signIn, signOut }`.
- **Server-side identity:** In Convex mutations/queries, `await ctx.auth.getUserIdentity()` returns `{ subject: string, ... }` where `subject` is the user's unique ID string. Cross-reference against the `users` table via `ctx.db.query("users").filter(q => q.eq(q.field("_id"), identity.subject))` — or use the Convex Auth helper `getCurrentUser(ctx)` if exposed.
- **No Clerk variables needed:** `VITE_CLERK_PUBLISHABLE_KEY` and `CLERK_SECRET_KEY` are Clerk-only. Do not add them.
