import React, { useState } from "react";
import { NavLink, useNavigate } from "react-router-dom";
import {
  LayoutGrid, Wrench, Users, Boxes, BarChart3, Settings,
  LogOut, ChevronDown, ChevronRight, MessageSquare, Factory, Receipt, Wallet,
} from "lucide-react";
import { useAuth, useHasRole, SOURCING_ROLES, ACCOUNTING_ROLES } from "../../hooks/useAuth.jsx";
import { ArcaWordmark } from "../brand/ArcaWordmark";

function Item({ to, icon: Icon, label, badge, sub, end }) {
  return (
    <NavLink
      to={to}
      end={end}
      className={({ isActive }) =>
        `w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-colors relative ${
          isActive ? "bg-stone-100 dark:bg-stone-800/10 text-stone-900 dark:text-stone-300" : "text-stone-500 dark:text-stone-400 hover:bg-stone-50 dark:hover:bg-stone-800"
        } ${sub ? "pl-11" : ""}`
      }
    >
      {({ isActive }) => (
        <>
          {isActive && !sub && <span className="absolute left-0 top-1.5 bottom-1.5 w-1 rounded-full bg-stone-900" />}
          {Icon && <Icon className="w-4 h-4 shrink-0" />}
          <span className="flex-1 text-left">{label}</span>
          {badge && (
            <span className="w-5 h-5 rounded-full bg-stone-900 text-white text-xs flex items-center justify-center font-semibold">
              {badge}
            </span>
          )}
        </>
      )}
    </NavLink>
  );
}

function Group({ icon: Icon, label, open, onToggle, children }) {
  return (
    <div>
      <button onClick={onToggle} className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium text-stone-500 dark:text-stone-400 hover:bg-stone-50 dark:hover:bg-stone-800">
        <Icon className="w-4 h-4 shrink-0" />
        <span className="flex-1 text-left">{label}</span>
        {open ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />}
      </button>
      {open && <div className="space-y-1">{children}</div>}
    </div>
  );
}

export default function Sidebar() {
  const [projectOpen, setProjectOpen] = useState(false);
  const [stockOpen, setStockOpen] = useState(false);
  const [sourcingOpen, setSourcingOpen] = useState(false);
  // บัญชีเป็นโมดูลหลักของหน้าจอนี้แล้ว จึงกางไว้ตั้งแต่เปิดแอป
  const [acctOpen, setAcctOpen] = useState(true);
  const { signOut } = useAuth();
  const canSeeSourcing = useHasRole(SOURCING_ROLES);
  const canSeeAccounting = useHasRole(ACCOUNTING_ROLES);
  const navigate = useNavigate();

  return (
    <aside className="hidden lg:flex flex-col w-64 shrink-0 bg-white dark:bg-stone-900 border-r border-stone-200 dark:border-stone-800 h-screen sticky top-0 px-4 py-5">
      {/* โลโก้เดียวกับที่พิมพ์บนใบเสนอราคา — ตราวงกลมเดิมไม่ตรงกับแคตตาล็อกบริษัท
          ไฟล์เป็น PNG พื้นโปร่งใส จึงกลับสีเองไม่ได้: โหมดมืดใช้ invert แทน */}
      <div className="px-2 mb-7">
        <ArcaWordmark className="h-6 w-auto dark:invert" />
        <div className="text-[10px] tracking-[0.2em] text-stone-400 mt-1.5">E-SERVICE</div>
      </div>

      <div className="flex-1 overflow-auto space-y-6">
        <div>
          <p className="px-3 text-xs font-semibold text-stone-400 uppercase tracking-wide mb-2">Main</p>
          <div className="space-y-1">
            <Item to="/" end icon={LayoutGrid} label="Dashboard" />

            {canSeeAccounting && (
              <>
                <Group
                  icon={Receipt}
                  label="Accounting"
                  open={acctOpen}
                  onToggle={() => setAcctOpen((v) => !v)}
                >
                  <Item to="/accounting/QT" label="Quotation" sub />
                  <Item to="/accounting/BL" label="Invoice" sub />
                  <Item to="/accounting/INV" label="Tax Invoice / Receipt" sub />
                  <Item to="/accounting/PO" label="Purchase Order" sub />
                  <Item to="/accounting/export" label="Accounting Export" sub />
                  <Item to="/accounting/settings" label="Company Settings" sub />
                </Group>
                <Item to="/cashbook" icon={Wallet} label="Cash Book" />
              </>
            )}

            <Group icon={Wrench} label="Project" open={projectOpen} onToggle={() => setProjectOpen((v) => !v)}>
              <Item to="/project" label="Install (Project)" sub />
              <Item to="/ticket" label="Ticket" sub />
              <Item to="/pm-request" label="PM Request" sub />
            </Group>

            <Item to="/contact" icon={Users} label="Contact" />

            <Group icon={Boxes} label="Stock" open={stockOpen} onToggle={() => setStockOpen((v) => !v)}>
              <Item to="/stock" label="Inventory" sub end />
              <Item to="/stock/incoming" label="On the way" sub />
              <Item to="/stock/transfer" label="Transfer" sub />
              <Item to="/stock/borrow" label="Borrow & Return" sub />
              <Item to="/stock/refund" label="Refund" sub />
              <Item to="/stock/purchase-request" label="Purchase Request" sub />
            </Group>

            {canSeeSourcing && (
              <Group
                icon={Factory}
                label="Sourcing"
                open={sourcingOpen}
                onToggle={() => setSourcingOpen((v) => !v)}
              >
                <Item to="/sourcing" label="Overview" sub end />
                <Item to="/sourcing/factories" label="Factories & Products" sub />
                <Item to="/sourcing/compare" label="Compare" sub />
                <Item to="/sourcing/reports" label="Decision Log" sub />
                <Item to="/sourcing/settings" label="Sourcing Settings" sub />
              </Group>
            )}

            <Item to="/report" icon={BarChart3} label="Report" />
            <Item to="/chat" icon={MessageSquare} label="Team Chat" />
          </div>
        </div>

        <div>
          <p className="px-3 text-xs font-semibold text-stone-400 uppercase tracking-wide mb-2">System</p>
          <div className="space-y-1">
            <Item to="/settings" icon={Settings} label="Settings" />
          </div>
        </div>

        <div>
          <p className="px-3 text-xs font-semibold text-stone-400 uppercase tracking-wide mb-2">Support</p>
          <div className="space-y-1">
            <button
              onClick={async () => {
                await signOut();
                navigate("/login", { replace: true });
              }}
              className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium text-rose-500 hover:bg-rose-50 dark:hover:bg-rose-500/10"
            >
              <LogOut className="w-4 h-4 shrink-0" /> Sign Out
            </button>
          </div>
        </div>
      </div>
    </aside>
  );
}
