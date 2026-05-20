package apimetrics

import (
	"context"
	"sync"
	"time"

	"eve-industry-planner/shared/logs"

	"go.opentelemetry.io/otel"
	"go.opentelemetry.io/otel/metric"
)

var apiMeter = sync.OnceValue(func() metric.Meter {
	return otel.Meter("eve-industry-planner/api")
})

// APISystemIndexesMetrics holds OpenTelemetry metrics for the system indexes API.
type APISystemIndexesMetrics struct {
	Requests                *floatHist
	RequestsCount           *intCounter
	SystemsRequested        *floatHist
	SystemIDsRequestedTotal *intCounter // sum of system ID counts per successful POST (for avg batch size in Prometheus)
	Errors                  *counterVec
}

var (
	systemIndexesOnce   sync.Once
	systemIndexesHolder *APISystemIndexesMetrics
)

// GetAPISystemIndexes returns API system indexes metrics (OTel-backed).
func GetAPISystemIndexes() *APISystemIndexesMetrics {
	systemIndexesOnce.Do(func() {
		m := apiMeter()
		systemIndexesHolder = &APISystemIndexesMetrics{
			Requests: &floatHist{h: mustHist(m.Float64Histogram("api.system_indexes.duration_milliseconds",
				metric.WithUnit("ms"),
				metric.WithDescription("Latency of system index requests (milliseconds)"),
			))},
			RequestsCount: &intCounter{c: mustCounter(m.Int64Counter("api.system_indexes.requests_total",
				metric.WithDescription("Total system index requests recorded"),
			))},
			SystemsRequested: &floatHist{h: mustHist(m.Float64Histogram("api.system_indexes.systems_requested",
				metric.WithUnit("{systems}"),
				metric.WithDescription("Count of system IDs requested per call"),
			))},
			SystemIDsRequestedTotal: &intCounter{c: mustCounter(m.Int64Counter("api.system_indexes.system_ids_requested_total",
				metric.WithUnit("{system_ids}"),
				metric.WithDescription("Cumulative system IDs requested (sum of batch sizes on successful POSTs)"),
			))},
			Errors: &counterVec{
				c: mustCounter(m.Int64Counter("api.system_indexes.errors_total",
					metric.WithDescription("System index handler errors by reason"),
				)),
				attrKey: "reason",
			},
		}
	})
	return systemIndexesHolder
}

// APIMarketPricesMetrics holds OpenTelemetry metrics for the market prices API.
type APIMarketPricesMetrics struct {
	Requests                  *floatHist
	RequestsCount             *intCounter
	RequestsWithMissingPrices *intCounter // HTTP requests where at least one type had no Redis data
	TypesRequested            *floatHist
	TypeIDsRequestedTotal     *intCounter // sum of type ID counts per successful POST (for avg batch size in Prometheus)
	Errors                    *counterVec
}

var (
	marketPricesOnce   sync.Once
	marketPricesHolder *APIMarketPricesMetrics
)

// GetAPIMarketPrices returns API market prices metrics.
func GetAPIMarketPrices() *APIMarketPricesMetrics {
	marketPricesOnce.Do(func() {
		m := apiMeter()
		marketPricesHolder = &APIMarketPricesMetrics{
			Requests: &floatHist{h: mustHist(m.Float64Histogram("api.market_prices.duration_milliseconds",
				metric.WithUnit("ms"),
				metric.WithDescription("Latency of market price requests (milliseconds)"),
			))},
			RequestsCount: &intCounter{c: mustCounter(m.Int64Counter("api.market_prices.requests_total",
				metric.WithDescription("Total market price requests"),
			))},
			RequestsWithMissingPrices: &intCounter{c: mustCounter(m.Int64Counter("api.market_prices.requests_with_missing_prices_total",
				metric.WithDescription("Market price HTTP requests where at least one requested type had no data in Redis"),
			))},
			TypesRequested: &floatHist{h: mustHist(m.Float64Histogram("api.market_prices.types_requested",
				metric.WithUnit("{types}"),
				metric.WithDescription("Type IDs requested per call"),
			))},
			TypeIDsRequestedTotal: &intCounter{c: mustCounter(m.Int64Counter("api.market_prices.type_ids_requested_total",
				metric.WithUnit("{type_ids}"),
				metric.WithDescription("Cumulative type IDs requested (sum of batch sizes on successful POSTs)"),
			))},
			Errors: &counterVec{
				c: mustCounter(m.Int64Counter("api.market_prices.errors_total",
					metric.WithDescription("Market price handler errors"),
				)),
				attrKey: "reason",
			},
		}
	})
	return marketPricesHolder
}

