import { useState } from "react";
import { useMutation } from "convex/react";
import { api } from "../../convex/_generated/api";

export default function CreateHouseholdForm() {
  const [name, setName] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const create = useMutation(api.households.create);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;
    setLoading(true);
    setError(null);
    try {
      await create({ name: name.trim() });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create household");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 px-4">
      <div className="w-full max-w-sm bg-white rounded-2xl shadow-lg p-8 text-center">
        <div className="text-5xl mb-4">🏠</div>
        <h2 className="text-2xl font-bold text-gray-900 mb-2">Create your household</h2>
        <p className="text-sm text-gray-500 mb-6">
          Set up a household to start building grocery carts.
        </p>

        <form onSubmit={handleSubmit} className="space-y-4">
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            required
            placeholder="Our Home"
            className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-transparent"
          />

          {error && (
            <p className="text-sm text-red-600 bg-red-50 rounded-lg px-3 py-2 text-left">{error}</p>
          )}

          <button
            type="submit"
            disabled={loading || !name.trim()}
            className="w-full py-2.5 px-4 bg-green-600 text-white font-semibold rounded-lg hover:bg-green-700 disabled:opacity-60 transition-colors text-sm"
          >
            {loading ? "Creating…" : "Create Household"}
          </button>
        </form>
      </div>
    </div>
  );
}
