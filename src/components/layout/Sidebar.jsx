import React, { useState } from "react";
import { NavLink, useNavigate } from "react-router-dom";
import {
  Home, LayoutGrid, Wrench, Users, Boxes, BarChart3, Settings,
  LogOut, ChevronDown, ChevronRight, MessageSquare, Factory, Receipt, Wallet,
} from "lucide-react";
import { useAuth, useHasRole, SOURCING_ROLES, ACCOUNTING_ROLES } from "../../hooks/useAuth.jsx";

function Item({ to, icon: Icon, label, badge, sub, end }) {
  return (
    <NavLink
      to={to}
      end={end}
      className={({ isActive }) =>
        `w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-colors relative ${
          isActive ? "bg-indigo-50 dark:bg-indigo-500/10 text-indigo-600 dark:text-indigo-400" : "text-slate-500 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-800"
        } ${sub ? "pl-11" : ""}`
      }
    >
      {({ isActive }) => (
        <>
          {isActive && !sub && <span className="absolute left-0 top-1.5 bottom-1.5 w-1 rounded-full bg-indigo-600" />}
          {Icon && <Icon className="w-4 h-4 shrink-0" />}
          <span className="flex-1 text-left">{label}</span>
          {badge && (
            <span className="w-5 h-5 rounded-full bg-indigo-600 text-white text-xs flex items-center justify-center font-semibold">
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
      <button onClick={onToggle} className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium text-slate-500 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-800">
        <Icon className="w-4 h-4 shrink-0" />
        <span className="flex-1 text-left">{label}</span>
        {open ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />}
      </button>
      {open && <div className="space-y-1">{children}</div>}
    </div>
  );
}

export default function Sidebar() {
  const [projectOpen, setProjectOpen] = useState(true);
  const [stockOpen, setStockOpen] = useState(false);
  const [sourcingOpen, setSourcingOpen] = useState(false);
  const [acctOpen, setAcctOpen] = useState(false);
  const { signOut } = useAuth();
  const canSeeSourcing = useHasRole(SOURCING_ROLES);
  const canSeeAccounting = useHasRole(ACCOUNTING_ROLES);
  const navigate = useNavigate();

  return (
    <aside className="hidden lg:flex flex-col w-64 shrink-0 bg-white dark:bg-slate-900 border-r border-slate-200 dark:border-slate-800 h-screen sticky top-0 px-4 py-5">
      <div className="flex items-center gap-2.5 px-2 mb-7">
        <div className="w-9 h-9 rounded-xl bg-indigo-600 flex items-center justify-center">
          <Home className="w-4 h-4 text-white" />
        </div>
        <span className="brand-wordmark text-slate-900 dark:text-slate-100 text-xl">ARCA</span>
      </div>

      <div className="flex-1 overflow-auto space-y-6">
        <div>
          <p className="px-3 text-xs font-semibold text-slate-400 uppercase tracking-wide mb-2">เมนูหลัก</p>
          <div className="space-y-1">
            <Item to="/" end icon={LayoutGrid} label="Dashboard" />

            <Group icon={Wrench} label="Project" open={projectOpen} onToggle={() => setProjectOpen((v) => !v)}>
              <Item to="/project" label="Install (Project)" sub />
              <Item to="/ticket" label="Ticket" sub />
              <Item to="/pm-request" label="PM Request" sub />
            </Group>

            <Item to="/contact" icon={Users} label="Contact" />

            <Group icon={Boxes} label="Stock" open={stockOpen} onToggle={() => setStockOpen((v) => !v)}>
              <Item to="/stock" label="Inventory" sub end />
              <Item to="/stock/transfer" label="ย้ายคลังสินค้า" sub />
              <Item to="/stock/borrow" label="ยืมคืนสินค้า" sub />
              <Item to="/stock/refund" label="Refund" sub />
              <Item to="/stock/purchase-request" label="ใบขอซื้อ" sub />
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

            {canSeeAccounting && (
              <>
                <Group
                  icon={Receipt}
                  label="บัญชี"
                  open={acctOpen}
                  onToggle={() => setAcctOpen((v) => !v)}
                >
                  <Item to="/accounting/QT" label="ใบเสนอราคา" sub />
                  <Item to="/accounting/BL" label="ใบแจ้งหนี้" sub />
                  <Item to="/accounting/INV" label="ใบกำกับภาษี/ใบเสร็จ" sub />
                  <Item to="/accounting/PO" label="ใบสั่งซื้อ" sub />
                  <Item to="/accounting/export" label="ส่งออกให้บัญชี" sub />
                  <Item to="/accounting/settings" label="ตั้งค่าบริษัท" sub />
                </Group>
                <Item to="/cashbook" icon={Wallet} label="รายรับ-รายจ่าย" />
              </>
            )}

            <Item to="/report" icon={BarChart3} label="Report" />
            <Item to="/chat" icon={MessageSquare} label="แชททีม" />
          </div>
        </div>

        <div>
          <p className="px-3 text-xs font-semibold text-slate-400 uppercase tracking-wide mb-2">ระบบ</p>
          <div className="space-y-1">
            <Item to="/settings" icon={Settings} label="การตั้งค่า" />
          </div>
        </div>

        <div>
          <p className="px-3 text-xs font-semibold text-slate-400 uppercase tracking-wide mb-2">Support</p>
          <div className="space-y-1">
            <button
              onClick={async () => {
                await signOut();
                navigate("/login", { replace: true });
              }}
              className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium text-rose-500 hover:bg-rose-50 dark:hover:bg-rose-500/10"
            >
              <LogOut className="w-4 h-4 shrink-0" /> ออกจากระบบ
            </button>
          </div>
        </div>
      </div>
    </aside>
  );
}
