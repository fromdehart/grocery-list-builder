import { useState, useEffect } from "react";
import { useQuery, useMutation } from "convex/react";
import { api } from "../../convex/_generated/api";

export default function HouseholdSettings() {
  const data = useQuery(api.households.getMyHousehold);
  const updateSettings = useMutation(api.households.updateSettings);
  const bindTelegram = useMutation(api.linkTokens.bindTelegramDirect);
  const getOrCreateDisplayToken = useMutation(api.households.getOrCreateDisplayToken);

  const [playwrightWorkerUrl, setPlaywrightWorkerUrl] = useState("");
  const [amazonCookies, setAmazonCookies] = useState("");
  const [targetCookies, setTargetCookies] = useState("");
  const [wegmansCookies, setWegmansCookies] = useState("");
  const [costcoCookies, setCostcoCookies] = useState("");
  const [myTelegramId, setMyTelegramId] = useState("");
  const [allowlist, setAllowlist] = useState<string[]>([]);
  const [newAllowId, setNewAllowId] = useState("");
  const [saving, setSaving] = useState<string | null>(null);
  const [saved, setSaved] = useState<string | null>(null);

  useEffect(() => {
    if (data?.household) {
      setPlaywrightWorkerUrl(data.household.playwrightWorkerUrl ?? "");
      setAmazonCookies(data.household.amazonSessionCookies ?? "");
      setTargetCookies(data.household.targetSessionCookies ?? "");
      setWegmansCookies(data.household.wegmansSessionCookies ?? "");
      setCostcoCookies(data.household.costcoSessionCookies ?? "");
      setAllowlist(data.household.telegramAllowlist ?? []);
      setMyTelegramId(data.member.telegramUserId ?? "");
    }
  }, [data?.household?._id]);

  const save = async (section: string, patch: Record<string, unknown>) => {
    setSaving(section);
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await updateSettings(patch as any);
      setSaved(section);
      setTimeout(() => setSaved(null), 2000);
    } finally {
      setSaving(null);
    }
  };

  const cookiePlaceholder = (_domain: string) =>
    `{"cookies":[...],"origins":[{"origin":"https://...","localStorage":[...]}]}`;

  const botUsername = import.meta.env.VITE_TELEGRAM_BOT_USERNAME ?? "YourGroceryBot";

  const [displayToken, setDisplayToken] = useState<string | null>(null);
  const [loadingToken, setLoadingToken] = useState(false);

  const displayUrl = data?.householdId && displayToken
    ? `${window.location.origin}/display?h=${data.householdId}&t=${displayToken}`
    : null;

  return (
    <div className="space-y-6 max-w-2xl">

      {/* Cart Display */}
      <div className="bg-white rounded-xl border border-gray-200 p-5">
        <h3 className="font-semibold text-gray-900 mb-1">Cart Display</h3>
        <p className="text-xs text-gray-500 mb-3">
          Open this URL on your Raspberry Pi or add it as an iframe card in Home Assistant.
          The URL contains a secret token — anyone with it can view your cart.
        </p>
        {displayUrl ? (
          <div className="flex items-center gap-2">
            <input
              readOnly
              value={displayUrl}
              className="flex-1 rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-xs font-mono text-gray-700 select-all"
            />
            <button
              onClick={() => navigator.clipboard.writeText(displayUrl)}
              className="px-3 py-2 text-xs rounded-lg border border-gray-300 hover:bg-gray-50 shrink-0"
            >
              Copy
            </button>
            <a
              href={displayUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="px-3 py-2 text-xs rounded-lg bg-green-600 text-white hover:bg-green-700 shrink-0"
            >
              Open
            </a>
          </div>
        ) : (
          <button
            onClick={async () => {
              setLoadingToken(true);
              try {
                const token = await getOrCreateDisplayToken({});
                setDisplayToken(token);
              } finally {
                setLoadingToken(false);
              }
            }}
            disabled={loadingToken || !data}
            className="px-4 py-2 text-sm rounded-lg bg-green-600 text-white hover:bg-green-700 disabled:opacity-60"
          >
            {loadingToken ? "Generating…" : "Generate Display URL"}
          </button>
        )}
      </div>

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
        <p className="text-xs text-gray-500 mb-4">
          Paste your Telegram user ID to connect your account. Find it by messaging{" "}
          <span className="font-mono bg-gray-100 px-1 rounded">@userinfobot</span> on Telegram.
        </p>
        <div className="flex gap-2">
          <input
            type="text"
            value={myTelegramId}
            onChange={(e) => setMyTelegramId(e.target.value.trim())}
            placeholder="Your Telegram user ID (e.g. 123456789)"
            className="flex-1 rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
          />
          <button
            onClick={async () => {
              setSaving("telegram");
              try {
                await bindTelegram({ telegramUserId: myTelegramId });
                setSaved("telegram");
                setTimeout(() => setSaved(null), 2000);
              } finally {
                setSaving(null);
              }
            }}
            disabled={saving === "telegram"}
            className="px-4 py-2 bg-green-600 text-white text-sm font-medium rounded-lg hover:bg-green-700 disabled:opacity-60"
          >
            {saving === "telegram" ? "Saving…" : saved === "telegram" ? "Saved ✓" : "Save"}
          </button>
          {myTelegramId && (
            <button
              onClick={async () => {
                await bindTelegram({ telegramUserId: "" });
                setMyTelegramId("");
              }}
              className="px-3 py-2 text-xs text-red-500 border border-red-200 rounded-lg hover:bg-red-50"
            >
              Clear
            </button>
          )}
        </div>
      </div>

      {/* Telegram Allowlist */}
      <div className="bg-white rounded-xl border border-gray-200 p-5">
        <h3 className="font-semibold text-gray-900 mb-1">Telegram Allowlist</h3>
        <p className="text-xs text-gray-500 mb-4">
          When the allowlist is <span className="font-medium text-gray-700">enabled</span>, the bot only responds to listed Telegram user IDs — an empty list blocks everyone.
          When <span className="font-medium text-gray-700">disabled</span>, no restriction is applied.
          Find your ID by messaging <span className="font-mono bg-gray-100 px-1 rounded">@userinfobot</span> on Telegram.
        </p>

        {data?.household?.telegramAllowlist === null || data?.household?.telegramAllowlist === undefined ? (
          <div className="mb-4 flex items-center gap-3">
            <span className="text-xs text-gray-500 italic">Allowlist disabled — no restriction.</span>
            <button
              onClick={() => { setAllowlist([]); save("allowlist", { telegramAllowlist: [] }); }}
              className="px-3 py-1.5 text-xs bg-yellow-50 text-yellow-700 border border-yellow-200 rounded-lg hover:bg-yellow-100"
            >
              Enable allowlist
            </button>
          </div>
        ) : (
          <button
            onClick={() => save("allowlist", { telegramAllowlist: null })}
            className="mb-4 px-3 py-1.5 text-xs text-gray-500 border border-gray-200 rounded-lg hover:bg-gray-50"
          >
            Disable allowlist
          </button>
        )}

        <div className="space-y-2 mb-3">
          {allowlist.length === 0 && data?.household?.telegramAllowlist !== undefined && data?.household?.telegramAllowlist !== null && (
            <p className="text-xs text-amber-600 italic">No IDs added — bot is currently blocking everyone.</p>
          )}
          {allowlist.map((id) => (
            <div key={id} className="flex items-center justify-between bg-gray-50 rounded-lg px-3 py-2">
              <span className="text-sm font-mono text-gray-800">{id}</span>
              <button
                onClick={() => setAllowlist((prev) => prev.filter((x) => x !== id))}
                className="text-xs text-red-500 hover:text-red-700"
              >
                Remove
              </button>
            </div>
          ))}
        </div>

        <div className="flex gap-2 mb-4">
          <input
            type="text"
            value={newAllowId}
            onChange={(e) => setNewAllowId(e.target.value.trim())}
            onKeyDown={(e) => {
              if (e.key === "Enter" && newAllowId && !allowlist.includes(newAllowId)) {
                setAllowlist((prev) => [...prev, newAllowId]);
                setNewAllowId("");
              }
            }}
            placeholder="Telegram user ID (e.g. 123456789)"
            className="flex-1 rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
          />
          <button
            onClick={() => {
              if (newAllowId && !allowlist.includes(newAllowId)) {
                setAllowlist((prev) => [...prev, newAllowId]);
                setNewAllowId("");
              }
            }}
            className="px-3 py-2 bg-gray-100 text-gray-700 text-sm rounded-lg hover:bg-gray-200"
          >
            Add
          </button>
        </div>

        <button
          onClick={() => save("allowlist", { telegramAllowlist: allowlist })}
          disabled={saving === "allowlist"}
          className="px-4 py-2 bg-green-600 text-white text-sm font-medium rounded-lg hover:bg-green-700 disabled:opacity-60"
        >
          {saving === "allowlist" ? "Saving…" : saved === "allowlist" ? "Saved ✓" : "Save Allowlist"}
        </button>
      </div>
    </div>
  );
}