// APIEveTokenLoginMetrics holds OTel metrics for POST /auth/login: validate EVE access token and mint app JWT + refresh.
type APIEveTokenLoginMetrics struct {
	Requests      *floatHist
	RequestsCount *intCounter
	Successes     *intCounter
	NewUsers      *intCounter
	Errors        *counterVec
}

var (
	eveTokenLoginOnce   sync.Once
	eveTokenLoginHolder *APIEveTokenLoginMetrics
)

// GetAPIEveTokenLogin returns metrics for login with an EVE bearer token (internal JWT issuance).
func GetAPIEveTokenLogin() *APIEveTokenLoginMetrics {
	eveTokenLoginOnce.Do(func() {
		m := apiMeter()
		eveTokenLoginHolder = &APIEveTokenLoginMetrics{
			Requests: &floatHist{h: mustHist(m.Float64Histogram("api.eve_token_login.duration_milliseconds",
				metric.WithUnit("ms"),
				metric.WithDescription("Latency of POST /auth/login (EVE token → app JWT) in milliseconds"),
			))},
			RequestsCount: &intCounter{c: mustCounter(m.Int64Counter("api.eve_token_login.requests_total",
				metric.WithDescription("Total POST /auth/login requests"),
			))},
			Successes: &intCounter{c: mustCounter(m.Int64Counter("api.eve_token_login.successes_total",
				metric.WithDescription("Successful EVE-token logins (response written; one success per completed login)"),
			))},
			NewUsers: &intCounter{c: mustCounter(m.Int64Counter("api.eve_token_login.new_users_total",
				metric.WithUnit("{users}"),
				metric.WithDescription("New user accounts created on first login (Mongo user document created)"),
			))},
			Errors: &counterVec{
				c: mustCounter(m.Int64Counter("api.eve_token_login.errors_total",
					metric.WithDescription("POST /auth/login errors by reason"),
				)),
				attrKey: "reason",
			},
		}
	})
	return eveTokenLoginHolder
}

// APISessionRefreshMetrics holds OTel metrics for POST /auth/refresh: rotate app session using refresh token + EVE token.
type APISessionRefreshMetrics struct {
	Requests      *floatHist
	RequestsCount *intCounter
	Successes     *intCounter
	Errors        *counterVec
}

var (
	sessionRefreshOnce   sync.Once
	sessionRefreshHolder *APISessionRefreshMetrics
)

// GetAPISessionRefresh returns metrics for app session refresh (not EVE OAuth token refresh).
func GetAPISessionRefresh() *APISessionRefreshMetrics {
	sessionRefreshOnce.Do(func() {
		m := apiMeter()
		sessionRefreshHolder = &APISessionRefreshMetrics{
			Requests: &floatHist{h: mustHist(m.Float64Histogram("api.session_refresh.duration_milliseconds",
				metric.WithUnit("ms"),
				metric.WithDescription("Latency of POST /auth/refresh (app refresh + EVE token) in milliseconds"),
			))},
			RequestsCount: &intCounter{c: mustCounter(m.Int64Counter("api.session_refresh.requests_total",
				metric.WithDescription("Total POST /auth/refresh requests"),
			))},
			Successes: &intCounter{c: mustCounter(m.Int64Counter("api.session_refresh.successes_total",
				metric.WithDescription("Successful app session refreshes"),
			))},
			Errors: &counterVec{
				c: mustCounter(m.Int64Counter("api.session_refresh.errors_total",
					metric.WithDescription("POST /auth/refresh errors by reason"),
				)),
				attrKey: "reason",
			},
		}
	})
	return sessionRefreshHolder
}

