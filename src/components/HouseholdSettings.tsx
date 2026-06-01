import { useState, useEffect } from "react";
import { useQuery, useMutation } from "convex/react";
import { api } from "../../convex/_generated/api";

export default function HouseholdSettings() {
  const data = useQuery(api.households.getMyHousehold);
  const updateSettings = useMutation(api.households.updateSettings);
  const bindTelegram = useMutation(api.linkTokens.bindTelegramDirect);

  const [instacartApiKey, setInstacartApiKey] = useState("");
  const [playwrightWorkerUrl, setPlaywrightWorkerUrl] = useState("");
  const [amazonCookies, setAmazonCookies] = useState("");
  const [targetCookies, setTargetCookies] = useState("");
  const [saving, setSaving] = useState<string | null>(null);
  const [saved, setSaved] = useState<string | null>(null);

  useEffect(() => {
    if (data?.household) {
      setInstacartApiKey(data.household.instacartApiKey ?? "");
      setPlaywrightWorkerUrl(data.household.playwrightWorkerUrl ?? "");
      setAmazonCookies(data.household.amazonSessionCookies ?? "");
      setTargetCookies(data.household.targetSessionCookies ?? "");
    }
  }, [data?.household?._id]);

  const save = async (section: string, patch: Record<string, string | undefined>) => {
    setSaving(section);
    try {
      await updateSettings(patch);
      setSaved(section);
      setTimeout(() => setSaved(null), 2000);
    } finally {
      setSaving(null);
    }
  };

  const botUsername = import.meta.env.VITE_TELEGRAM_BOT_USERNAME ?? "YourGroceryBot";

  return (
    <div className="space-y-6 max-w-2xl">
      {/* Instacart */}
      <div className="bg-white rounded-xl border border-gray-200 p-5">
        <h3 className="font-semibold text-gray-900 mb-1">Instacart</h3>
        <p className="text-xs text-gray-500 mb-4">
          Enter your Instacart Connect API key to create real carts. Leave blank to use search deeplinks.
        </p>
        <div className="space-y-3">
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">API Key</label>
            <input
              type="password"
              value={instacartApiKey}
              onChange={(e) => setInstacartApiKey(e.target.value)}
              placeholder="ic_..."
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
            />
          </div>
          <button
            onClick={() => save("instacart", { instacartApiKey })}
            disabled={saving === "instacart"}
            className="px-4 py-2 bg-green-600 text-white text-sm font-medium rounded-lg hover:bg-green-700 disabled:opacity-60"
          >
            {saving === "instacart" ? "Saving…" : saved === "instacart" ? "Saved ✓" : "Save"}
          </button>
        </div>
      </div>

      {/* Browser Automation */}
      <div className="bg-white rounded-xl border border-gray-200 p-5">
        <h3 className="font-semibold text-gray-900 mb-1">Browser Automation</h3>
        <p className="text-xs text-gray-500 mb-4">
          Run the Playwright worker locally (<code className="bg-gray-100 px-1 rounded">cd worker && npm start</code>) and enter its URL here.
        </p>
        <div className="space-y-3">
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">Worker URL</label>
            <input
              type="text"
              value={playwrightWorkerUrl}
              onChange={(e) => setPlaywrightWorkerUrl(e.target.value)}
              placeholder="http://localhost:4000"
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">Amazon Session Cookies (JSON)</label>
            <textarea
              value={amazonCookies}
              onChange={(e) => setAmazonCookies(e.target.value)}
              rows={3}
              placeholder={`[{"name":"session-id","value":"...","domain":".amazon.com","path":"/"}]`}
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-xs font-mono focus:outline-none focus:ring-2 focus:ring-green-500"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">Target Session Cookies (JSON)</label>
            <textarea
              value={targetCookies}
              onChange={(e) => setTargetCookies(e.target.value)}
              rows={3}
              placeholder={`[{"name":"UserSession","value":"...","domain":".target.com","path":"/"}]`}
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-xs font-mono focus:outline-none focus:ring-2 focus:ring-green-500"
            />
          </div>
          <button
            onClick={() => save("automation", { playwrightWorkerUrl, amazonSessionCookies: amazonCookies, targetSessionCookies: targetCookies })}
            disabled={saving === "automation"}
            className="px-4 py-2 bg-green-600 text-white text-sm font-medium rounded-lg hover:bg-green-700 disabled:opacity-60"
          >
            {saving === "automation" ? "Saving…" : saved === "automation" ? "Saved ✓" : "Save"}
          </button>
        </div>
      </div>

      {/* Telegram */}
      <div className="bg-white rounded-xl border border-gray-200 p-5">
        <h3 className="font-semibold text-gray-900 mb-1">Telegram</h3>
        {data?.member?.telegramUserId ? (
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-green-700 font-medium">
                Linked as @{data.member.telegramUsername ?? data.member.telegramUserId}
              </p>
              <p className="text-xs text-gray-500 mt-0.5">Your Telegram account is connected.</p>
            </div>
            <button
              onClick={async () => {
                await bindTelegram({ telegramUserId: "", telegramUsername: "" });
              }}
              className="px-3 py-1.5 text-xs text-red-600 border border-red-200 rounded-lg hover:bg-red-50"
            >
              Unlink
            </button>
          </div>
        ) : (
          <div>
            <p className="text-sm text-gray-600 mb-2">Not linked</p>
            <p className="text-xs text-gray-500">
              Send <code className="bg-gray-100 px-1 rounded">/link</code> to{" "}
              <span className="font-medium">@{botUsername}</span> on Telegram, then open the link it sends you.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
