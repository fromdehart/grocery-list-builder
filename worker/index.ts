import express from "express";
import { addToCart, Cookie } from "./playwright";

const app = express();
app.use(express.json());

const WORKER_SECRET = process.env.WORKER_SECRET ?? "";
const PORT = parseInt(process.env.WORKER_PORT ?? "4000", 10);

app.use((req, res, next) => {
  if (WORKER_SECRET) {
    const provided = req.headers["x-worker-secret"];
    if (provided !== WORKER_SECRET) {
      res.status(403).json({ error: "Forbidden" });
      return;
    }
  }
  next();
});

app.post("/automate", async (req, res) => {
  const { retailer, productUrl, sessionCookies } = req.body as {
    retailer: "amazon" | "target";
    productUrl: string;
    sessionCookies: string;
  };

  if (!retailer || !productUrl) {
    res.status(400).json({ success: false, error: "Missing retailer or productUrl" });
    return;
  }

  let cookies: Cookie[] = [];
  try {
    cookies = JSON.parse(sessionCookies ?? "[]") as Cookie[];
  } catch {
    // ignore malformed cookies
  }

  const result = await addToCart(retailer, productUrl, cookies);
  res.json(result);
});

app.get("/health", (_req, res) => {
  res.json({ status: "ok" });
});

app.listen(PORT, () => {
  console.log(`Playwright worker running on port ${PORT}`);
});
