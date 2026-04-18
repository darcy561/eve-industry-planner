import { getRuntimeEnv } from "../utils/runtime-config.js";
import { onCLS, onFCP, onINP, onLCP, onTTFB } from "web-vitals";

const scriptReadyKey = "__eipGtagGa4Script";

/**
 * GA4 Measurement ID (`G-…`) from `GA4_MEASUREMENT_ID` (optional). Empty → GA4 is disabled.
 * @returns {string}
 */
function measurementId() {
  const raw = (getRuntimeEnv("GA4_MEASUREMENT_ID") || "").trim();
  if (!raw || (raw.startsWith("__") && raw.endsWith("__"))) {
    return "";
  }
  return raw.startsWith("G-") ? raw : "";
}

let installPromise = null;

function ensureGtagScript(id) {
  if (typeof window === "undefined") {
    return Promise.resolve(false);
  }
  window.dataLayer = window.dataLayer || [];
  window.gtag =
    window.gtag ||
    function gtag() {
      window.dataLayer.push(arguments);
    };

  if (window[scriptReadyKey]) {
    return Promise.resolve(true);
  }
  if (installPromise) {
    return installPromise;
  }

  installPromise = new Promise((resolve) => {
    const s = document.createElement("script");
    s.async = true;
    s.src = `https://www.googletagmanager.com/gtag/js?id=${encodeURIComponent(id)}`;
    s.onload = () => {
      window.gtag("js", new Date());
      window[scriptReadyKey] = true;
      resolve(true);
    };
    s.onerror = () => resolve(false);
    document.head.appendChild(s);
  });
  return installPromise;
}

/**
 * Sends GA4 a page view for the current route using `gtag('config', …)` (SPA pattern).
 * Product actions use OTel (`trackAppEvent`); GA custom events are reserved for Web Vitals only.
 *
 * @param {{ pathname: string, searchStr?: string, href: string }} loc - TanStack `ParsedLocation`-like
 */
export function reportGa4RouteChange(loc) {
  const id = measurementId();
  if (!id || !loc?.pathname) {
    return;
  }

  const pagePath = `${loc.pathname}${loc.searchStr ?? ""}`;
  const pageLocation =
    typeof window !== "undefined"
      ? `${window.location.origin}${loc.href || pagePath}`
      : undefined;

  void ensureGtagScript(id).then((ok) => {
    if (!ok || typeof window.gtag !== "function") {
      return;
    }
    window.gtag("config", id, {
      page_path: pagePath,
      ...(pageLocation ? { page_location: pageLocation } : {}),
    });
  });
}

/**
 * Hooks GA4 page views to TanStack Router navigations (`onResolved`).
 *
 * @param {import("@tanstack/react-router").Router<any, any>} router
 * @returns {() => void} unsubscribe
 */
export function subscribeGa4ToTanStackRouter(router) {
  if (!measurementId()) {
    return () => {};
  }
  return router.subscribe("onResolved", (e) => {
    reportGa4RouteChange(e.toLocation);
  });
}

/**
 * Converts a Web Vitals metric into the GA4-recommended event payload.
 * `value` is an integer for GA aggregation; CLS is scaled by 1000.
 *
 * @param {{ name: string, id: string, value: number, delta: number, rating?: string, navigationType?: string }} metric
 */
function reportGa4WebVital(metric) {
  const id = measurementId();
  if (!id || typeof window === "undefined" || typeof window.gtag !== "function") {
    return;
  }
  const value = Math.round(metric.name === "CLS" ? metric.value * 1000 : metric.value);
  window.gtag("event", "web_vital", {
    event_category: "Web Vitals",
    event_label: metric.id,
    value,
    metric_name: metric.name,
    metric_id: metric.id,
    metric_value: metric.value,
    metric_delta: metric.delta,
    metric_rating: metric.rating,
    navigation_type: metric.navigationType,
    non_interaction: true,
  });
}

/**
 * Starts GA4 Web Vitals capture (CLS/FCP/INP/LCP/TTFB).
 * Safe to call once after app mount.
 */
export function enableGa4WebVitals() {
  if (!measurementId()) {
    return;
  }
  void ensureGtagScript(measurementId()).then((ok) => {
    if (!ok) {
      return;
    }
    onCLS(reportGa4WebVital);
    onFCP(reportGa4WebVital);
    onINP(reportGa4WebVital);
    onLCP(reportGa4WebVital);
    onTTFB(reportGa4WebVital);
  });
}