// APIAuthSessionLifecycleMetrics holds OTel metrics for auth session lifecycle events.
type APIAuthSessionLifecycleMetrics struct {
	Started     *counterVec
	Continued   *counterVec
	Ended       *counterVec
	Stored      *counterVec
	StoreErrors *counterVec
}

var (
	authSessionLifecycleOnce   sync.Once
	authSessionLifecycleHolder *APIAuthSessionLifecycleMetrics
)

// GetAPIAuthSessionLifecycle returns auth session lifecycle metrics.
func GetAPIAuthSessionLifecycle() *APIAuthSessionLifecycleMetrics {
	authSessionLifecycleOnce.Do(func() {
		m := apiMeter()
		authSessionLifecycleHolder = &APIAuthSessionLifecycleMetrics{
			Started: &counterVec{
				c: mustCounter(m.Int64Counter("api.auth_sessions.started_total",
					metric.WithDescription("Auth sessions started by flow"),
				)),
				attrKey: "flow",
			},
			Continued: &counterVec{
				c: mustCounter(m.Int64Counter("api.auth_sessions.continued_total",
					metric.WithDescription("Auth sessions continued by flow"),
				)),
				attrKey: "flow",
			},
			Ended: &counterVec{
				c: mustCounter(m.Int64Counter("api.auth_sessions.ended_total",
					metric.WithDescription("Auth sessions ended by flow"),
				)),
				attrKey: "flow",
			},
			Stored: &counterVec{
				c: mustCounter(m.Int64Counter("api.auth_sessions.stored_total",
					metric.WithDescription("Session records successfully written by flow"),
				)),
				attrKey: "flow",
			},
			StoreErrors: &counterVec{
				c: mustCounter(m.Int64Counter("api.auth_sessions.store_errors_total",
					metric.WithDescription("Session record write failures by flow"),
				)),
				attrKey: "flow",
			},
		}
	})
	return authSessionLifecycleHolder
}

// APIAppConfigMetrics holds OpenTelemetry metrics for GET /api/v1/app-config.
type APIAppConfigMetrics struct {
	Requests      *floatHist
	RequestsCount *intCounter
	Errors        *counterVec
}

var (
	apiAppConfigOnce   sync.Once
	apiAppConfigHolder *APIAppConfigMetrics
)

// GetAPIAppConfig returns app-config endpoint metrics.
func GetAPIAppConfig() *APIAppConfigMetrics {
	apiAppConfigOnce.Do(func() {
		m := apiMeter()
		apiAppConfigHolder = &APIAppConfigMetrics{
			Requests: &floatHist{h: mustHist(m.Float64Histogram("api.app_config.duration_milliseconds",
				metric.WithUnit("ms"),
				metric.WithDescription("Latency of GET /api/v1/app-config (milliseconds)"),
			))},
			RequestsCount: &intCounter{c: mustCounter(m.Int64Counter("api.app_config.requests_total",
				metric.WithDescription("Total app-config requests"),
			))},
			Errors: &counterVec{
				c: mustCounter(m.Int64Counter("api.app_config.errors_total",
					metric.WithDescription("App-config handler errors"),
				)),
				attrKey: "reason",
			},
		}
	})
	return apiAppConfigHolder
}

// APICitadelNamesMetrics holds OpenTelemetry metrics for community citadel names endpoints.
type APICitadelNamesMetrics struct {
	Requests      *floatHist
	RequestsCount *intCounter
	Successes     *intCounter
	Errors        *counterVec
}

var (
	apiCitadelNamesOnce   sync.Once
	apiCitadelNamesHolder *APICitadelNamesMetrics
)

