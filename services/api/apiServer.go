package main

import (
	"context"
	"fmt"
	"net/http"
	"os"
	"strings"
	"time"

	"eve-industry-planner/api/middleware"
	"eve-industry-planner/api/migrationendpoints"
	"eve-industry-planner/api/staticdata"
	"eve-industry-planner/api/v1endpoints"
	"eve-industry-planner/api/v1endpoints/archivedjobs"
	"eve-industry-planner/api/v1endpoints/documentlocks"
	"eve-industry-planner/api/v1endpoints/groups"
	"eve-industry-planner/api/v1endpoints/jobdocuments"
	ssoendpoints "eve-industry-planner/api/v1endpoints/sso"
	"eve-industry-planner/api/v1endpoints/statistics"
	userendpoints "eve-industry-planner/api/v1endpoints/user"
	"eve-industry-planner/api/v1endpoints/watchlist"
	"eve-industry-planner/shared/core/config"
	"eve-industry-planner/shared/logs"
	"eve-industry-planner/shared/shared"

	sentryhttp "github.com/getsentry/sentry-go/http"
	"github.com/ulule/limiter/v3"
	lredis "github.com/ulule/limiter/v3/drivers/store/redis"
	"go.opentelemetry.io/contrib/instrumentation/net/http/otelhttp"
)

type route struct {
	Path    string
	Handler http.HandlerFunc
}

