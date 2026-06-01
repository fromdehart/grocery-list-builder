# High-Level Plan: AI Household Grocery Cart Builder

## What It Does
A conversational AI system where users send natural-language shopping requests via Telegram ("add milk and bananas", "build my Amazon cart") and the system resolves items against a persistent household product memory, assigns them to optimal retailers, and executes cart additions — via Instacart API or URL-based browser automation for Amazon/Target — when the user is authenticated. A web dashboard provides visibility into household memory, cart history, and execution logs.

## Key Features
- **Telegram bot interface** — primary UX; parses natural language add/build commands via OpenAI
- **Household product memory** — per-household table of canonical items with preferred product names, categories, purchase frequency, and per-retailer product URLs/ASINs
- **AI intent parsing** — OpenAI extracts structured intent (items + optional retailer constraint) from freeform messages
- **Retailer routing** — assigns each item to Amazon, Target, or Instacart based on household preference history and category heuristics; respects explicit user overrides
- **URL-based browser automation** — Playwright navigates directly to stored `amazon_url` / `target_url` per item and clicks "Add to Cart" in an authenticated browser session; no search-based automation needed since URLs are pre-mapped in memory
- **Instacart API integration** — uses Instacart Connect API to create/update carts programmatically; falls back to shareable list deeplinks if API is unavailable for a given store
- **Execution summary reply** — Telegram response includes resolved products, retailer assignments, success/failure per item, and cart links/session outputs
- **Web dashboard** — view household memory (items, preferred products, per-retailer URLs), recent cart sessions, execution logs, and account/household settings
- **Auth + multi-household** — Convex Auth from day one; each user belongs to a household; household data (items, sessions, events) is scoped to the household; Telegram user ID is linked to a user account at setup

## Tech Stack
- Frontend: React + Vite + Tailwind (template already in place)
- Backend: Convex — stores users, households, household memory, cart sessions, execution events; real-time subscriptions power the dashboard
- Auth: Convex Auth (email/password or magic link) — web dashboard login; Telegram bot links Telegram user ID to a Convex user account via a one-time setup command
- Browser automation: Playwright running server-side (Node.js worker or Convex action with external browser service) — navigates stored product URLs and adds to cart while authenticated
- Instacart: Instacart Connect API for cart/list creation; authenticated via API key per household
- AI: OpenAI (intent parsing, item resolution, canonical name normalization)
- Email: Resend (magic link auth emails; skip transactional emails for PoC)

## Scope & Constraints

**In scope:**
- Telegram bot command handling (add items, build cart, list memory, remove item, link account)
- Household product memory CRUD in Convex (canonical name, category, preferred product per retailer, per-retailer URL/ASIN)
- OpenAI-powered intent parsing and item → product resolution
- URL-based browser automation for Amazon and Target: Playwright navigates to stored product URLs and clicks "Add to Cart" in an authenticated session; credentials stored securely, never passed to AI layer
- Instacart Connect API integration: create or update carts via API using stored item mappings; fallback to shareable list URL if store is not API-supported
- Per-session execution log (what was resolved, what failed, which retailer, automation result)
- Web dashboard: login (Convex Auth), household memory table with edit support, recent cart sessions list, session detail view with per-item execution log
- Multi-user / multi-household schema from day one: `users`, `households`, `householdMembers` tables; all item/session/event data scoped to `householdId`
- Telegram account linking: `/link` command in bot generates a one-time token; user pastes it in the web app to bind their Telegram ID to their Convex account

**Out of scope:**
- Search-based browser automation (all automation uses pre-mapped URLs, not product search)
- Actual checkout or order placement (cart building only)
- Real-time price data (show "N/A" unless returned by Instacart API)
- Purchase history ingestion / receipt parsing
- Mobile app or voice interface
- Admin UI for managing households across the platform

## Implementation Approach

1. **Auth + schema foundation** — set up Convex Auth; define tables: `users`, `households`, `householdMembers` (userId, householdId, role, telegramUserId), `householdItems` (householdId, canonicalName, category, preferredProduct per retailer, amazon_url, target_url, instacart_itemId, frequency, confidenceScore), `cartSessions` (householdId, timestamp, items, retailerAssignments, links), `executionEvents` (sessionId, itemId, retailer, status, detail)

2. **Telegram account linking** — `/link` bot command generates a short-lived token stored in Convex; web dashboard "Link Telegram" page validates and binds `telegramUserId` to the authenticated Convex user; subsequent Telegram messages are resolved to a household via this link

3. **AI intent pipeline** — OpenAI function-calling prompt receives Telegram message + household memory context; returns `{ intent: "add"|"build"|"manage", items: [...], retailerConstraint: "amazon"|"target"|"instacart"|null }`; second call resolves each item to a preferred product and maps it to household memory (creating new entries if missing)

4. **Retailer router** — deterministic function maps (item, retailerConstraint, householdMemory) → retailer assignment; prefers household-preferred retailer per item; falls back to category heuristics; logs each routing decision to `executionEvents`

5. **Instacart API execution** — for Instacart-assigned items, call Instacart Connect API with stored `instacart_itemId` or product name to add to cart; capture cart URL returned by API; log success/failure per item

6. **Browser automation execution** — for Amazon/Target-assigned items, Playwright worker loads the stored `amazon_url` or `target_url` directly (no search), clicks "Add to Cart" in an authenticated browser session; session cookies stored encrypted per household; log success/failure per item; return cart URL

7. **Telegram response formatter** — formats execution results into the structured reply: resolved products, failures with reason, retailer assignments, cart links, session summary; sends via `telegramClient.ts`

8. **Web dashboard** — replace `Index.tsx`: auth-gated login page → household dashboard with memory table (inline edit of preferred products and URLs), recent cart sessions list, session detail drawer with per-item execution log, household settings (retailer credentials setup, Telegram link status)

## Open Questions
- Which Instacart Connect API tier is available? (Affiliate vs. retailer-level access determines whether we can create carts or only lists.)
- For browser automation, run Playwright in a persistent Convex action, a sidecar Node.js service, or a managed browser service (e.g., Browserbase)? The choice affects credential storage and execution latency.
- Should new items discovered via Telegram (not yet in household memory) be auto-added to memory with a low confidence score, or queued for user confirmation before persistence?
- Is there a seed dataset of household staples to pre-populate memory, or does the user build it from scratch?
