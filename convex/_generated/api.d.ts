/* eslint-disable */
/**
 * Generated `api` utility.
 *
 * THIS CODE IS AUTOMATICALLY GENERATED.
 *
 * To regenerate, run `npx convex dev`.
 * @module
 */

import type * as auth from "../auth.js";
import type * as botHandler from "../botHandler.js";
import type * as browserAutomation from "../browserAutomation.js";
import type * as cartBuilder from "../cartBuilder.js";
import type * as cartSessions from "../cartSessions.js";
import type * as householdItems from "../householdItems.js";
import type * as households from "../households.js";
import type * as http from "../http.js";
import type * as instacartApi from "../instacartApi.js";
import type * as intentParser from "../intentParser.js";
import type * as leads from "../leads.js";
import type * as linkTokens from "../linkTokens.js";
import type * as openai from "../openai.js";
import type * as resend from "../resend.js";
import type * as telegram from "../telegram.js";
import type * as telegramClient from "../telegramClient.js";
import type * as tracking from "../tracking.js";
import type * as votes from "../votes.js";

import type {
  ApiFromModules,
  FilterApi,
  FunctionReference,
} from "convex/server";

declare const fullApi: ApiFromModules<{
  auth: typeof auth;
  botHandler: typeof botHandler;
  browserAutomation: typeof browserAutomation;
  cartBuilder: typeof cartBuilder;
  cartSessions: typeof cartSessions;
  householdItems: typeof householdItems;
  households: typeof households;
  http: typeof http;
  instacartApi: typeof instacartApi;
  intentParser: typeof intentParser;
  leads: typeof leads;
  linkTokens: typeof linkTokens;
  openai: typeof openai;
  resend: typeof resend;
  telegram: typeof telegram;
  telegramClient: typeof telegramClient;
  tracking: typeof tracking;
  votes: typeof votes;
}>;

/**
 * A utility for referencing Convex functions in your app's public API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = api.myModule.myFunction;
 * ```
 */
export declare const api: FilterApi<
  typeof fullApi,
  FunctionReference<any, "public">
>;

/**
 * A utility for referencing Convex functions in your app's internal API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = internal.myModule.myFunction;
 * ```
 */
export declare const internal: FilterApi<
  typeof fullApi,
  FunctionReference<any, "internal">
>;

export declare const components: {};
