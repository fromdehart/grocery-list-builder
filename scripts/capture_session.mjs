/**
 * Cart Gremlin — Session Capture
 *
 * Opens a real browser so you can log in, then saves the full session
 * (cookies + localStorage) to a JSON file you paste into Settings.
 *
 * Usage:
 *   npx playwright install chromium   (first time only)
 *   node scripts/capture_session.mjs wegmans
 *   node scripts/capture_session.mjs costco
 *   node scripts/capture_session.mjs amazon
 *   node scripts/capture_session.mjs target
 */

import { chromium } from "playwright";
import { writeFileSync } from "fs";
import { createInterface } from "readline";

const RETAILERS = {
  wegmans: "https://shop.wegmans.com",
  costco: "https://www.costco.com",
  amazon: "https://www.amazon.com",
  target: "https://www.target.com",
};

const retailer = process.argv[2]?.toLowerCase();

if (!retailer || !RETAILERS[retailer]) {
  console.error(`Usage: node scripts/capture_session.mjs <retailer>`);
  console.error(`Retailers: ${Object.keys(RETAILERS).join(", ")}`);
  process.exit(1);
}

const url = RETAILERS[retailer];
console.log(`\nOpening ${retailer} (${url}) in a browser window...`);
console.log("Log in, then come back here and press Enter.\n");

const browser = await chromium.launch({ headless: false });
const context = await browser.newContext();
const page = await context.newPage();
await page.goto(url);

const rl = createInterface({ input: process.stdin, output: process.stdout });
await new Promise((resolve) => rl.question("Press Enter when logged in... ", resolve));
rl.close();

const state = await context.storageState();
const filename = `${retailer}_session.json`;
writeFileSync(filename, JSON.stringify(state, null, 2));

console.log(`\nSaved to ${filename}`);
console.log(`Paste the full contents of that file into the "${retailer.charAt(0).toUpperCase() + retailer.slice(1)} Session" field in Cart Gremlin Settings.\n`);

await browser.close();
process.exit(0);
