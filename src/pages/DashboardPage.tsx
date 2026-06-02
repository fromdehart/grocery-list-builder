import { useState } from "react";
import { useConvexAuth } from "convex/react";
import { useAuth, useClerk } from "@clerk/react";
import { useQuery } from "convex/react";
import { Navigate } from "react-router-dom";
import { api } from "../../convex/_generated/api";
import CreateHouseholdForm from "../components/CreateHouseholdForm";
import HouseholdMemoryTable from "../components/HouseholdMemoryTable";
import ItemHistoryList from "../components/ItemHistoryList";
import HouseholdSettings from "../components/HouseholdSettings";

type Tab = "memory" | "history" | "settings";

export default function DashboardPage() {
  const { isAuthenticated, isLoading } = useConvexAuth();
  const { isSignedIn } = useAuth();
  const { signOut } = useClerk();
  const householdData = useQuery(
    api.households.getMyHousehold,
    isAuthenticated ? {} : "skip"
  );
  const [activeTab, setActiveTab] = useState<Tab>("memory");

  if (isLoading || (isSignedIn && !isAuthenticated)) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-gray-500 text-sm">Loading…</div>
      </div>
    );
  }

  if (!isAuthenticated) {
    return <Navigate to="/" replace />;
  }

  if (householdData === undefined) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-gray-500 text-sm">Loading…</div>
      </div>
    );
  }

  if (householdData === null) {
    return <CreateHouseholdForm />;
  }

  const tabs: { id: Tab; label: string }[] = [
    { id: "memory", label: "Memory" },
    { id: "history", label: "History" },
    { id: "settings", label: "Settings" },
  ];

  return (
    <div className="min-h-screen bg-gray-50">
      <nav className="bg-white border-b border-gray-200 px-4 py-3">
        <div className="max-w-6xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-3">
            <span className="text-xl">🛒</span>
            <div>
              <h1 className="font-bold text-gray-900 text-sm">Cart Gremlin</h1>
              <p className="text-xs text-gray-500">{householdData.household.name}</p>
            </div>
          </div>
          <button
            onClick={() => signOut()}
            className="text-sm text-gray-600 hover:text-gray-900 px-3 py-1.5 rounded-lg hover:bg-gray-100"
          >
            Sign out
          </button>
        </div>
      </nav>

      <div className="max-w-6xl mx-auto px-4 py-6">
        <div className="flex gap-1 mb-6 border-b border-gray-200">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`px-4 py-2 text-sm font-medium rounded-t-lg transition-colors ${
                activeTab === tab.id
                  ? "text-green-700 border-b-2 border-green-600 -mb-px"
                  : "text-gray-600 hover:text-gray-900"
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {activeTab === "memory" && (
          <div className="bg-white rounded-xl border border-gray-200 p-5">
            <h2 className="font-semibold text-gray-900 mb-4">Household Item Memory</h2>
            <HouseholdMemoryTable />
          </div>
        )}

        {activeTab === "history" && (
          <div className="bg-white rounded-xl border border-gray-200 p-5">
            <h2 className="font-semibold text-gray-900 mb-4">Item History</h2>
            <ItemHistoryList />
          </div>
        )}

        {activeTab === "settings" && (
          <div>
            <h2 className="font-semibold text-gray-900 mb-4">Settings</h2>
            <HouseholdSettings />
          </div>
        )}
      </div>

    </div>
  );
}
