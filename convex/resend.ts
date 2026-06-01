"use node";

import { action } from "./_generated/server";
import { v } from "convex/values";

const getConfig = () => ({
  apiKey: process.env.RESEND_API_KEY!,
  from: process.env.RESEND_FROM ?? "",
});

export const sendEmail = action({
  args: {
    to: v.string(),
    subject: v.string(),
    html: v.string(),
  },
  handler: async (_ctx, args) => {
    const { apiKey, from } = getConfig();
    if (!apiKey || !from) {
      return { success: false as const, error: "Missing RESEND_API_KEY or RESEND_FROM" };
    }
    try {
      const { Resend } = await import("resend");
      const resend = new Resend(apiKey);
      const { data, error } = await resend.emails.send({
        from,
        to: args.to,
        subject: args.subject,
        html: args.html,
      });
      if (error) {
        return { success: false as const, error: error.message };
      }
      return { success: true as const };
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : String(e);
      return { success: false as const, error: message };
    }
  },
});

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
