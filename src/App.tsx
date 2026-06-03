import { ClerkProvider, useAuth } from "@clerk/react";
import { ConvexProvider } from "convex/react";
import { ConvexProviderWithClerk } from "convex/react-clerk";
import { BrowserRouter, Routes, Route, Navigate, useLocation } from "react-router-dom";
import { convex } from "./lib/convexClient";
import LoginPage from "./pages/LoginPage";
import DashboardPage from "./pages/DashboardPage";
import LinkTelegramPage from "./pages/LinkTelegramPage";
import CartDisplayPage from "./pages/CartDisplayPage";

const AuthenticatedRoutes = () => {
  return (
    <ClerkProvider publishableKey={import.meta.env.VITE_CLERK_PUBLISHABLE_KEY}>
      <ConvexProviderWithClerk client={convex} useAuth={useAuth}>
        <Routes>
          <Route path="/" element={<LoginPage />} />
          <Route path="/dashboard" element={<DashboardPage />} />
          <Route path="/link" element={<LinkTelegramPage />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </ConvexProviderWithClerk>
    </ClerkProvider>
  );
};

const AppRoutes = () => {
  const location = useLocation();
  if (location.pathname === "/display") {
    return (
      <ConvexProvider client={convex}>
        <Routes>
          <Route path="/display" element={<CartDisplayPage />} />
        </Routes>
      </ConvexProvider>
    );
  }
  return <AuthenticatedRoutes />;
};

const App = () => (
  <BrowserRouter>
    <AppRoutes />
  </BrowserRouter>
);

export default App;
