import { SignIn } from "@clerk/react";

export default function LoginPage() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 px-4">
      <SignIn afterSignInUrl="/dashboard" afterSignUpUrl="/dashboard" />
    </div>
  );
}
