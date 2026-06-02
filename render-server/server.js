/**
 * Self-hosted render + cart automation service.
 *
 * POST /render        - Render a URL to HTML (enrich flow)
 * POST /automate      - Add a product to a retailer cart via browser automation
 * GET  /health        - Health check
 *
 * Run: npm install && npx playwright install chromium && npm start
 */
import express from "express";
import { chromium } from "playwright";

const app = express();
app.use(express.json({ limit: "2mb" }));

const PORT = Number(process.env.PORT) || 3030;
const RENDER_SECRET = process.env.RENDER_SECRET?.trim();
const RENDER_TIMEOUT_MS = Number(process.env.RENDER_TIMEOUT_MS) || 18000;
const AUTOMATE_TIMEOUT_MS = Number(process.env.AUTOMATE_TIMEOUT_MS) || 30000;

const LAUNCH_ARGS = [
  "--no-sandbox",
  "--disable-setuid-sandbox",
  "--disable-dev-shm-usage",
  "--disable-gpu",
  "--disable-software-rasterizer",
  "--disable-extensions",
  "--no-first-run",
  "--no-zygote",
];

const USER_AGENT =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";

function checkAuth(req) {
  if (!RENDER_SECRET) return true;
  const header = req.headers["x-render-secret"] ?? req.headers["x-worker-secret"];
  return typeof header === "string" && header.trim() === RENDER_SECRET;
}

// ── /render ──────────────────────────────────────────────────────────────────

app.post("/render", async (req, res) => {
  if (!checkAuth(req)) return res.status(401).json({ error: "Unauthorized" });

  const url = req.body?.url;
  if (typeof url !== "string" || !url.startsWith("http")) {
    return res.status(400).json({ error: "Missing or invalid url in body" });
  }

  let browser;
  try {
    browser = await chromium.launch({ headless: true, args: LAUNCH_ARGS });
    const page = await browser.newPage();
    await page.setExtraHTTPHeaders({ "User-Agent": USER_AGENT });
    await page.goto(url, { waitUntil: "domcontentloaded", timeout: RENDER_TIMEOUT_MS });
    await page.waitForTimeout(2000);
    const html = await page.content();
    await browser.close();
    res.json({ html });
  } catch (e) {
    if (browser) await browser.close().catch(() => {});
    console.error("Render failed:", e);
    res.status(e.message?.includes("timeout") ? 408 : 502).json({ error: e.message || "Render failed" });
  }
});

// ── /automate ─────────────────────────────────────────────────────────────────

async function automateAmazon(page, productUrl) {
  await page.goto(productUrl, { waitUntil: "domcontentloaded", timeout: AUTOMATE_TIMEOUT_MS });
  await page.waitForSelector("#add-to-cart-button, #submit.add-to-cart", { timeout: 8000 });
  await page.click("#add-to-cart-button, #submit.add-to-cart");
  await page.waitForTimeout(2000);
  return { cartUrl: "https://www.amazon.com/gp/cart/view.html" };
}

async function automateTarget(page, productUrl) {
  await page.goto(productUrl, { waitUntil: "domcontentloaded", timeout: AUTOMATE_TIMEOUT_MS });
  await page.waitForSelector('[data-test="shippingButton"], [data-test="addToCartButton"]', { timeout: 8000 });
  await page.click('[data-test="shippingButton"], [data-test="addToCartButton"]');
  await page.waitForTimeout(2000);
  return { cartUrl: "https://www.target.com/cart" };
}

async function automateWegmans(page, productUrl) {
  // Navigate to the shop homepage first so MSAL can silently refresh an
  // expired access token using the long-lived refresh token (~90 day expiry).
  // Without this, a 1-hour-old session would fail on every add-to-cart.
  await page.goto("https://www.wegmans.com/shop", { waitUntil: "domcontentloaded", timeout: 20000 });
  await page.waitForTimeout(4000); // give MSAL time to complete silent token refresh

  await page.goto(productUrl, { waitUntil: "domcontentloaded", timeout: AUTOMATE_TIMEOUT_MS });
  await page.waitForSelector("button.default-add-button", { timeout: 10000 });
  await page.click("button.default-add-button");
  await page.waitForTimeout(2000);
  return { cartUrl: "https://www.wegmans.com/shop/cart" };
}

