import sendAppCheckTokenToSW from "./sendAppCheckToSW";

async function activateServiceWorker() {
  if ("serviceWorker" in navigator) {
    try {
      await navigator.serviceWorker.register("/sw.js", { scope: "/" });
      sendAppCheckTokenToSW();
    } catch (error) {
      console.error("Service Worker registration failed:", error);
    }
  }
}

export default activateServiceWorker;