// GetAPICitadelNames returns metrics for citadel name submit/lookup endpoints.
func GetAPICitadelNames() *APICitadelNamesMetrics {
	apiCitadelNamesOnce.Do(func() {
		m := apiMeter()
		apiCitadelNamesHolder = &APICitadelNamesMetrics{
			Requests: &floatHist{h: mustHist(m.Float64Histogram("api.citadel_names.duration_milliseconds",
				metric.WithUnit("ms"),
				metric.WithDescription("Latency of community citadel name endpoint requests (milliseconds)"),
			))},
			RequestsCount: &intCounter{c: mustCounter(m.Int64Counter("api.citadel_names.requests_total",
				metric.WithDescription("Total community citadel name endpoint requests"),
			))},
			Successes: &intCounter{c: mustCounter(m.Int64Counter("api.citadel_names.successes_total",
				metric.WithDescription("Successful community citadel name endpoint requests"),
			))},
			Errors: &counterVec{
				c: mustCounter(m.Int64Counter("api.citadel_names.errors_total",
					metric.WithDescription("Community citadel name endpoint errors by reason"),
				)),
				attrKey: "reason",
			},
		}
	})
	return apiCitadelNamesHolder
}

// APICloudStoredEsiRefreshTokensMetrics holds OTel metrics for GET/PUT/DELETE
// /api/v1/user/linked-characters/oauth-credentials (encrypted ESI refresh material for cloud-linked characters).
type APICloudStoredEsiRefreshTokensMetrics struct {
	Requests      *floatHist
	RequestsCount *intCounter
	Successes     *intCounter
	Errors        *counterVec
}

var (
	apiCloudStoredEsiRefreshTokensOnce   sync.Once
	apiCloudStoredEsiRefreshTokensHolder *APICloudStoredEsiRefreshTokensMetrics
)

// GetAPICloudStoredEsiRefreshTokens returns metrics for cloud-stored ESI refresh token CRUD.
func GetAPICloudStoredEsiRefreshTokens() *APICloudStoredEsiRefreshTokensMetrics {
	apiCloudStoredEsiRefreshTokensOnce.Do(func() {
		m := apiMeter()
		apiCloudStoredEsiRefreshTokensHolder = &APICloudStoredEsiRefreshTokensMetrics{
			Requests: &floatHist{h: mustHist(m.Float64Histogram("api.cloud_stored_esi_refresh_tokens.duration_milliseconds",
				metric.WithUnit("ms"),
				metric.WithDescription("Latency of /api/v1/user/linked-characters/oauth-credentials (milliseconds)"),
			))},
			RequestsCount: &intCounter{c: mustCounter(m.Int64Counter("api.cloud_stored_esi_refresh_tokens.requests_total",
				metric.WithDescription("Total cloud-stored ESI refresh token endpoint requests"),
			))},
			Successes: &intCounter{c: mustCounter(m.Int64Counter("api.cloud_stored_esi_refresh_tokens.successes_total",
				metric.WithDescription("Successful cloud-stored ESI refresh token endpoint requests"),
			))},
			Errors: &counterVec{
				c: mustCounter(m.Int64Counter("api.cloud_stored_esi_refresh_tokens.errors_total",
					metric.WithDescription("Cloud-stored ESI refresh token endpoint errors by reason"),
				)),
				attrKey: "reason",
			},
		}
	})
	return apiCloudStoredEsiRefreshTokensHolder
}

// APIEveSSOCodeExchangeMetrics holds OTel metrics for EVE OAuth authorization code exchange (auth code → EVE tokens).
type APIEveSSOCodeExchangeMetrics struct {
	Requests      *floatHist
	RequestsCount *intCounter
	Successes     *intCounter
	Errors        *counterVec
}

var (
	eveSSOCodeExchangeOnce   sync.Once
	eveSSOCodeExchangeHolder *APIEveSSOCodeExchangeMetrics
)

