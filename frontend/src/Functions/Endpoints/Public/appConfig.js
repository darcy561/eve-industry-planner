import { fetchWithPublicHeaders } from "./applyPublicHeaders.js";

const DEFAULT_APP_CONFIG = {
  app_version_number: __APP_VERSION__,
  maintenance_mode: false,
  enable_upcoming_changes_page: false,
  feature_flags: {},
};

let appConfig = { ...DEFAULT_APP_CONFIG };
let inFlightRequest = null;
const subscribers = new Set();
let appConfigETag = "";
let lastFetchMeta = {
  modified: false,
  notModified: false,
  status: "idle",
};

/** Deterministic stringify so two equivalent configs compare equal regardless of key order. */
function stableStringify(value) {
  if (value === null) {
    return "null";
  }
  const t = typeof value;
  if (t === "number" || t === "boolean") {
    return String(value);
  }
  if (t === "string") {
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) {
    return `[${value.map(stableStringify).join(",")}]`;
  }
  if (t === "object") {
    const keys = Object.keys(value).sort();
    return `{${keys
      .map((k) => `${JSON.stringify(k)}:${stableStringify(value[k])}`)
      .join(",")}}`;
  }
  return "null";
}

function notifySubscribers() {
  for (const callback of subscribers) {
    callback(appConfig);
  }
}

export function getAppConfig() {
  return appConfig;
}

export function getAppVersionNumber() {
  return appConfig.app_version_number || __APP_VERSION__;
}

export function getLastAppConfigFetchMeta() {
  return lastFetchMeta;
}

export async function refreshAppConfig(force = false) {
  if (!force && inFlightRequest) {
    return inFlightRequest;
  }

  inFlightRequest = (async () => {
    try {
      const response = await fetchWithPublicHeaders(
        "/api/v1/app-config",
        {
          method: "GET",
          headers: {
            "Cache-Control": "no-cache",
            ...(appConfigETag && !force
              ? { "If-None-Match": appConfigETag }
              : {}),
          },
        },
        { requestName: "fetchAppConfig" }
      );

      const responseETag = response.headers.get("etag");
      if (responseETag) {
        appConfigETag = responseETag;
      }
      if (response.status === 304) {
        lastFetchMeta = {
          modified: false,
          notModified: true,
          status: "not_modified",
        };
        return appConfig;
      }
      if (!response.ok) {
        lastFetchMeta = {
          modified: false,
          notModified: false,
          status: "http_error",
        };
        return appConfig;
      }

      const contentType = response.headers.get("content-type") || "";
      if (!contentType.includes("application/json")) {
        lastFetchMeta = {
          modified: false,
          notModified: false,
          status: "invalid_content_type",
        };
        return appConfig;
      }

      const payload = await response.json();
      const rawFlags = payload.feature_flags;
      const featureFlags =
        rawFlags && typeof rawFlags === "object" && !Array.isArray(rawFlags)
          ? { ...rawFlags }
          : {};
      const next = {
        ...DEFAULT_APP_CONFIG,
        ...payload,
        feature_flags: featureFlags,
        ...featureFlags,
      };
      if (stableStringify(next) === stableStringify(appConfig)) {
        lastFetchMeta = {
          modified: false,
          notModified: false,
          status: "unchanged_payload",
        };
        return appConfig;
      }
      appConfig = next;
      lastFetchMeta = {
        modified: true,
        notModified: false,
        status: "updated",
      };
      notifySubscribers();
      return appConfig;
    } catch (error) {
      console.error("Failed to fetch app config", error);
      lastFetchMeta = {
        modified: false,
        notModified: false,
        status: "fetch_error",
      };
      return appConfig;
    } finally {
      inFlightRequest = null;
    }
  })();

  return inFlightRequest;
}

export function subscribeToAppConfig(callback) {
  subscribers.add(callback);
  return () => {
    subscribers.delete(callback);
  };
}

export { DEFAULT_APP_CONFIG };
