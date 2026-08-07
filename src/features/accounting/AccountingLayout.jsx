import React from "react";
import { Outlet } from "react-router-dom";
import RequireRole from "../../hooks/RequireRole.jsx";
import { ACCOUNTING_ROLES } from "../../hooks/useAuth.jsx";

/**
 * ทางเข้าโมดูลบัญชีและสมุดรายรับ-รายจ่าย
 * RLS ที่ฐานข้อมูล (is_accounting_user ใน 0016) เป็นตัวบังคับจริง
 * ตัวนี้แค่กันไม่ให้หน้าจอโผล่ขึ้นมาให้สับสน
 */
export default function AccountingLayout() {
  return (
    <RequireRole roles={ACCOUNTING_ROLES}>
      <Outlet />
    </RequireRole>
  );
}
