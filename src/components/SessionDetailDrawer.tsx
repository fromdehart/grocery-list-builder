import { useQuery } from "convex/react";
import { api } from "../../convex/_generated/api";
import { Id } from "../../convex/_generated/dataModel";

type Props = {
  sessionId: Id<"cartSessions"> | null;
  onClose: () => void;
};

function statusIcon(status: string) {
  if (status === "success") return "✅";
  if (status === "skipped") return "⏭";
  return "❌";
}

function statusBadge(status: string) {
  const map: Record<string, string> = {
    complete: "bg-green-100 text-green-800",
    running: "bg-yellow-100 text-yellow-800",
    failed: "bg-red-100 text-red-800",
    pending: "bg-gray-100 text-gray-600",
  };
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${map[status] ?? map.pending}`}>
      {status}
    </span>
  );
}

export default function SessionDetailDrawer({ sessionId, onClose }: Props) {
  const data = useQuery(
    api.cartSessions.getWithEvents,
    sessionId ? { sessionId } : "skip"
  );

  if (!sessionId) return null;

  return (
    <div className="fixed inset-0 z-40 flex">
      <div className="flex-1 bg-black/30" onClick={onClose} />
      <div className="w-full max-w-[480px] bg-white shadow-2xl flex flex-col h-full overflow-hidden">
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-200">
          <h2 className="font-semibold text-gray-900">Session Details</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-xl">✕</button>
        </div>

        {!data ? (
          <div className="flex-1 flex items-center justify-center text-gray-500 text-sm">
            Loading…
          </div>
        ) : (
          <div className="flex-1 overflow-y-auto">
            <div className="px-5 py-4 border-b border-gray-100">
              <div className="flex items-center gap-2 mb-2">
                <span className="text-sm text-gray-500">
                  {new Date(data.session.createdAt).toLocaleString()}
                </span>
                {statusBadge(data.session.status)}
              </div>
              {data.session.rawMessage && (
                <p className="text-xs font-mono text-gray-600 bg-gray-50 rounded px-2 py-1">
                  {data.session.rawMessage}
                </p>
              )}
            </div>

            {(data.session.amazonCartUrl || data.session.targetCartUrl || data.session.instacartCartUrl) && (
              <div className="px-5 py-3 border-b border-gray-100">
                <p className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-2">Cart Links</p>
                <div className="flex flex-wrap gap-2">
                  {data.session.amazonCartUrl && (
                    <a
                      href={data.session.amazonCartUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1 px-3 py-1.5 bg-orange-50 text-orange-700 text-xs rounded-lg border border-orange-200 hover:bg-orange-100"
                    >
                      📦 Amazon cart
                    </a>
                  )}
                  {data.session.targetCartUrl && (
                    <a
                      href={data.session.targetCartUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1 px-3 py-1.5 bg-blue-50 text-blue-700 text-xs rounded-lg border border-blue-200 hover:bg-blue-100"
                    >
                      🎯 Target cart
                    </a>
                  )}
                  {data.session.instacartCartUrl && (
                    <a
                      href={data.session.instacartCartUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1 px-3 py-1.5 bg-green-50 text-green-700 text-xs rounded-lg border border-green-200 hover:bg-green-100"
                    >
                      🛒 Instacart
                    </a>
                  )}
                </div>
              </div>
            )}

            <div className="px-5 py-3">
              <p className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-3">Items</p>
              {data.events.length === 0 ? (
                <p className="text-sm text-gray-500">No execution events recorded.</p>
              ) : (
                <div className="space-y-2">
                  {data.events.map((event) => (
                    <div key={event._id} className="flex items-start gap-2 p-2 rounded-lg bg-gray-50">
                      <span className="text-base mt-0.5">{statusIcon(event.status)}</span>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-medium text-gray-900">{event.canonicalName}</span>
                          <span className="inline-flex items-center px-1.5 py-0.5 rounded text-xs font-medium bg-gray-200 text-gray-600">
                            {event.retailer}
                          </span>
                        </div>
                        {event.productName && (
                          <p className="text-xs text-gray-600 mt-0.5">{event.productName}</p>
                        )}
                        {event.detail && (
                          <p className="text-xs text-gray-500 mt-0.5 italic">{event.detail}</p>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}

        {data && (
          <div className="px-5 py-3 border-t border-gray-200 bg-gray-50">
            <p className="text-xs text-gray-600">
              {data.session.successCount}/{data.session.itemCount} items added successfully
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
