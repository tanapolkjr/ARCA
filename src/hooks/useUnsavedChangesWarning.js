import { useEffect } from "react";

/**
 * Spec §2.5: "Unsaved Changes Warning — เตือนก่อนออกจากหน้าหากมีข้อมูลที่ยังไม่ได้บันทึก"
 * This was designed but never actually wired up in earlier passes — found in
 * the full spec recheck. Covers the browser-level case (closing the tab /
 * refreshing / typing a new URL). In-app navigation (clicking "ย้อนกลับ") is
 * handled separately at the call site with a plain confirm(), since React
 * Router v6 data-router navigation blocking needs a different API than a
 * plain <Routes> setup provides.
 */
export function useUnsavedChangesWarning(isDirty) {
  useEffect(() => {
    function handler(e) {
      if (!isDirty) return;
      e.preventDefault();
      e.returnValue = "";
      return "";
    }
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [isDirty]);
}
