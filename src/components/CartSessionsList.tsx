import { useQuery } from "convex/react";
import { api } from "../../convex/_generated/api";
import { Id } from "../../convex/_generated/dataModel";

type Props = {
  onSelect: (id: Id<"cartSessions">) => void;
  selectedId: Id<"cartSessions"> | null;
};

function statusBadge(status: string) {
  const map: Record<string, string> = {
    complete: "bg-green-100 text-green-800",
    running: "bg-yellow-100 text-yellow-800 animate-pulse",
    failed: "bg-red-100 text-red-800",
    pending: "bg-gray-100 text-gray-600",
  };
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${map[status] ?? map.pending}`}>
      {status}
    </span>
  );
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

export default function CartSessionsList({ onSelect, selectedId }: Props) {
  const sessions = useQuery(api.cartSessions.list, { limit: 20 }) ?? [];

  if (sessions.length === 0) {
    return (
      <div className="text-center py-12 text-gray-500">
        <div className="text-4xl mb-2">🛒</div>
        <p className="text-sm">No cart sessions yet.</p>
        <p className="text-xs mt-1 text-gray-400">Send a message to the Telegram bot to get started.</p>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {sessions.map((session) => (
        <button
          key={session._id}
          onClick={() => onSelect(session._id)}
          className={`w-full text-left p-3 rounded-xl border transition-all ${
            selectedId === session._id
              ? "border-green-500 ring-2 ring-green-200 bg-green-50"
              : "border-gray-200 hover:border-gray-300 bg-white hover:bg-gray-50"
          }`}
        >
          <div className="flex items-start justify-between gap-2 mb-1">
            <span className="text-xs text-gray-500">{relativeTime(session.createdAt)}</span>
            {statusBadge(session.status)}
          </div>
          <p className="text-xs font-mono text-gray-700 truncate">
            {session.rawMessage ?? "(no message)"}
          </p>
          <div className="flex items-center gap-2 mt-1.5">
            <span className="text-xs text-gray-500">
              {session.successCount}/{session.itemCount} items
            </span>
            <div className="flex gap-1">
              {session.amazonCartUrl && <span className="text-xs">📦</span>}
              {session.targetCartUrl && <span className="text-xs">🎯</span>}
              {session.instacartCartUrl && <span className="text-xs">🛒</span>}
            </div>
          </div>
        </button>
      ))}
    </div>
  );
}