async function automateCostco(page, productUrl) {
  await page.goto(productUrl, { waitUntil: "domcontentloaded", timeout: AUTOMATE_TIMEOUT_MS });
  await page.waitForSelector(
    '.add-to-cart-btn, #add-to-cart-btn, button[automation-id="addToCart"], button[data-automation-id="add-to-cart"]',
    { timeout: 8000 }
  );
  await page.click(
    '.add-to-cart-btn, #add-to-cart-btn, button[automation-id="addToCart"], button[data-automation-id="add-to-cart"]'
  );
  await page.waitForTimeout(2000);
  return { cartUrl: "https://www.costco.com/CheckoutCartDisplayView" };
}

const RETAILER_HANDLERS = {
  amazon: automateAmazon,
  target: automateTarget,
  wegmans: automateWegmans,
  costco: automateCostco,
};

app.post("/automate", async (req, res) => {
  if (!checkAuth(req)) return res.status(401).json({ error: "Unauthorized" });

  const { retailer, productUrl, sessionCookies } = req.body ?? {};

  if (!retailer || !RETAILER_HANDLERS[retailer]) {
    return res.status(400).json({ success: false, error: `Unknown retailer: ${retailer}` });
  }
  if (typeof productUrl !== "string" || !productUrl.startsWith("http")) {
    return res.status(400).json({ success: false, error: "Missing or invalid productUrl" });
  }

  let browser;
  try {
    browser = await chromium.launch({ headless: true, args: LAUNCH_ARGS });
    // Parse session data — supports both cookie arrays and full storageState objects
    let parsedSession = null;
    if (sessionCookies) {
      try {
        parsedSession = typeof sessionCookies === "string" ? JSON.parse(sessionCookies) : sessionCookies;
      } catch { /* ignore */ }
    }

    const isStorageState = parsedSession && !Array.isArray(parsedSession) && parsedSession.cookies !== undefined;

    const context = isStorageState
      ? await browser.newContext({ userAgent: USER_AGENT, storageState: parsedSession })
      : await browser.newContext({ userAgent: USER_AGENT });

    if (!isStorageState && Array.isArray(parsedSession) && parsedSession.length > 0) {
      await context.addCookies(parsedSession);
    }

    const page = await context.newPage();
    const handler = RETAILER_HANDLERS[retailer];
    const result = await handler(page, productUrl);

    await browser.close();
    res.json({ success: true, cartUrl: result.cartUrl ?? null });
  } catch (e) {
    if (browser) await browser.close().catch(() => {});
    console.error(`Automate [${retailer}] failed:`, e);
    res.json({ success: false, cartUrl: null, error: e.message || "Automation failed" });
  }
});

// ── /search ───────────────────────────────────────────────────────────────────

const SEARCH_URLS = {
  wegmans: (q) => `https://www.wegmans.com/shop/search?q=${encodeURIComponent(q)}`,
  costco:  (q) => `https://www.costco.com/s?keyword=${encodeURIComponent(q)}`,
  amazon:  (q) => `https://www.amazon.com/s?k=${encodeURIComponent(q)}`,
  target:  (q) => `https://www.target.com/s?searchTerm=${encodeURIComponent(q)}`,
};

