import { useEffect } from "react";

/**
 * Warn users before browser/tab unload.
 */
function useWarnBeforeUnload() {
  useEffect(() => {
    const handleBeforeUnload = (e) => {
      e.preventDefault();
      e.returnValue = "";
    };

    window.addEventListener("beforeunload", handleBeforeUnload);

    return () => {
      window.removeEventListener("beforeunload", handleBeforeUnload);
    };
  }, []);
}

export default useWarnBeforeUnload;
