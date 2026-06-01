import { internalAction } from "./_generated/server";
import { v } from "convex/values";

type ParsedIntent = {
  intent: "add" | "build" | "list" | "remove" | "help" | "unknown";
  items: Array<{
    rawText: string;
    canonicalName: string;
    quantity: number;
    unit: string | null;
    retailerConstraint: "amazon" | "target" | "instacart" | "wegmans" | "costco" | null;
  }>;
  globalRetailerConstraint: "amazon" | "target" | "instacart" | "wegmans" | "costco" | null;
};

export const parse = internalAction({
  args: {
    rawMessage: v.string(),
    knownItemNames: v.array(v.string()),
  },
  handler: async (_ctx, args): Promise<ParsedIntent> => {
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
      return { intent: "unknown", items: [], globalRetailerConstraint: null };
    }

    const systemPrompt = `You are a grocery shopping assistant. Extract shopping intent from the user's message and respond with valid JSON only. Schema: { "intent": "add|build|list|remove|help|unknown", "items": [{ "rawText": string, "canonicalName": string (lowercase singular, e.g. 'bananas'->'banana'), "quantity": number, "unit": string|null, "retailerConstraint": "amazon"|"target"|"instacart"|"wegmans"|"costco"|null }], "globalRetailerConstraint": "amazon"|"target"|"instacart"|"wegmans"|"costco"|null }. If the message matches a known item, use its exact canonicalName. Known items: ${args.knownItemNames.join(", ")}. Intent 'add' means add items now; 'build' means build/finalize the cart; 'list' means show memory; 'remove' means delete from memory.`;

    const input = [
      {
        type: "message",
        role: "system",
        content: [{ type: "input_text", text: systemPrompt }],
      },
      {
        type: "message",
        role: "user",
        content: [{ type: "input_text", text: args.rawMessage }],
      },
    ];

    try {
      const res = await fetch("https://api.openai.com/v1/responses", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: "gpt-4o",
          input,
          text: { format: { type: "json_object" } },
        }),
      });

      if (!res.ok) {
        console.error("OpenAI error:", res.status, await res.text());
        return { intent: "unknown", items: [], globalRetailerConstraint: null };
      }

      const data = (await res.json()) as {
        output?: Array<{ content?: Array<{ type?: string; text?: string }> }>;
      };

      const parts = data.output?.flatMap((o) => o.content ?? []) ?? [];
      const textPart = parts.find((c) => c.type === "output_text");
      if (!textPart?.text) {
        return { intent: "unknown", items: [], globalRetailerConstraint: null };
      }

      const parsed = JSON.parse(textPart.text) as ParsedIntent;
      if (!parsed.intent || !Array.isArray(parsed.items)) {
        return { intent: "unknown", items: [], globalRetailerConstraint: null };
      }
      return parsed;
    } catch (e) {
      console.error("Intent parse error:", e);
      return { intent: "unknown", items: [], globalRetailerConstraint: null };
    }
  },
});
