import { useQuery } from "convex/react";
import { api } from "../../convex/_generated/api";

function formatDate(ts: number | undefined) {
  if (!ts) return "—";
  return new Date(ts).toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

const STATUS = {
  success: { icon: "✅", label: "Added" },
  failed:  { icon: "❌", label: "Failed" },
  skipped: { icon: "⏭", label: "Skipped" },
  pending: { icon: "⏳", label: "Pending" },
} as const;

export default function ItemHistoryList() {
  const events = useQuery(api.cartSessions.listItemHistory) ?? [];

  if (events.length === 0) {
    return (
      <div className="text-center py-12 text-gray-500">
        <p>No history yet — send the bot an item to get started.</p>
      </div>
    );
  }

  return (
    <div className="divide-y divide-gray-100">
      {events.map((e) => {
        const s = STATUS[e.status] ?? STATUS.pending;
        return (
          <div key={e._id} className="flex items-center gap-3 py-3">
            <span className="text-base w-5 text-center flex-shrink-0">{s.icon}</span>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-gray-900 truncate capitalize">{e.canonicalName}</p>
              {e.detail && e.status !== "success" && (
                <p className="text-xs text-gray-400 truncate">{e.detail}</p>
              )}
            </div>
            <span className="text-xs text-gray-400 flex-shrink-0 capitalize">{e.retailer}</span>
            <span className="text-xs text-gray-400 flex-shrink-0 w-14 text-right">{formatDate(e.executedAt)}</span>
          </div>
        );
      })}
    </div>
  );
}