// GetAPIEveSSOCodeExchange returns metrics for EVE SSO code exchange.
func GetAPIEveSSOCodeExchange() *APIEveSSOCodeExchangeMetrics {
	eveSSOCodeExchangeOnce.Do(func() {
		m := apiMeter()
		eveSSOCodeExchangeHolder = &APIEveSSOCodeExchangeMetrics{
			Requests: &floatHist{h: mustHist(m.Float64Histogram("api.eve_sso_code_exchange.duration_milliseconds",
				metric.WithUnit("ms"),
				metric.WithDescription("Latency of EVE OAuth code exchange (milliseconds)"),
			))},
			RequestsCount: &intCounter{c: mustCounter(m.Int64Counter("api.eve_sso_code_exchange.requests_total",
				metric.WithDescription("Total EVE SSO code exchange requests"),
			))},
			Successes: &intCounter{c: mustCounter(m.Int64Counter("api.eve_sso_code_exchange.successes_total",
				metric.WithDescription("Successful EVE SSO code exchanges"),
			))},
			Errors: &counterVec{
				c: mustCounter(m.Int64Counter("api.eve_sso_code_exchange.errors_total",
					metric.WithDescription("EVE SSO code exchange errors"),
				)),
				attrKey: "reason",
			},
		}
	})
	return eveSSOCodeExchangeHolder
}

// APIEveSSOTokenRefreshMetrics holds OTel metrics for refreshing EVE OAuth tokens via EVE refresh token (calls EVE SSO).
type APIEveSSOTokenRefreshMetrics struct {
	Requests      *floatHist
	RequestsCount *intCounter
	Successes     *intCounter
	Errors        *counterVec
}

var (
	eveSSOTokenRefreshOnce   sync.Once
	eveSSOTokenRefreshHolder *APIEveSSOTokenRefreshMetrics
)

// GetAPIEveSSOTokenRefresh returns metrics for EVE OAuth token refresh (not app /auth/refresh).
func GetAPIEveSSOTokenRefresh() *APIEveSSOTokenRefreshMetrics {
	eveSSOTokenRefreshOnce.Do(func() {
		m := apiMeter()
		eveSSOTokenRefreshHolder = &APIEveSSOTokenRefreshMetrics{
			Requests: &floatHist{h: mustHist(m.Float64Histogram("api.eve_sso_token_refresh.duration_milliseconds",
				metric.WithUnit("ms"),
				metric.WithDescription("Latency of EVE OAuth token refresh via refresh token (milliseconds)"),
			))},
			RequestsCount: &intCounter{c: mustCounter(m.Int64Counter("api.eve_sso_token_refresh.requests_total",
				metric.WithDescription("Total EVE OAuth token refresh requests"),
			))},
			Successes: &intCounter{c: mustCounter(m.Int64Counter("api.eve_sso_token_refresh.successes_total",
				metric.WithDescription("Successful EVE OAuth token refreshes"),
			))},
			Errors: &counterVec{
				c: mustCounter(m.Int64Counter("api.eve_sso_token_refresh.errors_total",
					metric.WithDescription("EVE OAuth token refresh errors"),
				)),
				attrKey: "reason",
			},
		}
	})
	return eveSSOTokenRefreshHolder
}

// APIJobsMetrics holds OpenTelemetry metrics for jobs endpoints.
type APIJobsMetrics struct {
	Requests      *floatHist
	RequestsCount *intCounter
	Successes     *intCounter
	JobsRequested *floatHist
	JobsDeleted   *intCounter
	JobsSaved     *intCounter
	Errors        *counterVec
}

var (
	apiJobsOnce   sync.Once
	apiJobsHolder *APIJobsMetrics
)

