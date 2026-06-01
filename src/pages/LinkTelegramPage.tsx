import { useEffect, useState } from "react";
import { useSearchParams, Link } from "react-router-dom";
import { useConvexAuth } from "convex/react";
import { useMutation } from "convex/react";
import { api } from "../../convex/_generated/api";
import LoginPage from "./LoginPage";

type Status = "idle" | "linking" | "success" | "error";

export default function LinkTelegramPage() {
  const [searchParams] = useSearchParams();
  const tgid = searchParams.get("tgid");
  const token = searchParams.get("token");
  const { isAuthenticated, isLoading } = useConvexAuth();
  const bindTelegramDirect = useMutation(api.linkTokens.bindTelegramDirect);
  const consume = useMutation(api.linkTokens.consume);

  const [status, setStatus] = useState<Status>("idle");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!isAuthenticated || isLoading || status !== "idle") return;

    if (tgid) {
      setStatus("linking");
      bindTelegramDirect({ telegramUserId: tgid })
        .then((result) => {
          if (result.success) {
            setStatus("success");
          } else {
            setStatus("error");
            setError("Failed to link — make sure you have a household set up.");
          }
        })
        .catch((err) => {
          setStatus("error");
          setError(err instanceof Error ? err.message : "Linking failed");
        });
    } else if (token) {
      setStatus("linking");
      consume({ token, telegramUserId: "" })
        .then((result) => {
          if (result.success) {
            setStatus("success");
          } else {
            setStatus("error");
            setError(result.error ?? "Token invalid or expired.");
          }
        })
        .catch((err) => {
          setStatus("error");
          setError(err instanceof Error ? err.message : "Linking failed");
        });
    }
  }, [isAuthenticated, isLoading, tgid, token, status]);

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-gray-500 text-sm">Loading…</div>
      </div>
    );
  }

  if (!isAuthenticated) {
    return (
      <div>
        <div className="bg-green-50 border-b border-green-200 px-4 py-3 text-center">
          <p className="text-sm text-green-800 font-medium">
            Sign in to link your Telegram account
          </p>
        </div>
        <LoginPage />
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 px-4">
      <div className="w-full max-w-sm bg-white rounded-2xl shadow-lg p-8 text-center">
        {status === "idle" && (
          <>
            <div className="text-4xl mb-4">🔗</div>
            <h2 className="text-xl font-bold text-gray-900 mb-2">Link Telegram</h2>
            <p className="text-sm text-gray-500">
              {tgid || token ? "Preparing to link your account…" : "No link parameters provided."}
            </p>
          </>
        )}

        {status === "linking" && (
          <>
            <div className="text-4xl mb-4 animate-spin">⏳</div>
            <h2 className="text-xl font-bold text-gray-900 mb-2">Linking…</h2>
            <p className="text-sm text-gray-500">Connecting your Telegram account.</p>
          </>
        )}

        {status === "success" && (
          <>
            <div className="text-5xl mb-4">✅</div>
            <h2 className="text-xl font-bold text-gray-900 mb-2">Account linked!</h2>
            <p className="text-sm text-gray-600 mb-6">
              Your Telegram account is now linked. You can send messages to the bot to build grocery carts.
            </p>
            <Link
              to="/dashboard"
              className="inline-block px-5 py-2.5 bg-green-600 text-white text-sm font-medium rounded-lg hover:bg-green-700"
            >
              Go to Dashboard
            </Link>
          </>
        )}

        {status === "error" && (
          <>
            <div className="text-5xl mb-4">❌</div>
            <h2 className="text-xl font-bold text-gray-900 mb-2">Linking failed</h2>
            <p className="text-sm text-red-600 mb-6">{error}</p>
            <Link
              to="/dashboard"
              className="inline-block px-5 py-2.5 bg-gray-600 text-white text-sm font-medium rounded-lg hover:bg-gray-700"
            >
              Go to Dashboard
            </Link>
          </>
        )}
      </div>
    </div>
  );
}
