package main

import (
	"context"
	"eve-industry-planner/shared/stackservices"
	"net/http"
	"strings"
	"time"

	"eve-industry-planner/api/apideps"
	"eve-industry-planner/api/helper/auth"
	"eve-industry-planner/api/helper/sdecache"
	"eve-industry-planner/api/middleware"
	"eve-industry-planner/api/migrationendpoints"
	"eve-industry-planner/api/staticdata"
	"eve-industry-planner/api/v1endpoints"
	"eve-industry-planner/api/v1endpoints/archivedjobs"
	"eve-industry-planner/api/v1endpoints/documentlocks"
	"eve-industry-planner/api/v1endpoints/groups"
	"eve-industry-planner/api/v1endpoints/grouptemplates"
	"eve-industry-planner/api/v1endpoints/jobdocuments"
	ssoendpoints "eve-industry-planner/api/v1endpoints/sso"
	"eve-industry-planner/api/v1endpoints/statistics"
	user "eve-industry-planner/api/v1endpoints/user"
	"eve-industry-planner/api/v1endpoints/watchlist"
	"eve-industry-planner/shared/core/config"
	"eve-industry-planner/shared/lifecycle"
	"eve-industry-planner/shared/logs"

	sentryhttp "github.com/getsentry/sentry-go/http"
	"github.com/ulule/limiter/v3"
	lredis "github.com/ulule/limiter/v3/drivers/store/redis"
	"go.opentelemetry.io/contrib/instrumentation/net/http/otelhttp"
)

type route struct {
	Path    string
	Handler http.HandlerFunc
}