// GetAPIJobs returns jobs API metrics.
func GetAPIJobs() *APIJobsMetrics {
	apiJobsOnce.Do(func() {
		m := apiMeter()
		apiJobsHolder = &APIJobsMetrics{
			Requests: &floatHist{h: mustHist(m.Float64Histogram("api.jobs.duration_milliseconds",
				metric.WithUnit("ms"),
				metric.WithDescription("Latency of jobs handler operations (milliseconds, where recorded)"),
			))},
			RequestsCount: &intCounter{c: mustCounter(m.Int64Counter("api.jobs.requests_total",
				metric.WithDescription("Total jobs API requests (where recorded)"),
			))},
			Successes: &intCounter{c: mustCounter(m.Int64Counter("api.jobs.successes_total",
				metric.WithDescription("Successful jobs operations"),
			))},
			JobsRequested: &floatHist{h: mustHist(m.Float64Histogram("api.jobs.items_per_request",
				metric.WithUnit("{jobs}"),
				metric.WithDescription("Jobs count per successful request"),
			))},
			JobsDeleted: &intCounter{c: mustCounter(m.Int64Counter("api.jobs.deleted_total",
				metric.WithDescription("Jobs deleted"),
			))},
			JobsSaved: &intCounter{c: mustCounter(m.Int64Counter("api.jobs.saved_total",
				metric.WithDescription("Jobs saved/upserted"),
			))},
			Errors: &counterVec{
				c: mustCounter(m.Int64Counter("api.jobs.errors_total",
					metric.WithDescription("Jobs handler errors"),
				)),
				attrKey: "reason",
			},
		}
	})
	return apiJobsHolder
}

// APIArchivedJobsMetrics holds OpenTelemetry metrics for PUT /api/v1/archived-jobs (Mongo archived jobs collection).
type APIArchivedJobsMetrics struct {
	Requests               *floatHist
	RequestsCount          *intCounter
	Successes              *intCounter
	JobsRequested          *floatHist
	JobsSaved              *intCounter // Mongo BulkWrite modified + upserted (usually equals batch size per successful PUT)
	IndividualJobsArchived *intCounter // one increment per job document in each successful PUT (len(batch))
	Errors                 *counterVec
}

var (
	apiArchivedJobsOnce   sync.Once
	apiArchivedJobsHolder *APIArchivedJobsMetrics
)

// GetAPIArchivedJobs returns archived-jobs API metrics.
func GetAPIArchivedJobs() *APIArchivedJobsMetrics {
	apiArchivedJobsOnce.Do(func() {
		m := apiMeter()
		apiArchivedJobsHolder = &APIArchivedJobsMetrics{
			Requests: &floatHist{h: mustHist(m.Float64Histogram("api.archived_jobs.duration_milliseconds",
				metric.WithUnit("ms"),
				metric.WithDescription("Latency of archived jobs handler operations (milliseconds, where recorded)"),
			))},
			RequestsCount: &intCounter{c: mustCounter(m.Int64Counter("api.archived_jobs.requests_total",
				metric.WithDescription("Total archived jobs API requests (where recorded)"),
			))},
			Successes: &intCounter{c: mustCounter(m.Int64Counter("api.archived_jobs.successes_total",
				metric.WithDescription("Successful archived jobs batch upserts"),
			))},
			JobsRequested: &floatHist{h: mustHist(m.Float64Histogram("api.archived_jobs.items_per_request",
				metric.WithUnit("{jobs}"),
				metric.WithDescription("Archived jobs count per successful request"),
			))},
			JobsSaved: &intCounter{c: mustCounter(m.Int64Counter("api.archived_jobs.saved_total",
				metric.WithDescription("Mongo bulk-write modified + upserted ops on successful PUT (should match batch size)"),
			))},
			IndividualJobsArchived: &intCounter{c: mustCounter(m.Int64Counter("api.archived_jobs.individual_jobs_archived_total",
				metric.WithUnit("{jobs}"),
				metric.WithDescription("Individual job documents archived: incremented by batch size on each successful PUT /api/v1/archived-jobs"),
			))},
			Errors: &counterVec{
				c: mustCounter(m.Int64Counter("api.archived_jobs.errors_total",
					metric.WithDescription("Archived jobs handler errors"),
				)),
				attrKey: "reason",
			},
		}
	})
	return apiArchivedJobsHolder
}

// APIGroupsMetrics holds OpenTelemetry metrics for groups endpoints.
type APIGroupsMetrics struct {
	Requests        *floatHist
	RequestsCount   *intCounter
	Successes       *intCounter
	GroupsRequested *floatHist
	GroupsDeleted   *intCounter
	GroupsSaved     *intCounter
	Errors          *counterVec
}

var (
	apiGroupsOnce   sync.Once
	apiGroupsHolder *APIGroupsMetrics
)

