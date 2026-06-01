import { ConvexAuthProvider } from "@convex-dev/auth/react";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { convex } from "./lib/convexClient";
import Index from "./pages/Index";
import DashboardPage from "./pages/DashboardPage";
import LinkTelegramPage from "./pages/LinkTelegramPage";

const App = () => {
  return (
    <ConvexAuthProvider client={convex}>
      <BrowserRouter>
        <Routes>
          <Route path="/" element={<Index />} />
          <Route path="/dashboard" element={<DashboardPage />} />
          <Route path="/link" element={<LinkTelegramPage />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </BrowserRouter>
    </ConvexAuthProvider>
  );
};

export default App;
