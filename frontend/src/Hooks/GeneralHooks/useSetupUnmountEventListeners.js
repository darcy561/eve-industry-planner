import { useEffect } from "react";

/**
 * Custom hook that sets up beforeunload event listeners to warn users about unsaved changes.
 * 
 * This hook:
 * - Adds a beforeunload event listener to warn users when they try to leave the page
 * - Prevents accidental navigation away from unsaved work
 * - Cleans up the event listener on component unmount
 * - Uses the standard browser confirmation dialog
 * 
 * @returns {void} This hook doesn't return any value, but sets up event listeners
 * 
 * @example
 * function JobEditor() {
 *   useSetupUnmountEventListeners(); // Warns user before leaving with unsaved changes
 *   return <div>Job editing interface</div>;
 * }
 */
function useSetupUnmountEventListeners() {
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

export default useSetupUnmountEventListeners;