// GetAPIGroups returns groups API metrics.
func GetAPIGroups() *APIGroupsMetrics {
	apiGroupsOnce.Do(func() {
		m := apiMeter()
		apiGroupsHolder = &APIGroupsMetrics{
			Requests: &floatHist{h: mustHist(m.Float64Histogram("api.groups.duration_milliseconds",
				metric.WithUnit("ms"),
				metric.WithDescription("Latency of groups operations (milliseconds, where recorded)"),
			))},
			RequestsCount: &intCounter{c: mustCounter(m.Int64Counter("api.groups.requests_total",
				metric.WithDescription("Total groups API requests (where recorded)"),
			))},
			Successes: &intCounter{c: mustCounter(m.Int64Counter("api.groups.successes_total",
				metric.WithDescription("Successful groups operations"),
			))},
			GroupsRequested: &floatHist{h: mustHist(m.Float64Histogram("api.groups.items_per_request",
				metric.WithUnit("{groups}"),
				metric.WithDescription("Groups count per successful request"),
			))},
			GroupsDeleted: &intCounter{c: mustCounter(m.Int64Counter("api.groups.deleted_total",
				metric.WithDescription("Groups deleted"),
			))},
			GroupsSaved: &intCounter{c: mustCounter(m.Int64Counter("api.groups.saved_total",
				metric.WithDescription("Groups saved"),
			))},
			Errors: &counterVec{
				c: mustCounter(m.Int64Counter("api.groups.errors_total",
					metric.WithDescription("Groups handler errors"),
				)),
				attrKey: "reason",
			},
		}
	})
	return apiGroupsHolder
}

// APIGroupTemplatesMetrics holds OpenTelemetry metrics for group-templates endpoints.
type APIGroupTemplatesMetrics struct {
	Requests      *floatHist
	RequestsCount *intCounter
	Successes     *intCounter
	Errors        *counterVec
}

var (
	apiGroupTemplatesOnce   sync.Once
	apiGroupTemplatesHolder *APIGroupTemplatesMetrics
)

// GetAPIGroupTemplates returns group-templates API metrics.
func GetAPIGroupTemplates() *APIGroupTemplatesMetrics {
	apiGroupTemplatesOnce.Do(func() {
		m := apiMeter()
		apiGroupTemplatesHolder = &APIGroupTemplatesMetrics{
			Requests: &floatHist{h: mustHist(m.Float64Histogram("api.group_templates.duration_milliseconds",
				metric.WithUnit("ms"),
				metric.WithDescription("Latency of group templates operations (milliseconds)"),
			))},
			RequestsCount: &intCounter{c: mustCounter(m.Int64Counter("api.group_templates.requests_total",
				metric.WithDescription("Total group templates API requests"),
			))},
			Successes: &intCounter{c: mustCounter(m.Int64Counter("api.group_templates.successes_total",
				metric.WithDescription("Successful group templates operations"),
			))},
			Errors: &counterVec{
				c: mustCounter(m.Int64Counter("api.group_templates.errors_total",
					metric.WithDescription("Group templates handler errors"),
				)),
				attrKey: "reason",
			},
		}
	})
	return apiGroupTemplatesHolder
}

// APIStatisticsMetrics holds OpenTelemetry metrics for statistics endpoints.
type APIStatisticsMetrics struct {
	Requests      *floatHist
	RequestsCount *intCounter
	Successes     *intCounter
	Errors        *counterVec
}

var (
	apiStatisticsOnce   sync.Once
	apiStatisticsHolder *APIStatisticsMetrics
)

