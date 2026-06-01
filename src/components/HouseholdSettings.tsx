import { useState, useEffect } from "react";
import { useQuery, useMutation } from "convex/react";
import { api } from "../../convex/_generated/api";

export default function HouseholdSettings() {
  const data = useQuery(api.households.getMyHousehold);
  const updateSettings = useMutation(api.households.updateSettings);
  const bindTelegram = useMutation(api.linkTokens.bindTelegramDirect);

  const [playwrightWorkerUrl, setPlaywrightWorkerUrl] = useState("");
  const [amazonCookies, setAmazonCookies] = useState("");
  const [targetCookies, setTargetCookies] = useState("");
  const [wegmansCookies, setWegmansCookies] = useState("");
  const [costcoCookies, setCostcoCookies] = useState("");
  const [saving, setSaving] = useState<string | null>(null);
  const [saved, setSaved] = useState<string | null>(null);

  useEffect(() => {
    if (data?.household) {
      setPlaywrightWorkerUrl(data.household.playwrightWorkerUrl ?? "");
      setAmazonCookies(data.household.amazonSessionCookies ?? "");
      setTargetCookies(data.household.targetSessionCookies ?? "");
      setWegmansCookies(data.household.wegmansSessionCookies ?? "");
      setCostcoCookies(data.household.costcoSessionCookies ?? "");
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

  const cookiePlaceholder = (_domain: string) =>
    `{"cookies":[...],"origins":[{"origin":"https://...","localStorage":[...]}]}`;

  const botUsername = import.meta.env.VITE_TELEGRAM_BOT_USERNAME ?? "YourGroceryBot";

  return (
    <div className="space-y-6 max-w-2xl">

      {/* Browser Automation */}
      <div className="bg-white rounded-xl border border-gray-200 p-5">
        <h3 className="font-semibold text-gray-900 mb-1">Browser Automation</h3>
        <p className="text-xs text-gray-500 mb-4">
          Point this at your Playwright worker URL, then paste the session JSON for each retailer.
          To capture a session, run this from the project root on your Mac:
        </p>
        <pre className="text-xs bg-gray-50 border border-gray-200 rounded-lg px-3 py-2 mb-4 overflow-x-auto">
          node scripts/capture_session.mjs wegmans
        </pre>
        <p className="text-xs text-gray-500 mb-4">
          A browser opens — log in — press Enter — paste the contents of the saved JSON file below.
        </p>
        <div className="space-y-4">
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">Worker URL</label>
            <input
              type="text"
              value={playwrightWorkerUrl}
              onChange={(e) => setPlaywrightWorkerUrl(e.target.value)}
              placeholder="http://your-vps-ip:3030"
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
            />
          </div>

          {[
            { label: "Amazon", key: "amazon", value: amazonCookies, set: setAmazonCookies, domain: "amazon.com" },
            { label: "Target", key: "target", value: targetCookies, set: setTargetCookies, domain: "target.com" },
            { label: "Wegmans", key: "wegmans", value: wegmansCookies, set: setWegmansCookies, domain: "wegmans.com" },
            { label: "Costco", key: "costco", value: costcoCookies, set: setCostcoCookies, domain: "costco.com" },
          ].map(({ label, value, set, domain }) => (
            <div key={label}>
              <label className="block text-xs font-medium text-gray-700 mb-1">
                {label} Session (JSON from capture_session.mjs)
              </label>
              <textarea
                value={value}
                onChange={(e) => set(e.target.value)}
                rows={3}
                placeholder={cookiePlaceholder(domain)}
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-xs font-mono focus:outline-none focus:ring-2 focus:ring-green-500"
              />
            </div>
          ))}

          <button
            onClick={() => save("automation", {
              playwrightWorkerUrl,
              amazonSessionCookies: amazonCookies,
              targetSessionCookies: targetCookies,
              wegmansSessionCookies: wegmansCookies,
              costcoSessionCookies: costcoCookies,
            })}
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
