import { ConvexAuthProvider } from "@convex-dev/auth/react";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { convex } from "./lib/convexClient";
import { VoteATron3000 } from "./components/VoteATron3000";
import { VoteATronErrorBoundary } from "./components/VoteATronErrorBoundary";
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
        <VoteATronErrorBoundary>
          <VoteATron3000 />
        </VoteATronErrorBoundary>
      </BrowserRouter>
    </ConvexAuthProvider>
  );
};

export default App;