// GetAPIStatistics returns statistics API metrics.
func GetAPIStatistics() *APIStatisticsMetrics {
	apiStatisticsOnce.Do(func() {
		m := apiMeter()
		apiStatisticsHolder = &APIStatisticsMetrics{
			Requests: &floatHist{h: mustHist(m.Float64Histogram("api.statistics.duration_milliseconds",
				metric.WithUnit("ms"),
				metric.WithDescription("Latency of statistics API requests (milliseconds)"),
			))},
			RequestsCount: &intCounter{c: mustCounter(m.Int64Counter("api.statistics.requests_total",
				metric.WithDescription("Total statistics API requests"),
			))},
			Successes: &intCounter{c: mustCounter(m.Int64Counter("api.statistics.successes_total",
				metric.WithDescription("Successful statistics API requests"),
			))},
			Errors: &counterVec{
				c: mustCounter(m.Int64Counter("api.statistics.errors_total",
					metric.WithDescription("Statistics API errors by reason"),
				)),
				attrKey: "reason",
			},
		}
	})
	return apiStatisticsHolder
}

// StaticDataFileMetrics holds duration + request count for one /api/static-data file endpoint.
type StaticDataFileMetrics struct {
	Requests      *floatHist
	RequestsCount *intCounter
}

// APIStaticDataMetrics holds OpenTelemetry metrics for public static JSON and meta endpoints.
type APIStaticDataMetrics struct {
	RecipeList         *StaticDataFileMetrics
	SearchIndex        *StaticDataFileMetrics
	FullItemList       *StaticDataFileMetrics
	Reprocessing       *StaticDataFileMetrics
	InventionModifiers *StaticDataFileMetrics
	Meta               *StaticDataFileMetrics
	Errors             *counterVec
}

var (
	apiStaticDataOnce   sync.Once
	apiStaticDataHolder *APIStaticDataMetrics
)

// GetAPIStaticData returns metrics for /api/static-data/* endpoints.
func GetAPIStaticData() *APIStaticDataMetrics {
	apiStaticDataOnce.Do(func() {
		m := apiMeter()
		newFile := func(name, desc string) *StaticDataFileMetrics {
			return &StaticDataFileMetrics{
				Requests: &floatHist{h: mustHist(m.Float64Histogram("api.static_data."+name+".duration_milliseconds",
					metric.WithUnit("ms"),
					metric.WithDescription("Latency of "+desc+" (milliseconds)"),
				))},
				RequestsCount: &intCounter{c: mustCounter(m.Int64Counter("api.static_data."+name+".requests_total",
					metric.WithDescription("Total requests for "+desc),
				))},
			}
		}
		apiStaticDataHolder = &APIStaticDataMetrics{
			RecipeList:         newFile("recipe_list", "recipeList.json"),
			SearchIndex:        newFile("search_index", "searchIndex.json"),
			FullItemList:       newFile("full_item_list", "fullItemList.json"),
			Reprocessing:       newFile("reprocessing", "reprocessingData.json"),
			InventionModifiers: newFile("invention_modifiers", "inventionModifiers.json"),
			Meta:               newFile("meta", "static-data meta"),
			Errors: &counterVec{
				c: mustCounter(m.Int64Counter("api.static_data.errors_total",
					metric.WithDescription("Static data handler errors by reason"),
				)),
				attrKey: "reason",
			},
		}
	})
	return apiStaticDataHolder
}

// LogRequestMetrics logs per-request details for slow paths or errors (structured logs; complements OTel traces/metrics).
func LogRequestMetrics(ctx context.Context, endpoint string, duration time.Duration, status string, kv ...any) {
	const comp = "api_request"

	if duration > time.Second {
		fields := append([]any{
			"component", comp,
			"endpoint", endpoint,
			"duration_ms", duration.Milliseconds(),
			"duration_seconds", duration.Seconds(),
			"status", status,
			"slow_request", true,
		}, kv...)
		logs.WarnCtx(ctx, "slow API request", fields...)
		return
	}

	if status != "success" && status != "" {
		fields := append([]any{
			"component", comp,
			"endpoint", endpoint,
			"duration_ms", duration.Milliseconds(),
			"status", status,
		}, kv...)
		logs.WarnCtx(ctx, "API request error", fields...)
		return
	}

	if len(kv) > 0 {
		fields := append([]any{
			"component", comp,
			"endpoint", endpoint,
			"duration_ms", duration.Milliseconds(),
			"status", status,
		}, kv...)
		logs.DebugCtx(ctx, "API request", fields...)
	}
}
