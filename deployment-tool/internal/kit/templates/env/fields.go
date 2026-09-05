// Package env is the Go SoT for .env: EnvFields registry, emit/load, backup, autogen.
package env

// FieldType selects validation/generate behaviour (Phase 3+) and emit shaping.
type FieldType int

const (
	FieldText FieldType = iota
	FieldPassword
	FieldHMAC
	FieldAES
)

// EnvField is one .env key and its metadata.
type EnvField struct {
	Key          string
	Section      string
	Label        string
	Help         string
	Type         FieldType
	Required     bool
	Default      string
	PreviousKeys []string // old names in existing files → migrate into Key on load
	Autogen      bool     // can generate material; TUI Autogen checkbox only while unset
	Locked       bool     // once set in .env: read-only forever (no Roll — e.g. DB passwords)
	Hidden       bool     // omit from TUI; still loaded/emitted (managed behind the scenes)
}

// EnvFields returns the ordered .env schema (sections + keys).
func EnvFields() []EnvField {
	return envFields
}

// Section names are short Title Case nouns (no slashes / parentheticals).
// Order here is emit order and TUI nav order.
var envFields = []EnvField{
	{
		Key: "APP_VERSION", Section: "Release", Label: "App version",
		Help: "GHCR image tag. Prerelease builds preset this from the binary channel; Public leaves it blank for you to set. See technical-documentation/deployment/deployment-tool/cli/release-channels.md.",
		Type: FieldText, Required: true, Default: "", // runtime: kit.DefaultAppVersion() via fieldDefault
	},

	{
		Key: "EVE_CLIENT_ID", Section: "EVE SSO", Label: "EVE Client ID",
		Help: "EVE Online SSO client ID (public; SPA + API). Required before ensure / up — set via Setup or edit .env.",
		Type: FieldText, Required: true, Default: "",
	},
	{
		Key: "EVE_CLIENT_SECRET", Section: "EVE SSO", Label: "EVE Client Secret",
		Help: "EVE Online SSO client secret (private; API). Operator-provided — not auto-generated. Required before ensure / up.",
		Type: FieldText, Required: true, Default: "",
	},
	{
		Key: "EVE_CALLBACK_URL", Section: "EVE SSO", Label: "EVE Callback URL",
		Help: "OAuth callback URL (e.g. https://your-domain.com/auth/callback). Required before ensure / up.",
		Type: FieldText, Required: true, Default: "",
	},
	{
		Key: "EVE_SCOPE", Section: "EVE SSO", Label: "EVE Scope",
		Help: "Space-separated ESI scopes.",
		Type: FieldText, Required: true,
		Default: "esi-characters.read_blueprints.v1 esi-industry.read_character_jobs.v1 esi-assets.read_assets.v1",
	},

	{
		Key: "GA4_MEASUREMENT_ID", Section: "Analytics", Label: "GA4 Measurement ID",
		Help: "Google Analytics 4 web stream Measurement ID (G-…). Omit to disable collection.",
		Type: FieldText, Required: false, Default: "",
	},

	{
		Key: "MONGO_ROOT_USERNAME", Section: "Database", Label: "Mongo root username",
		Help: "Root admin (mongo-setup / container bootstrap). Locked once set.",
		Type: FieldText, Required: true, Default: "admin", Locked: true,
	},
	{
		Key: "MONGO_ROOT_PASSWORD", Section: "Database", Label: "Mongo root password",
		Help: "Root admin password. Generated on first Setup / eip init. Locked once set.",
		Type: FieldPassword, Required: true, Default: "", Autogen: true, Locked: true,
	},
	{
		Key: "MONGO_USERNAME", Section: "Database", Label: "Mongo username",
		Help: "Shared app DB user (api / worker / core / websocket). Locked once set.",
		Type: FieldText, Required: true, Default: "EXAMPLE_USERNAME", Locked: true,
	},
	{
		Key: "MONGO_PASSWORD", Section: "Database", Label: "Mongo password",
		Help: "Shared app DB password. Locked once set (password roll is a later feature).",
		Type: FieldPassword, Required: true, Default: "", Autogen: true, Locked: true,
	},

	{
		Key: "REDIS_PASSWORD", Section: "Database", Label: "Redis password",
		Help: "Shared password. Autogen on first create; locked once set. Generated values: A–Z a–z 0–9 _ - only (no $).",
		Type: FieldPassword, Required: true, Default: "", Autogen: true, Locked: true,
	},

	{
		Key: "S3_ACCESS_KEY", Section: "Database", Label: "S3 access key",
		Help: "SeaweedFS S3 credentials for the static-data, static-data-test and observability buckets.",
		Type: FieldText, Required: true, Default: "eipobject",
	},
	{
		Key: "S3_SECRET_KEY", Section: "Database", Label: "S3 secret key",
		Help: "S3 secret. Autogen on first Setup; later use Roll on save to regenerate.",
		Type: FieldPassword, Required: true, Default: "", Autogen: true,
	},

	{
		Key: "ENTITY_ID_KEY", Section: "Encryption", Label: "Entity id key",
		Help: "Secret protecting character, corporation and alliance ids at rest. Autogen on " +
			"first create, then permanent: stored ids are encrypted under it and are the key " +
			"every document, lock and routing lane is matched on, so rolling it would orphan " +
			"them. Keep it out of database backups — it is the only thing standing between a " +
			"leaked database and readable ids.",
		Type: FieldHMAC, Required: true, Default: "", Autogen: true, Locked: true,
	},
	{
		Key: "REFRESH_TOKEN_AES_KEY", Section: "Encryption", Label: "Refresh token AES key",
		Help: "AES-256-GCM key for cloud refresh tokens at rest. " +
			"Roll on save regenerates the key, bumps REFRESH_TOKEN_AES_KEY_VERSION, " +
			"and moves the previous key into REFRESH_TOKEN_AES_LEGACY_KEYS.",
		Type: FieldAES, Required: true, Default: "", Autogen: true,
	},
	{
		Key: "REFRESH_TOKEN_AES_KEY_VERSION", Section: "Encryption", Label: "Refresh token AES version",
		Help: "Active keyring version (default v1). Not edited in the TUI — bumps automatically when the AES key is rolled.",
		Type: FieldText, Required: true, Default: "v1", Hidden: true,
	},
	{
		Key: "REFRESH_TOKEN_AES_LEGACY_KEYS", Section: "Encryption", Label: "Refresh token AES legacy keys",
		Help: "JSON object of retired key versions for decrypt. Leave {} when unused. " +
			"Filled automatically on AES Roll (previous version → legacy). " +
			`Advanced manual edit: '{"v1":"<base64-old-key>"}'. ` +
			"Each value must be standard base64 and the same decoded length as REFRESH_TOKEN_AES_KEY.",
		Type: FieldText, Required: false, Default: "{}",
	},

	{
		Key: "LOG_LEVEL", Section: "Runtime", Label: "Log level",
		Help: "Floor each Go service logs at, on stdout and OTLP alike: debug | info | warn | error.",
		Type: FieldText, Required: true, Default: "info",
	},
	{
		Key: "LOG_STDOUT", Section: "Runtime", Label: "Log stdout",
		Help: "Stdout mirror of structured logs. Unset + ENVIRONMENT=development → on.",
		Type: FieldText, Required: false, Default: "",
	},
	{
		Key: "TRACES_SAMPLE_RATE", Section: "Runtime", Label: "Trace sample rate",
		Help: "0.0–1.0 head sampling at the edge. Traefik decides and the decision propagates, so this governs the whole request path. Empty → 0 (no tracing).",
		Type: FieldText, Required: false, Default: "",
	},
	{
		Key: "ENVIRONMENT", Section: "Runtime", Label: "Environment",
		Help: "SPA bake mode, Go Sentry environment tag, default LOG_STDOUT when unset.",
		Type: FieldText, Required: false, Default: "",
	},
	{
		Key: "MAINTENANCE_MODE", Section: "Runtime", Label: "Maintenance mode",
		Help: "API maintenance mode when true-ish. Missing/empty → false.",
		Type: FieldText, Required: false, Default: "",
	},
	{
		Key: "EIP_ALLOWED_ORIGINS", Section: "Runtime", Label: "Allowed origins",
		Help: "Comma-separated browser origins allowed to open the WebSocket and call the API " +
			"(scheme + host + optional port, e.g. https://your-domain.com,http://localhost). " +
			"Required: empty refuses every browser origin. Single \"*\" allows any origin.",
		Type: FieldText, Required: true, Default: "",
	},

	{
		Key: "SENTRY_DSN", Section: "Sentry", Label: "Sentry DSN",
		Help: "Sentry DSN for Go services and SPA bake.",
		Type: FieldText, Required: false, Default: "",
	},
	{
		Key: "SENTRY_ORG", Section: "Sentry", Label: "Sentry org",
		Help: "Sentry organisation slug.",
		Type: FieldText, Required: false, Default: "",
	},
	{
		Key: "SENTRY_PROJECT_ID", Section: "Sentry", Label: "Sentry project",
		Help: "Sentry project slug.",
		Type: FieldText, Required: false, Default: "",
	},
	{
		Key: "SENTRY_AUTH_TOKEN", Section: "Sentry", Label: "Sentry auth token",
		Help: "Optional; SPA source-map upload during frontend image build.",
		Type: FieldText, Required: false, Default: "",
	},
	{
		Key: "SENTRY_TRACES_SAMPLE_RATE", Section: "Sentry", Label: "Sentry traces sample rate",
		Help: "0.0–1.0: Go performance + SPA tracesSampleRate. Empty → 0.",
		Type: FieldText, Required: false, Default: "",
	},
	{
		Key: "SENTRY_ERROR_SAMPLE_RATE", Section: "Sentry", Label: "Sentry error sample rate",
		Help: "0.0–1.0: SPA error sampleRate only. Empty → 1.",
		Type: FieldText, Required: false, Default: "",
	},

	{
		Key: "FEEDBACK_DISCORD_WEBHOOK_URL", Section: "Integrations", Label: "Discord webhook",
		Help: "Discord webhook for feedback API. Unset → API succeeds but skips Discord.",
		Type: FieldText, Required: false, Default: "",
	},

	{
		Key: "GRAFANA_ADMIN_USER", Section: "Grafana", Label: "Grafana admin user",
		Help: "Grafana login username.",
		Type: FieldText, Required: true, Default: "admin",
	},
	{
		Key: "GRAFANA_ADMIN_PASSWORD", Section: "Grafana", Label: "Grafana admin password",
		Help: "Grafana login password. Generated on first Setup / eip init. Locked once set.",
		Type: FieldPassword, Required: true, Default: "", Autogen: true, Locked: true,
	},

	{
		Key: "OBS_ADMIN_USER", Section: "Observability", Label: "Observability admin user",
		Help: "Telemetry backend login. Must be an email address — the backend rejects anything else.",
		Type: FieldText, Required: true, Default: "admin@eve-industry-planner.local", Locked: true,
	},
	{
		Key: "OBS_ADMIN_PASSWORD", Section: "Observability", Label: "Observability admin password",
		Help: "Telemetry backend login password. Generated on first Setup / eip init. Locked once set.",
		Type: FieldPassword, Required: true, Default: "", Autogen: true, Locked: true,
	},
}

// knownEnvKeySet returns current keys and PreviousKeys (consumed on migrate, not preserved).
func knownEnvKeySet() map[string]struct{} {
	fields := EnvFields()
	out := make(map[string]struct{}, len(fields)*2)
	for _, f := range fields {
		out[f.Key] = struct{}{}
		for _, prev := range f.PreviousKeys {
			if prev != "" {
				out[prev] = struct{}{}
			}
		}
	}
	return out
}
