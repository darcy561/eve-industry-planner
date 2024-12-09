import { useEffect } from "react";
import sendAppCheckTokenToSW from "../Service Workers/sendAppCheckToSW";

function useServiceWorker() {
  useEffect(() => {
    if (navigator.serviceWorker) {
      const messageListener = async (event) => {
        const messageData = event.data;
        if (messageData.type === "REQUEST_APP_CHECK_TOKEN") {
          await sendAppCheckTokenToSW();
        }
      };

      navigator.serviceWorker.addEventListener("message", messageListener);

      return () => {
        navigator.serviceWorker.removeEventListener("message", messageListener);
      };
    }
  }, []);
}

export default useServiceWorker;