func StartAPIServer(ctx context.Context, clients *stackservices.Clients) (lifecycle.Runner, error) {
	logs.SetDebugIdentityResolver(func(ctx context.Context) (string, string) {
		return auth.AccountIDFromContext(ctx), auth.SessionIDFromContext(ctx)
	})

	//creates rate limits for routes and setups up redis store to store them
	publicRateLimit, err := limiter.NewRateFromFormatted("50-S")
	if err != nil {
		logs.ErrorCtx(ctx, "failed to create public rate limiter", "err", err)
		return nil, err
	}
	privateRateLimit, err := limiter.NewRateFromFormatted("200-M")
	if err != nil {
		logs.ErrorCtx(ctx, "failed to create private rate limiter", "err", err)
		return nil, err
	}
	store, err := lredis.NewStoreWithOptions(clients.Redis, limiter.StoreOptions{
		Prefix:          "limiter",
		CleanUpInterval: 5 * time.Minute,
	})
	if err != nil {
		logs.ErrorCtx(ctx, "failed to create redis store", "err", err)
		return nil, err
	}

	mux := http.NewServeMux()

	// Warm live SDE into process memory; refresh on worker NATS SDE build updates.
	sdecache.StartCacheWarmer(ctx, clients.NATS)

	// Outermost: RequestStartTimeConstructor (before otelhttp) so duration includes tracing.
	// Under otelhttp: deadline, logging, maintenance, compression, then mux (unregistered-route logging).
	// Per-route middleware (rate limit, auth) is applied only to registered handlers via groups.
	apiHandler := middleware.Chain(
		middleware.RequestTimeoutConstructor(),
		middleware.RequestLoggingConstructor(),
		middleware.MaintenanceModeConstructor(),
		middleware.CompressionConstructor(),
		middleware.UnregisteredRoutesMuxConstructor(mux),
	)(http.NotFoundHandler()) // leaf unused; UnregisteredRoutesMuxConstructor serves the mux directly

	// Public and private groups for v1
	// Per-ID citadel name GETs are cacheable (browser + CDN); a single page can request many
	// structure IDs in parallel on a cold cache. Exempt that prefix from the default public
	// rate limit so we do not need a non-cacheable batch lookup.
	publicGroup := middleware.NewGroup(mux,
		middleware.OptionalAccountLogConstructor(clients.Redis),
		middleware.ApplyIf(
			func(r *http.Request) bool {
				return !strings.HasPrefix(r.URL.Path, "/api/v1/citadel-names")
			},
			middleware.RateLimiterConstructor(store, publicRateLimit, "public"),
		),
	)
	privateGroup := middleware.NewGroup(mux,
		middleware.RateLimiterConstructor(store, privateRateLimit, "private"),
		middleware.AuthConstructor(clients.Redis),
	)

	deps := apideps.FromClients(clients)
	v1 := v1endpoints.New(deps)
	ssoH := ssoendpoints.New(deps)
	userH := user.New(deps)
	watchlists := watchlist.New(deps)
	stats := statistics.New(deps)
	templates := grouptemplates.New(deps)
	jobDocs := jobdocuments.New(deps)
	groupH := groups.New(deps)
	archived := archivedjobs.New(deps)
	locks := documentlocks.New(deps)

	// Define public routes (v1)
	publicRoutes := []route{
		{
			Path:    "/api/v1/auth/sessions",
			Handler: v1.AuthHandler,
		},
		{
			Path:    "/api/v1/auth/sessions/rotate",
			Handler: v1.RotateHandler,
		},
		{
			Path:    "/api/v1/auth/sessions/bootstrap",
			Handler: v1.BootstrapHandler,
		},
		{
			Path:    "/api/v1/eve-sso/tokens/exchange",
			Handler: ssoH.EveSSOExchangeHandler,
		},
		{
			Path:    "/api/v1/eve-sso/tokens/refresh",
			Handler: ssoH.EveSSORefreshHandler,
		},
		{
			Path:    "/api/v1/system-indexes",
			Handler: v1.SystemIndexesHandler,
		},
		{
			Path:    "/api/v1/market-prices",
			Handler: v1.MarketPricesHandler,
		},
		{
			Path:    "/api/v1/analytics/events",
			Handler: v1.FrontendAppEventsBatchHandler,
		},
		{
			Path:    "/api/v1/feedback",
			Handler: v1.FeedbackHandler,
		},
		{
			Path:    "/api/v1/app-config",
			Handler: v1.AppConfigHandler,
		},
		{
			Path:    "/api/v1/citadel-names/{citadelID}",
			Handler: userH.CitadelNameByIDHandler,
		},
		{
			Path:    "/api/v1/blueprints/{blueprintID}",
			Handler: v1.BlueprintsHandler,
		},
		{
			Path:    "/api/v1/blueprints",
			Handler: v1.BlueprintsHandler,
		},
		{
			Path: "/api/static-data/recipeList.json",
			Handler: func(w http.ResponseWriter, r *http.Request) {
				staticdata.RecipeListHandler(w, r)
			},
		},
		{
			Path: "/api/static-data/searchIndex.json",
			Handler: func(w http.ResponseWriter, r *http.Request) {
				staticdata.SearchIndexHandler(w, r)
			},
		},
		{
			Path: "/api/static-data/fullItemList.json",
			Handler: func(w http.ResponseWriter, r *http.Request) {
				staticdata.FullItemListHandler(w, r)
			},
		},
		{
			Path: "/api/static-data/reprocessingData.json",
			Handler: func(w http.ResponseWriter, r *http.Request) {
				staticdata.ReprocessingDataHandler(w, r)
			},
		},
		{
			Path: "/api/static-data/inventionModifiers.json",
			Handler: func(w http.ResponseWriter, r *http.Request) {
				staticdata.InventionModifiersHandler(w, r)
			},
		},
		{
			Path: "/api/static-data/meta",
			Handler: func(w http.ResponseWriter, r *http.Request) {
				staticdata.MetaHandler(w, r)
			},
		},
	}
	// Register public routes
	for _, route := range publicRoutes {
		publicGroup.HandleFunc(route.Path, route.Handler)
	}

	// Define private routes (v1)
	privateRoutes := []route{
		{
			Path:    "/api/v1/esi/characters/access-token/server",
			Handler: userH.ServerStoredEsiAccessTokenHandler,
		},
		{
			Path:    "/api/v1/corporation-claims",
			Handler: v1.CorporationsHandler,
		},
		{
			Path:    "/api/v1/auth/sessions/logout",
			Handler: v1.LogoutHandler,
		},
		{
			Path:    "/api/v1/user/document",
			Handler: userH.DocumentHandler,
		},
		{
			Path:    "/api/v1/user/linked-characters/oauth-credentials",
			Handler: userH.CloudStoredEsiRefreshTokensHandler,
		},
		{
			Path:    "/api/v1/user/application-settings",
			Handler: userH.ApplicationSettingsHandler,
		},
		{
			Path:    "/api/v1/user/citadel-names",
			Handler: userH.CitadelNamesHandler,
		},
		{
			Path:    "/api/v1/user/watchlist",
			Handler: watchlists.Router,
		},
		{
			Path:    "/api/v1/job-documents",
			Handler: jobDocs.Router,
		},
		{
			Path:    "/api/v1/job-documents/",
			Handler: jobDocs.Router,
		},
		{
			Path:    "/api/v1/archived-jobs",
			Handler: archived.Router,
		},
		{
			Path:    "/api/v1/archived-jobs/",
			Handler: archived.Router,
		},
		{
			Path:    "/api/v1/statistics",
			Handler: stats.Router,
		},
		{
			Path:    "/api/v1/statistics/",
			Handler: stats.Router,
		},
		{
			Path:    "/api/v1/groups",
			Handler: groupH.Router,
		},
		{
			Path:    "/api/v1/groups/",
			Handler: groupH.Router,
		},
		{
			Path:    "/api/v1/group-templates",
			Handler: templates.Router,
		},
		{
			Path:    "/api/v1/group-templates/",
			Handler: templates.Router,
		},
		{
			Path:    "/api/v1/document-locks/",
			Handler: locks.Router,
		},
	}

	// Register private routes (v1)
	for _, route := range privateRoutes {
		privateGroup.HandleFunc(route.Path, route.Handler)
	}

	// Migration-specific groups (separate from v1 handlers)
	migrationPublicGroup := middleware.NewGroup(mux,
		middleware.OptionalAccountLogConstructor(clients.Redis),
		middleware.RateLimiterConstructor(store, publicRateLimit, "migration_public"),
	)

	// Migration public routes
	migrationPublicRoutes := []route{
		{
			Path: "/api/migration/item/{itemID}",
			Handler: func(w http.ResponseWriter, r *http.Request) {
				migrationendpoints.ItemRecipeHandler(w, r)
			},
		},
		{
			Path: "/api/migration/item",
			Handler: func(w http.ResponseWriter, r *http.Request) {
				migrationendpoints.ItemRecipeHandler(w, r)
			},
		},
	}
	for _, route := range migrationPublicRoutes {
		migrationPublicGroup.HandleFunc(route.Path, route.Handler)
	}

	baseHandler := middleware.RequestStartTimeConstructor()(
		otelhttp.NewHandler(
			apiHandler,
			"api",
			otelhttp.WithFilter(func(r *http.Request) bool {
				switch r.URL.Path {
				case "/health", "/healthy", "/ready":
					return false
				default:
					return true
				}
			}),
		),
	)
	// Panics → Sentry (errors); traces still from OTel → Sentry span processor when DSN is baked in.
	sentryHandler := sentryhttp.New(sentryhttp.Options{Repanic: false})
	handler := sentryHandler.Handle(baseHandler)
	addr := ":" + config.APIPort()
	logs.InfoCtx(ctx, "api http server starting", "addr", addr)
	srv := &http.Server{Addr: addr, Handler: handler}
	runner, err := lifecycle.HTTPServer("api-http", srv)
	if err != nil {
		return nil, err
	}
	logs.InfoCtx(ctx, "api service listening", "addr", addr)
	return runner, nil
}
