import React from "react";
import { Outlet } from "react-router-dom";
import Sidebar from "./Sidebar.jsx";
import TopBar from "./TopBar.jsx";

export default function AppShell() {
  return (
    <div className="flex min-h-screen bg-white dark:bg-[#0a0a0a] font-sans text-slate-800 dark:text-slate-100">
      <Sidebar />
      <div className="flex-1 min-w-0 flex flex-col">
        <TopBar />
        <div className="max-w-7xl w-full mx-auto px-6 py-6">
          <Outlet />
        </div>
      </div>
    </div>
  );
}
