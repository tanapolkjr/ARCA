import { useEffect, useRef } from "react";

/**
 * Closes a dropdown/popup when the user clicks anywhere outside of it.
 * Needed for any custom overlay that isn't a plain <input> (which already
 * gets this for free via onBlur) — e.g. the notification bell dropdown and
 * the user profile menu, which previously stayed open until you clicked
 * the toggle button again.
 *
 * Usage:
 *   const ref = useClickOutside(() => setOpen(false));
 *   <div ref={ref}>...popup content...</div>
 */
export function useClickOutside(onOutsideClick) {
  const ref = useRef(null);

  useEffect(() => {
    function handlePointerDown(e) {
      if (ref.current && !ref.current.contains(e.target)) {
        onOutsideClick();
      }
    }
    document.addEventListener("mousedown", handlePointerDown);
    document.addEventListener("touchstart", handlePointerDown);
    return () => {
      document.removeEventListener("mousedown", handlePointerDown);
      document.removeEventListener("touchstart", handlePointerDown);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [onOutsideClick]);

  return ref;
}
