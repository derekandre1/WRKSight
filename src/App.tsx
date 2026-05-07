import { Routes, Route, Navigate } from "react-router-dom";
import { Sidebar } from "@/components/Sidebar";
import { TopBar } from "@/components/TopBar";
import { useBootstrap } from "@/hooks/useBootstrap";
import Today from "@/pages/Today";
import Week from "@/pages/Week";
import Month from "@/pages/Month";
import Projects from "@/pages/Projects";
import Accomplishments from "@/pages/Accomplishments";
import GoalsPage from "@/pages/Goals";
import Privacy from "@/pages/Privacy";
import Settings from "@/pages/Settings";
import Diagnostics from "@/pages/Diagnostics";

export default function App() {
  useBootstrap();
  return (
    <div className="flex h-full">
      <Sidebar />
      <div className="flex-1 flex flex-col min-w-0">
        <TopBar />
        <main className="flex-1 overflow-auto p-6 bg-ink-50">
          <Routes>
            <Route path="/" element={<Navigate to="/today" replace />} />
            <Route path="/today" element={<Today />} />
            <Route path="/week" element={<Week />} />
            <Route path="/month" element={<Month />} />
            <Route path="/projects" element={<Projects />} />
            <Route path="/accomplishments" element={<Accomplishments />} />
            <Route path="/goals" element={<GoalsPage />} />
            <Route path="/privacy" element={<Privacy />} />
            <Route path="/settings" element={<Settings />} />
            <Route path="/diagnostics" element={<Diagnostics />} />
          </Routes>
        </main>
      </div>
    </div>
  );
}
