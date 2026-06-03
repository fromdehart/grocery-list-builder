import { useQuery } from "convex/react";
import { useSearchParams } from "react-router-dom";
import { api } from "../../convex/_generated/api";
import { Id } from "../../convex/_generated/dataModel";

const AISLE_EMOJI: Record<string, string> = {
  bakery: "🥖", beverage: "🥤", dairy: "🥛", deli: "🧀",
  floral: "💐", frozen: "🧊", meat: "🥩", produce: "🥦",
  seafood: "🐟", snack: "🍿", bulk: "🏪", cleaning: "🧹",
  paper: "🧻", pharmacy: "💊", baby: "🍼", international: "🌍",
  natural: "🌿", organic: "🌿", wine: "🍷", beer: "🍺",
};

function aisleEmoji(aisle: string | null | undefined) {
  if (!aisle) return "🛒";
  const lower = aisle.toLowerCase();
  for (const [key, emoji] of Object.entries(AISLE_EMOJI)) {
    if (lower.includes(key)) return emoji;
  }
  return "🛒";
}

function relativeTime(ts: number) {
  const diff = Date.now() - ts;
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return new Date(ts).toLocaleDateString();
}

export default function CartDisplayPage() {
  const [params] = useSearchParams();
  const householdId = params.get("h") as Id<"households"> | null;
  const token = params.get("t");

  const snapshot = useQuery(
    api.cartSnapshots.getForDisplay,
    householdId && token ? { householdId, retailer: "wegmans", token } : "skip"
  );

  if (!householdId || !token) {
    return (
      <div className="min-h-screen bg-gray-950 text-white flex items-center justify-center">
        <p className="text-gray-500">Invalid display URL. Generate one from the Settings page.</p>
      </div>
    );
  }

  if (snapshot === undefined) {
    return (
      <div className="min-h-screen bg-gray-950 text-white flex items-center justify-center">
        <div className="text-gray-400 text-xl animate-pulse">Loading…</div>
      </div>
    );
  }

  if (!snapshot || snapshot.items.length === 0) {
    return (
      <div className="min-h-screen bg-gray-950 text-white flex flex-col items-center justify-center gap-3">
        <div className="text-6xl">🛒</div>
        <p className="text-gray-400 text-2xl">Your Wegmans cart is empty</p>
        {snapshot && (
          <p className="text-gray-600 text-sm">Updated {relativeTime(snapshot.updatedAt)}</p>
        )}
      </div>
    );
  }

  // Group by aisle
  const byAisle = new Map<string, typeof snapshot.items>();
  for (const item of snapshot.items) {
    const key = item.aisle ?? "Other";
    if (!byAisle.has(key)) byAisle.set(key, []);
    byAisle.get(key)!.push(item);
  }

  return (
    <div className="min-h-screen bg-gray-950 text-white p-6 select-none">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-3xl font-bold">🛒 Wegmans Cart</h1>
          <p className="text-gray-500 text-sm mt-0.5">
            {snapshot.items.length} item{snapshot.items.length !== 1 ? "s" : ""} · updated {relativeTime(snapshot.updatedAt)}
          </p>
        </div>
      </div>

      {/* Items grouped by aisle */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {Array.from(byAisle.entries()).map(([aisle, items]) => (
          <div key={aisle} className="bg-gray-900 rounded-2xl p-4">
            <h2 className="text-lg font-semibold text-gray-200 mb-3">
              {aisleEmoji(aisle)} {aisle}
            </h2>
            <ul className="space-y-2">
              {items.map((item, i) => {
                const locParts = [
                  item.aisleSide,
                  item.section != null ? `Section ${item.section}` : null,
                  item.shelf != null ? `Shelf ${item.shelf}` : null,
                ].filter(Boolean);
                return (
                  <li key={i} className="flex items-start justify-between gap-2">
                    <div className="flex-1 min-w-0">
                      <p className="text-white font-medium leading-tight truncate">
                        {item.name}
                        {item.quantity > 1 && (
                          <span className="text-gray-400 font-normal"> ×{item.quantity}</span>
                        )}
                      </p>
                      {locParts.length > 0 && (
                        <p className="text-gray-500 text-xs mt-0.5">{locParts.join(" · ")}</p>
                      )}
                    </div>
                    {item.price && (
                      <span className="text-green-400 text-sm font-medium shrink-0">{item.price}</span>
                    )}
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
      </div>
    </div>
  );
}