function nameFromUrl(url, retailer) {
  try {
    const path = new URL(url).pathname;
    if (retailer === "wegmans") {
      const match = path.match(/\/shop\/product\/\d+-(.+)/);
      if (match) return match[1].replace(/-/g, " ");
    }
    if (retailer === "costco") {
      const match = path.match(/\/(.+)\.product\./);
      if (match) return match[1].replace(/-/g, " ");
    }
    if (retailer === "amazon") {
      const match = path.match(/\/([^/]+)\/dp\//);
      if (match) return match[1].replace(/-/g, " ");
    }
  } catch {}
  return "";
}

function normalizeQuery(q) {
  return q.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
}

async function searchRetailer(page, retailer, query) {
  query = normalizeQuery(query);
  const searchUrl = SEARCH_URLS[retailer]?.(query);
  if (!searchUrl) return { results: [], searchUrl: "" };

  let hrefs = [];

  if (retailer === "wegmans") {
    // Wegmans uses Algolia — intercept the response triggered by typing in the search box
    const intercepted = [];
    page.on("response", async (response) => {
      if (!response.url().includes("algolia.net") || !response.url().includes("queries")) return;
      try {
        const json = await response.json();
        const res = json.results?.[0];
        if (res?.query?.trim() && res.hits?.length > 0) {
          for (const hit of res.hits) {
            const slug = hit.slug || String(hit.skuId || hit.sku || "");
            const name = hit.productName || hit.name || "";
            if (slug && name) intercepted.push({ name, slug });
          }
        }
      } catch {}
    });

    await page.goto("https://www.wegmans.com/shop/search", { waitUntil: "domcontentloaded", timeout: 25000 });
    await page.waitForTimeout(3000);

    const input = await page.$('input[type="search"], input[name="q"], input[id*="search" i], input[placeholder*="search" i]');
    console.log(`[search:wegmans] input found=${!!input}, query="${query}"`);
    if (input) {
      await input.click();
      await input.fill(query);
      await page.keyboard.press("Enter");
      await page.waitForTimeout(5000);
    }

    console.log(`[search:wegmans] intercepted ${intercepted.length} hits`);
    hrefs = intercepted.slice(0, 10).map(p => ({
      url: `https://www.wegmans.com/shop/product/${p.slug}`,
      name: p.name,
    }));

    return { results: hrefs, searchUrl: `https://www.wegmans.com/shop/search?q=${encodeURIComponent(query)}` };
  }

  // ── Other retailers: DOM scraping with keyword filter ───────────────────────
  await page.goto(searchUrl, { waitUntil: "domcontentloaded", timeout: 25000 });
  await page.waitForTimeout(4000);

  let rawHrefs = [];
  if (retailer === "costco") {
    rawHrefs = await page.$$eval('a[href*=".product."]', els =>
      [...new Set(els.map(e => e.href))]
    );
  } else if (retailer === "amazon") {
    rawHrefs = await page.$$eval('a[href*="/dp/"]', els =>
      [...new Set(els.map(e => e.href))].filter(h => h.includes("amazon.com"))
    );
  } else if (retailer === "target") {
    rawHrefs = await page.$$eval('a[href*="/p/"]', els =>
      [...new Set(els.map(e => e.href))].filter(h => h.includes("target.com"))
    );
  }

  const words = query.toLowerCase().split(/\s+/).filter(w => w.length > 2);
  const filtered = words.length > 0
    ? rawHrefs.filter(h => { const n = nameFromUrl(h, retailer).toLowerCase(); return words.some(w => n.includes(w)); })
    : rawHrefs;

  const results = filtered.slice(0, 10).map(url => ({ url, name: nameFromUrl(url, retailer) }));
  return { results, searchUrl };
}

app.post("/search", async (req, res) => {
  if (!checkAuth(req)) return res.status(401).json({ error: "Unauthorized" });

  const { retailer, query, sessionCookies } = req.body ?? {};

  if (!retailer || !SEARCH_URLS[retailer]) {
    return res.status(400).json({ error: `Unknown retailer: ${retailer}` });
  }
  if (typeof query !== "string" || !query.trim()) {
    return res.status(400).json({ error: "Missing query" });
  }

  let browser;
  try {
    browser = await chromium.launch({ headless: true, args: LAUNCH_ARGS });

    let parsedSession = null;
    if (sessionCookies) {
      try { parsedSession = typeof sessionCookies === "string" ? JSON.parse(sessionCookies) : sessionCookies; } catch {}
    }
    const isStorageState = parsedSession && !Array.isArray(parsedSession) && parsedSession.cookies !== undefined;
    const context = isStorageState
      ? await browser.newContext({ userAgent: USER_AGENT, storageState: parsedSession })
      : await browser.newContext({ userAgent: USER_AGENT });
    if (!isStorageState && Array.isArray(parsedSession) && parsedSession.length > 0) {
      await context.addCookies(parsedSession);
    }

    const page = await context.newPage();
    const { results, searchUrl } = await searchRetailer(page, retailer, query);
    await browser.close();

    res.json({ results, searchUrl });
  } catch (e) {
    if (browser) await browser.close().catch(() => {});
    console.error(`Search [${retailer}] failed:`, e);
    res.json({ results: [], searchUrl: SEARCH_URLS[retailer]?.(query) ?? "", error: e.message });
  }
});

// ── /cart-contents ───────────────────────────────────────────────────────────

app.post("/cart-contents", async (req, res) => {
  if (!checkAuth(req)) return res.status(401).json({ error: "Unauthorized" });

  const { sessionCookies } = req.body ?? {};

  let browser;
  try {
    browser = await chromium.launch({ headless: true, args: LAUNCH_ARGS });

    let parsedSession = null;
    if (sessionCookies) {
      try { parsedSession = typeof sessionCookies === "string" ? JSON.parse(sessionCookies) : sessionCookies; } catch {}
    }
    const isStorageState = parsedSession && !Array.isArray(parsedSession) && parsedSession.cookies !== undefined;
    const context = isStorageState
      ? await browser.newContext({ userAgent: USER_AGENT, storageState: parsedSession })
      : await browser.newContext({ userAgent: USER_AGENT });
    if (!isStorageState && Array.isArray(parsedSession) && parsedSession.length > 0) {
      await context.addCookies(parsedSession);
    }

    const page = await context.newPage();

    // Capture the MSAL access token from the silent refresh, then call the cart
    // API directly with fetch — avoids response-body availability issues entirely.
    let accessToken = null;
    let accessTokenResolve;
    const accessTokenPromise = new Promise((resolve) => { accessTokenResolve = resolve; });
    const accessTokenTimeout = setTimeout(() => accessTokenResolve(null), 15000);

    page.on("response", async (response) => {
      if (!response.url().includes("myaccount.wegmans.com") || !response.url().includes("oauth2")) return;
      try {
        const json = await response.json();
        if (json.access_token) {
          clearTimeout(accessTokenTimeout);
          accessTokenResolve(json.access_token);
        }
      } catch {}
    });

    await page.goto("https://www.wegmans.com/shop", { waitUntil: "domcontentloaded", timeout: 20000 });
    accessToken = await accessTokenPromise;
    console.log(`[cart-contents] MSAL token: ${accessToken ? "captured" : "not found"}`);

    await browser.close();
    browser = null;

    const cartItems = [];

    if (accessToken) {
      // Call the cart API directly — no browser needed
      const cartRes = await fetch(
        "https://api.digitaldevelopment.wegmans.cloud/commerce/cart/carts/?api-version=2024-02-19-preview",
        { headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" } }
      );
      console.log(`[cart-contents] direct cart API: ${cartRes.status}`);
      if (cartRes.ok) {
        const cartJson = await cartRes.json();
        const lineItems = cartJson.grocery?.lineItems ?? [];
        console.log(`[cart-contents] lineItems: ${lineItems.length}`);
        for (const item of lineItems) {
          const skuId = String(item.productKey || item.variant?.sku || "");
          const name = item.name || "";
          const quantity = Number(item.quantity || 1);
          const priceCents = item.lineItemPrice?.totalPrice ?? item.totalPrice?.centAmount ?? 0;
          const price = `$${(priceCents / 100).toFixed(2)}`;

          let aisle = null, shelf = null, aisleSide = null, section = null;
          try {
            const planogramRaw = item.custom?.customFieldsRaw?.find((f) => f.name === "planogram")?.value;
            if (planogramRaw) {
              const p = JSON.parse(planogramRaw);
              aisle = p.aisle || null;
              shelf = p.shelf || null;
              aisleSide = p.aisleSide || null;
              section = p.section || null;
            }
          } catch {}

          if (skuId) cartItems.push({ skuId, name, quantity, price, aisle, shelf, aisleSide, section });
        }
      }
    }

    console.log(`[cart-contents] found ${cartItems.length} items`);
    res.json({ items: cartItems });
  } catch (e) {
    if (browser) await browser.close().catch(() => {});
    console.error("cart-contents failed:", e);
    res.json({ items: [], error: e.message });
  }
});

// ── /health ───────────────────────────────────────────────────────────────────

app.get("/health", (_, res) => res.json({ ok: true }));

app.listen(PORT, () => {
  console.log(`Server listening on port ${PORT}`);
  if (RENDER_SECRET) console.log("Auth enabled (X-Render-Secret / X-Worker-Secret)");
});
