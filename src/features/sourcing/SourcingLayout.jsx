import React from "react";
import { Outlet } from "react-router-dom";
import RequireRole from "../../hooks/RequireRole.jsx";
import { SOURCING_ROLES } from "../../hooks/useAuth.jsx";

/**
 * Wrapper for every /sourcing route.
 *
 * Two jobs:
 *  1. Role gate — the module shows landed cost, margin and ROI on nearly every
 *     screen, so it is limited to Super Admin / Manager rather than hiding
 *     individual figures. RLS enforces the same list server-side
 *     (supabase/migrations/0014_sourcing_module.sql).
 *  2. Style scope — `.sourcing-root` is what confines the module's design
 *     tokens (Inter, focus rings, placeholder colour) to these screens.
 */
export default function SourcingLayout() {
  return (
    <RequireRole roles={SOURCING_ROLES}>
      <div className="sourcing-root text-ink-1 text-[14px] leading-normal antialiased">
        <Outlet />
      </div>
    </RequireRole>
  );
}
