import ReactDOM from "react-dom/client";
import { init, tanstackRouterBrowserTracingIntegration } from "@sentry/react";
import { appRouter } from "./appRouter";
import { AppWrapper } from "./AppWrapper";
import {
  captureReactErrorOnce,
  EIP_IN_APP_CRASH_PROMPT_TAG,
} from "./Functions/Helper/captureReactError";
import {
  getSentryAppEnvironment,
  getSentryErrorSampleRate,
  getSentryTracesSampleRate,
  sentryBeforeSendAllowsEventInDevMode,
  sentryIsDevelopmentEnvironment,
} from "./Functions/Sentry/sentryEnvironment";

const sentryDsn = import.meta.env.SENTRY_DSN;

init({
  dsn: sentryDsn,
  enabled: Boolean(sentryDsn),
  environment: getSentryAppEnvironment(),
  release: __APP_VERSION__ || "development",
  integrations: sentryDsn
    ? [tanstackRouterBrowserTracingIntegration(appRouter)]
    : [],
  tracesSampleRate: sentryDsn ? getSentryTracesSampleRate() : 0,
  sampleRate: sentryDsn ? getSentryErrorSampleRate() : 0,
  beforeSend(event) {
    if (sentryIsDevelopmentEnvironment()) {
      if (sentryBeforeSendAllowsEventInDevMode(event)) {
        return event;
      }
      // React error boundaries / root handlers tag these so we get an event id for the in-app crash dialog.
      if (event.tags?.[EIP_IN_APP_CRASH_PROMPT_TAG] === "1") {
        return event;
      }
      return null;
    }
    return event;
  },
  ignoreErrors: [
    "Network request failed",
    "Failed to fetch",
    "NetworkError",
    "ResizeObserver loop limit exceeded",
    "Script error",
  ],
});

const root = ReactDOM.createRoot(document.getElementById("pageWrapper"), {
  onUncaughtError: (error, errorInfo) => {
    console.error("Uncaught React error", error, errorInfo);
    captureReactErrorOnce(error, {
      level: "fatal",
      tags: { react_error_type: "uncaught_root" },
      extra: { componentStack: errorInfo?.componentStack },
    });
  },
  onCaughtError: (error, errorInfo) => {
    console.error("Caught React error", error, errorInfo);
    captureReactErrorOnce(error, {
      level: "error",
      tags: { react_error_type: "caught_root" },
      extra: { componentStack: errorInfo?.componentStack },
    });
  },
});
root.render(<AppWrapper />);
