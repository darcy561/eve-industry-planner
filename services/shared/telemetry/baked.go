package telemetry

// Baked at link time via go build -ldflags "-X eve-industry-planner/shared/telemetry.<Var>=..."
// in service Dockerfiles (Docker ARG), matching the frontend pattern: Sentry is set at image build,
// not from Compose/.env at runtime. Leave defaults for local go build / dev images (empty DSN → no Sentry).
var (
	BakedSentryDSN              = ""
	BakedAppMode                = "" // Vite-equivalent: "development" | "production" (import.meta.env.MODE)
	BakedRelease                = "" // import.meta.env.VITE_APP_VERSION || "development"
	BakedSentryTracesSampleRate = "" // "0.0"–"1.0"; empty → 1.0
)
