import { useState } from "react";
import { useQuery, useMutation } from "convex/react";
import { api } from "../../convex/_generated/api";
import { Id, Doc } from "../../convex/_generated/dataModel";

type Retailer = "amazon" | "target" | "instacart";

function retailerBadge(r: Retailer) {
  const classes: Record<Retailer, string> = {
    instacart: "bg-green-100 text-green-800",
    amazon: "bg-orange-100 text-orange-800",
    target: "bg-blue-100 text-blue-800",
  };
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${classes[r]}`}>
      {r}
    </span>
  );
}

function confidenceBadge(score: number) {
  if (score >= 0.8) return <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-green-100 text-green-800">high</span>;
  if (score >= 0.5) return <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-yellow-100 text-yellow-800">medium</span>;
  return <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-red-100 text-red-800">low</span>;
}

function relativeTime(ts: number | undefined) {
  if (!ts) return "—";
  const diff = Date.now() - ts;
  const days = Math.floor(diff / 86400000);
  if (days === 0) return "today";
  if (days === 1) return "yesterday";
  if (days < 7) return `${days}d ago`;
  return new Date(ts).toLocaleDateString();
}

export default function HouseholdMemoryTable() {
  const items = useQuery(api.householdItems.list) ?? [];
  const updateItem = useMutation(api.householdItems.update);
  const removeItem = useMutation(api.householdItems.remove);

  const [search, setSearch] = useState("");
  const [editingId, setEditingId] = useState<Id<"householdItems"> | null>(null);
  const [editDraft, setEditDraft] = useState<Partial<Doc<"householdItems">>>({});
  const [deleteTarget, setDeleteTarget] = useState<Id<"householdItems"> | null>(null);
  const [saving, setSaving] = useState(false);

  const filtered = items.filter(
    (i) =>
      i.canonicalName.toLowerCase().includes(search.toLowerCase()) ||
      i.category.toLowerCase().includes(search.toLowerCase())
  );

  const startEdit = (item: Doc<"householdItems">) => {
    setEditingId(item._id);
    setEditDraft({
      preferredProductName: item.preferredProductName,
      amazonUrl: item.amazonUrl,
      targetUrl: item.targetUrl,
      instacartItemId: item.instacartItemId,
      preferredRetailer: item.preferredRetailer,
      notes: item.notes,
    });
  };

  const saveEdit = async () => {
    if (!editingId) return;
    setSaving(true);
    try {
      await updateItem({
        itemId: editingId,
        patch: {
          preferredProductName: editDraft.preferredProductName,
          amazonUrl: editDraft.amazonUrl,
          targetUrl: editDraft.targetUrl,
          instacartItemId: editDraft.instacartItemId,
          preferredRetailer: editDraft.preferredRetailer as Retailer | undefined,
          notes: editDraft.notes,
        },
      });
      setEditingId(null);
    } finally {
      setSaving(false);
    }
  };

  const confirmDelete = async () => {
    if (!deleteTarget) return;
    await removeItem({ itemId: deleteTarget });
    setDeleteTarget(null);
  };

  return (
    <div>
      <div className="mb-4 flex items-center gap-2">
        <div className="relative flex-1 max-w-xs">
          <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 text-sm">🔍</span>
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search items…"
            className="w-full pl-8 pr-3 py-2 text-sm rounded-lg border border-gray-300 focus:outline-none focus:ring-2 focus:ring-green-500"
          />
        </div>
        <span className="text-sm text-gray-500">{filtered.length} items</span>
      </div>

      {filtered.length === 0 ? (
        <div className="text-center py-12 text-gray-500">
          <div className="text-4xl mb-2">📝</div>
          <p>No items yet — start a conversation with the bot to build your memory.</p>
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-200 text-left text-xs font-medium text-gray-500 uppercase tracking-wide">
                <th className="pb-2 pr-3">Name</th>
                <th className="pb-2 pr-3">Category</th>
                <th className="pb-2 pr-3">Retailer</th>
                <th className="pb-2 pr-3">Product Name</th>
                <th className="pb-2 pr-3">Amazon URL</th>
                <th className="pb-2 pr-3">Target URL</th>
                <th className="pb-2 pr-3">Confidence</th>
                <th className="pb-2 pr-3">Last Added</th>
                <th className="pb-2">Actions</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((item) =>
                editingId === item._id ? (
                  <tr key={item._id} className="border-b border-gray-100 bg-green-50">
                    <td className="py-2 pr-3 font-medium">{item.canonicalName}</td>
                    <td className="py-2 pr-3 text-gray-500">{item.category}</td>
                    <td className="py-2 pr-3">
                      <select
                        value={editDraft.preferredRetailer ?? item.preferredRetailer}
                        onChange={(e) => setEditDraft((d) => ({ ...d, preferredRetailer: e.target.value as Retailer }))}
                        className="text-xs rounded border border-gray-300 px-1 py-0.5"
                      >
                        <option value="instacart">instacart</option>
                        <option value="amazon">amazon</option>
                        <option value="target">target</option>
                      </select>
                    </td>
                    <td className="py-2 pr-3">
                      <input
                        type="text"
                        value={editDraft.preferredProductName ?? ""}
                        onChange={(e) => setEditDraft((d) => ({ ...d, preferredProductName: e.target.value }))}
                        className="w-full text-xs rounded border border-gray-300 px-1 py-0.5"
                        placeholder="Product name"
                      />
                    </td>
                    <td className="py-2 pr-3">
                      <input
                        type="text"
                        value={editDraft.amazonUrl ?? ""}
                        onChange={(e) => setEditDraft((d) => ({ ...d, amazonUrl: e.target.value }))}
                        className="w-full text-xs rounded border border-gray-300 px-1 py-0.5"
                        placeholder="https://amazon.com/dp/..."
                      />
                    </td>
                    <td className="py-2 pr-3">
                      <input
                        type="text"
                        value={editDraft.targetUrl ?? ""}
                        onChange={(e) => setEditDraft((d) => ({ ...d, targetUrl: e.target.value }))}
                        className="w-full text-xs rounded border border-gray-300 px-1 py-0.5"
                        placeholder="https://target.com/p/..."
                      />
                    </td>
                    <td className="py-2 pr-3">{confidenceBadge(item.confidenceScore)}</td>
                    <td className="py-2 pr-3 text-gray-500">{relativeTime(item.lastAddedAt)}</td>
                    <td className="py-2">
                      <div className="flex gap-1">
                        <button
                          onClick={saveEdit}
                          disabled={saving}
                          className="px-2 py-1 bg-green-600 text-white text-xs rounded hover:bg-green-700 disabled:opacity-60"
                        >
                          Save
                        </button>
                        <button
                          onClick={() => setEditingId(null)}
                          className="px-2 py-1 bg-gray-100 text-gray-700 text-xs rounded hover:bg-gray-200"
                        >
                          Cancel
                        </button>
                      </div>
                    </td>
                  </tr>
                ) : (
                  <tr key={item._id} className="border-b border-gray-100 hover:bg-gray-50">
                    <td className="py-2 pr-3 font-medium text-gray-900">{item.canonicalName}</td>
                    <td className="py-2 pr-3">
                      <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-gray-100 text-gray-600">
                        {item.category}
                      </span>
                    </td>
                    <td className="py-2 pr-3">{retailerBadge(item.preferredRetailer)}</td>
                    <td className="py-2 pr-3 text-gray-600 max-w-[120px] truncate">
                      {item.preferredProductName ?? <span className="text-gray-400">—</span>}
                    </td>
                    <td className="py-2 pr-3 max-w-[100px]">
                      {item.amazonUrl ? (
                        <a href={item.amazonUrl} target="_blank" rel="noopener noreferrer" className="text-orange-600 hover:underline truncate block text-xs">
                          amazon.com…
                        </a>
                      ) : (
                        <span className="text-gray-400">—</span>
                      )}
                    </td>
                    <td className="py-2 pr-3 max-w-[100px]">
                      {item.targetUrl ? (
                        <a href={item.targetUrl} target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline truncate block text-xs">
                          target.com…
                        </a>
                      ) : (
                        <span className="text-gray-400">—</span>
                      )}
                    </td>
                    <td className="py-2 pr-3">{confidenceBadge(item.confidenceScore)}</td>
                    <td className="py-2 pr-3 text-gray-500 text-xs">{relativeTime(item.lastAddedAt)}</td>
                    <td className="py-2">
                      <div className="flex gap-1">
                        <button
                          onClick={() => startEdit(item)}
                          className="p-1 text-gray-400 hover:text-gray-600 rounded"
                          title="Edit"
                        >
                          ✏️
                        </button>
                        <button
                          onClick={() => setDeleteTarget(item._id)}
                          className="p-1 text-gray-400 hover:text-red-600 rounded"
                          title="Delete"
                        >
                          🗑️
                        </button>
                      </div>
                    </td>
                  </tr>
                )
              )}
            </tbody>
          </table>
        </div>
      )}

      {deleteTarget && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
          <div className="bg-white rounded-2xl shadow-xl p-6 max-w-sm w-full mx-4">
            <h3 className="font-semibold text-gray-900 mb-2">Remove item?</h3>
            <p className="text-sm text-gray-600 mb-4">
              This will permanently remove "{items.find((i) => i._id === deleteTarget)?.canonicalName}" from your household memory.
            </p>
            <div className="flex gap-2 justify-end">
              <button
                onClick={() => setDeleteTarget(null)}
                className="px-4 py-2 text-sm rounded-lg border border-gray-300 hover:bg-gray-50"
              >
                Cancel
              </button>
              <button
                onClick={confirmDelete}
                className="px-4 py-2 text-sm rounded-lg bg-red-600 text-white hover:bg-red-700"
              >
                Remove
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