func StartAPIServer(ctx context.Context, clients *shared.ServiceClients) error {
	if os.Getenv("FAIL_ON_STARTUP") == "true" {
		return fmt.Errorf("startup failure requested via FAIL_ON_STARTUP")
	}

	//creates rate limits for routes and setups up redis store to store them
	publicRateLimit, err := limiter.NewRateFromFormatted("50-S")
	if err != nil {
		logs.ErrorCtx(ctx, "failed to create public rate limiter", "err", err)
		return err
	}
	privateRateLimit, err := limiter.NewRateFromFormatted("100-M")
	if err != nil {
		logs.ErrorCtx(ctx, "failed to create private rate limiter", "err", err)
		return err
	}
	store, err := lredis.NewStoreWithOptions(clients.Redis, limiter.StoreOptions{
		Prefix:          "limiter",
		CleanUpInterval: 5 * time.Minute,
	})
	if err != nil {
		logs.ErrorCtx(ctx, "failed to create redis store", "err", err)
		return err
	}

	mux := http.NewServeMux()

	// Register internal-only health check endpoint FIRST
	// This is registered directly on mux (not through router groups) so it's only
	// accessible directly on port 4000, not through Traefik's public routing
	mux.HandleFunc("/health", func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusOK)
		w.Write([]byte("OK"))
	})

	// Outermost: RequestStartTimeConstructor (before otelhttp) so duration includes tracing.
	// Under otelhttp: deadline, then request-scoped logging, then compression, then mux.
	// Per-route middleware (rate limit, auth) is applied only to registered handlers via groups.
	apiHandler := middleware.Chain(
		middleware.RequestTimeoutConstructor(),
		middleware.RequestLoggingConstructor(),
		middleware.MaintenanceModeConstructor(),
		middleware.CompressionConstructor(),
	)(mux)

	// Public and private groups for v1
	// Per-ID citadel name GETs are cacheable (browser + CDN); a single page can request many
	// structure IDs in parallel on a cold cache. Exempt that prefix from the default public
	// rate limit so we do not need a non-cacheable batch lookup.
	publicGroup := middleware.NewGroup(mux,
		middleware.ApplyIf(
			func(r *http.Request) bool {
				return !strings.HasPrefix(r.URL.Path, "/api/v1/citadel-names")
			},
			middleware.RateLimiterConstructor(store, publicRateLimit, "public"),
		),
	)
	privateGroup := middleware.NewGroup(mux,
		middleware.RateLimiterConstructor(store, privateRateLimit, "private"),
		middleware.AuthConstructor(),
	)

	// Define public routes (v1)
	publicRoutes := []route{
		{
			Path: "/api/v1/auth/sessions",
			Handler: func(w http.ResponseWriter, r *http.Request) {
				v1endpoints.AuthHandler(w, r, clients)
			},
		},
		{
			Path: "/api/v1/auth/sessions/refresh",
			Handler: func(w http.ResponseWriter, r *http.Request) {
				v1endpoints.RefreshHandler(w, r, clients)
			},
		},
		{
			Path: "/api/v1/auth/sessions/login-refresh",
			Handler: func(w http.ResponseWriter, r *http.Request) {
				v1endpoints.LoginRefreshHandler(w, r, clients)
			},
		},
		{
			Path: "/api/v1/auth/jwks",
			Handler: func(w http.ResponseWriter, r *http.Request) {
				v1endpoints.JWKSHandler(w, r)
			},
		},
		{
			Path: "/api/v1/eve-sso/tokens/exchange",
			Handler: func(w http.ResponseWriter, r *http.Request) {
				ssoendpoints.EveSSOExchangeHandler(w, r, clients)
			},
		},
		{
			Path: "/api/v1/eve-sso/tokens/refresh",
			Handler: func(w http.ResponseWriter, r *http.Request) {
				ssoendpoints.EveSSORefreshHandler(w, r, clients)
			},
		},
		{Path: "/api/v1/system-indexes",
			Handler: func(w http.ResponseWriter, r *http.Request) {
				v1endpoints.SystemIndexesHandler(w, r, clients)
			},
		},
		{Path: "/api/v1/market-prices",
			Handler: func(w http.ResponseWriter, r *http.Request) {
				v1endpoints.MarketPricesHandler(w, r, clients)
			},
		},
		{
			Path: "/api/v1/analytics/events",
			Handler: func(w http.ResponseWriter, r *http.Request) {
				v1endpoints.FrontendAppEventsBatchHandler(w, r, clients)
			},
		},
		{
			Path: "/api/v1/feedback",
			Handler: func(w http.ResponseWriter, r *http.Request) {
				v1endpoints.FeedbackHandler(w, r, clients)
			},
		},
		{
			Path: "/api/v1/app-config",
			Handler: func(w http.ResponseWriter, r *http.Request) {
				v1endpoints.AppConfigHandler(w, r, clients)
			},
		},
		{
			Path: "/api/v1/citadel-names/{citadelID}",
			Handler: func(w http.ResponseWriter, r *http.Request) {
				userendpoints.CitadelNameByIDHandler(w, r, clients)
			},
		},
		{
			Path: "/api/v1/blueprints/{blueprintID}",
			Handler: func(w http.ResponseWriter, r *http.Request) {
				v1endpoints.BlueprintsHandler(w, r, clients)
			},
		},
		{
			Path: "/api/v1/blueprints",
			Handler: func(w http.ResponseWriter, r *http.Request) {
				v1endpoints.BlueprintsHandler(w, r, clients)
			},
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
			Path: "/api/v1/eve-sso/additional-characters/refresh",
			Handler: func(w http.ResponseWriter, r *http.Request) {
				userendpoints.CloudAdditionalCharacterEsiRefreshHandler(w, r, clients)
			},
		},
		{
			Path: "/api/v1/corporation-claims",
			Handler: func(w http.ResponseWriter, r *http.Request) {
				v1endpoints.CorporationsHandler(w, r, clients)
			},
		},
		{
			Path: "/api/v1/auth/sessions/logout",
			Handler: func(w http.ResponseWriter, r *http.Request) {
				v1endpoints.LogoutHandler(w, r, clients)
			},
		},
		{
			Path: "/api/v1/user/document",
			Handler: func(w http.ResponseWriter, r *http.Request) {
				userendpoints.DocumentHandler(w, r, clients)
			},
		},
		{
			Path: "/api/v1/user/additional-character-refresh-tokens",
			Handler: func(w http.ResponseWriter, r *http.Request) {
				userendpoints.AdditionalCharacterRefreshTokensHandler(w, r, clients)
			},
		},
		{
			Path: "/api/v1/user/application-settings",
			Handler: func(w http.ResponseWriter, r *http.Request) {
				userendpoints.ApplicationSettingsHandler(w, r, clients)
			},
		},
		{
			Path: "/api/v1/user/citadel-names",
			Handler: func(w http.ResponseWriter, r *http.Request) {
				userendpoints.CitadelNamesHandler(w, r, clients)
			},
		},
		{
			Path: "/api/v1/user/watchlist",
			Handler: func(w http.ResponseWriter, r *http.Request) {
				watchlist.Router(w, r, clients)
			},
		},
		{
			Path: "/api/v1/job-documents",
			Handler: func(w http.ResponseWriter, r *http.Request) {
				jobdocuments.JobDocumentsRouter(w, r, clients)
			},
		},
		{
			Path: "/api/v1/job-documents/",
			Handler: func(w http.ResponseWriter, r *http.Request) {
				jobdocuments.JobDocumentsRouter(w, r, clients)
			},
		},
		{
			Path: "/api/v1/archived-jobs",
			Handler: func(w http.ResponseWriter, r *http.Request) {
				archivedjobs.Router(w, r, clients)
			},
		},
		{
			Path: "/api/v1/archived-jobs/",
			Handler: func(w http.ResponseWriter, r *http.Request) {
				archivedjobs.Router(w, r, clients)
			},
		},
		{
			Path: "/api/v1/statistics",
			Handler: func(w http.ResponseWriter, r *http.Request) {
				statistics.Router(w, r, clients)
			},
		},
		{
			Path: "/api/v1/statistics/",
			Handler: func(w http.ResponseWriter, r *http.Request) {
				statistics.Router(w, r, clients)
			},
		},
		{
			Path: "/api/v1/groups",
			Handler: func(w http.ResponseWriter, r *http.Request) {
				groups.Router(w, r, clients)
			},
		},
		{
			Path: "/api/v1/groups/",
			Handler: func(w http.ResponseWriter, r *http.Request) {
				groups.Router(w, r, clients)
			},
		},
		{
			Path: "/api/v1/document-locks/",
			Handler: func(w http.ResponseWriter, r *http.Request) {
				documentlocks.Router(w, r, clients)
			},
		},
	}

	// Register private routes (v1)
	for _, route := range privateRoutes {
		privateGroup.HandleFunc(route.Path, route.Handler)
	}

	// Migration-specific groups (separate from v1 handlers)
	migrationPublicGroup := middleware.NewGroup(mux,
		middleware.RateLimiterConstructor(store, publicRateLimit, "migration_public"),
	)

	// Migration public routes
	migrationPublicRoutes := []route{
		{
			Path: "/api/migration/item/{itemID}",
			Handler: func(w http.ResponseWriter, r *http.Request) {
				migrationendpoints.ItemRecipeHandler(w, r, clients)
			},
		},
		{
			Path: "/api/migration/item",
			Handler: func(w http.ResponseWriter, r *http.Request) {
				migrationendpoints.ItemRecipeHandler(w, r, clients)
			},
		},
	}
	for _, route := range migrationPublicRoutes {
		migrationPublicGroup.HandleFunc(route.Path, route.Handler)
	}

	cfg, err := config.LoadConfig()
	if err != nil {
		return err
	}
	baseHandler := middleware.RequestStartTimeConstructor()(
		otelhttp.NewHandler(
			apiHandler,
			"api",
			otelhttp.WithFilter(func(r *http.Request) bool {
				return r.URL.Path != "/health"
			}),
		),
	)
	// Panics → Sentry (errors); traces still from OTel → Sentry span processor when DSN is baked in.
	sentryHandler := sentryhttp.New(sentryhttp.Options{Repanic: false})
	handler := sentryHandler.Handle(baseHandler)
	logs.InfoCtx(ctx, "api http server starting", "addr", ":"+cfg.API_PORT)
	if err := http.ListenAndServe(":"+cfg.API_PORT, handler); err != nil {
		logs.ErrorCtx(ctx, "api http server error", "err", err)
		return err
	}
	logs.InfoCtx(ctx, "api service listening")
	return nil
}
