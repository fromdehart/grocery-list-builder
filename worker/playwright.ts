import { chromium } from "playwright";

export type Cookie = {
  name: string;
  value: string;
  domain: string;
  path: string;
  expires?: number;
  httpOnly?: boolean;
  secure?: boolean;
  sameSite?: "Strict" | "Lax" | "None";
};

export type AutomateResult = {
  success: boolean;
  cartUrl: string | null;
  error: string | null;
};

export async function addToCart(
  retailer: "amazon" | "target",
  productUrl: string,
  sessionCookies: Cookie[]
): Promise<AutomateResult> {
  const browser = await chromium.launch({ headless: true });
  try {
    const context = await browser.newContext();

    if (sessionCookies.length > 0) {
      await context.addCookies(sessionCookies);
    }

    const page = await context.newPage();
    await page.goto(productUrl, { waitUntil: "domcontentloaded", timeout: 30000 });

    if (retailer === "amazon") {
      const addBtn = page.locator("#add-to-cart-button, input[name='submit.add-to-cart']").first();
      await addBtn.waitFor({ state: "visible", timeout: 10000 });
      await addBtn.click();
      await page.waitForTimeout(2000);
      const cartUrl = `https://www.amazon.com/gp/cart/view.html`;
      return { success: true, cartUrl, error: null };
    }

    if (retailer === "target") {
      const addBtn = page.locator("[data-test='shippingButton'], button:has-text('Add to cart')").first();
      await addBtn.waitFor({ state: "visible", timeout: 10000 });
      await addBtn.click();
      await page.waitForTimeout(2000);
      const cartUrl = `https://www.target.com/cart`;
      return { success: true, cartUrl, error: null };
    }

    return { success: false, cartUrl: null, error: "Unknown retailer" };
  } catch (e) {
    const error = e instanceof Error ? e.message : String(e);
    return { success: false, cartUrl: null, error };
  } finally {
    await browser.close();
  }
}
