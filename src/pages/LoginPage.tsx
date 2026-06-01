import { SignIn, useAuth } from "@clerk/react";
import { Navigate } from "react-router-dom";

export default function LoginPage() {
  const { isSignedIn, isLoaded } = useAuth();

  if (!isLoaded) return null;
  if (isSignedIn) return <Navigate to="/dashboard" replace />;

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 px-4">
      <SignIn forceRedirectUrl="/dashboard" />
    </div>
  );
}
