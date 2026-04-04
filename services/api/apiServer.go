package main

import (
	"fmt"
	"net/http"
	"os"
	"time"

	"eve-industry-planner/api/middleware"
	"eve-industry-planner/api/migrationendpoints"
	"eve-industry-planner/api/staticdata"
	"eve-industry-planner/api/v1endpoints"
	"eve-industry-planner/shared/core/config"
	"eve-industry-planner/shared/shared"
	"eve-industry-planner/shared/shared/logs"

	"github.com/ulule/limiter/v3"
	lredis "github.com/ulule/limiter/v3/drivers/store/redis"
)

type route struct {
	Path    string
	Handler http.HandlerFunc
}

func StartAPIServer(clients *shared.ServiceClients) error {
	if os.Getenv("FAIL_ON_STARTUP") == "true" {
		return fmt.Errorf("startup failure requested via FAIL_ON_STARTUP")
	}

	//creates rate limits for routes and setups up redis store to store them
	publicRateLimit, err := limiter.NewRateFromFormatted("50-S")
	if err != nil {
		logs.Error("failed to create public rate limiter", "err", err)
		return err
	}
	privateRateLimit, err := limiter.NewRateFromFormatted("100-M")
	if err != nil {
		logs.Error("failed to create private rate limiter", "err", err)
		return err
	}
	store, err := lredis.NewStoreWithOptions(clients.Redis, limiter.StoreOptions{
		Prefix:          "limiter",
		CleanUpInterval: 5 * time.Minute,
	})
	if err != nil {
		logs.Error("failed to create redis store", "err", err)
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

	// Global middleware constructors, applied to all routes via groups
	// RequestID should be first so all subsequent middleware and handlers can use it
	globalConstructors := []middleware.MiddlewareConstructor{
		middleware.RequestIDConstructor(),
		middleware.CompressionConstructor(),
	}

	// Public and private groups for v1, with middleware constructors applied after global
	publicGroup := middleware.NewGroup(mux,
		append(globalConstructors,
			middleware.RateLimiterConstructor(store, publicRateLimit),
		)...,
	)
	privateGroup := middleware.NewGroup(mux,
		append(globalConstructors,
			middleware.RateLimiterConstructor(store, privateRateLimit),
			middleware.AuthConstructor(),
		)...,
	)

	// Define public routes (v1)
	publicRoutes := []route{
		{
			Path: "/api/v1/auth/login",
			Handler: func(w http.ResponseWriter, r *http.Request) {
				v1endpoints.AuthHandler(w, r, clients)
			},
		},
		{
			Path: "/api/v1/auth/refresh",
			Handler: func(w http.ResponseWriter, r *http.Request) {
				v1endpoints.RefreshHandler(w, r, clients)
			},
		},
		{
			Path: "/api/v1/auth/jwks",
			Handler: func(w http.ResponseWriter, r *http.Request) {
				v1endpoints.JWKSHandler(w, r)
			},
		},
		{
			Path: "/api/v1/sso/exchange",
			Handler: func(w http.ResponseWriter, r *http.Request) {
				v1endpoints.SSOExchangeHandler(w, r, clients)
			},
		},
		{
			Path: "/api/v1/sso/refresh",
			Handler: func(w http.ResponseWriter, r *http.Request) {
				v1endpoints.SSORefreshHandler(w, r, clients)
			},
		},
		{Path: "/api/v1/systemindexes/query",
			Handler: func(w http.ResponseWriter, r *http.Request) {
				v1endpoints.SystemIndexesHandler(w, r, clients)
			},
		},
		{Path: "/api/v1/marketprices/query",
			Handler: func(w http.ResponseWriter, r *http.Request) {
				v1endpoints.MarketPricesHandler(w, r, clients)
			},
		},
		{
			Path: "/api/v1/feedback",
			Handler: func(w http.ResponseWriter, r *http.Request) {
				v1endpoints.FeedbackHandler(w, r, clients)
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
			Path: "/api/v1/auth/claims/corporations",
			Handler: func(w http.ResponseWriter, r *http.Request) {
				v1endpoints.CorporationsHandler(w, r, clients)
			},
		},
		{
			Path: "/api/v1/user/main",
			Handler: func(w http.ResponseWriter, r *http.Request) {
				v1endpoints.UserMainDocumentHandler(w, r, clients)
			},
		},
		{
			Path: "/api/v1/jobs",
			Handler: func(w http.ResponseWriter, r *http.Request) {
				v1endpoints.JobsRouter(w, r, clients)
			},
		},
		{
			Path: "/api/v1/jobs/",
			Handler: func(w http.ResponseWriter, r *http.Request) {
				v1endpoints.JobsRouter(w, r, clients)
			},
		},
		{
			Path: "/api/v1/groups",
			Handler: func(w http.ResponseWriter, r *http.Request) {
				v1endpoints.GroupsRouter(w, r, clients)
			},
		},
		{
			Path: "/api/v1/groups/",
			Handler: func(w http.ResponseWriter, r *http.Request) {
				v1endpoints.GroupsRouter(w, r, clients)
			},
		},
	}

	// Register private routes (v1)
	for _, route := range privateRoutes {
		privateGroup.HandleFunc(route.Path, route.Handler)
	}

	// Migration-specific groups (separate from v1 handlers)
	migrationPublicGroup := middleware.NewGroup(mux,
		append(globalConstructors,
			middleware.RateLimiterConstructor(store, publicRateLimit),
		)...,
	)
	migrationPrivateGroup := middleware.NewGroup(mux,
		append(globalConstructors,
			middleware.RateLimiterConstructor(store, privateRateLimit),
			middleware.AuthConstructor(),
		)...,
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

	// Migration private routes
	migrationPrivateRoutes := []route{
		{
			Path: "/api/migration/application-settings",
			Handler: func(w http.ResponseWriter, r *http.Request) {
				migrationendpoints.ApplicationSettingsHandler(w, r, clients)
			},
		},
		{
			Path: "/api/migration/firebase-token",
			Handler: func(w http.ResponseWriter, r *http.Request) {
				migrationendpoints.FirebaseTokenHandler(w, r, clients)
			},
		},
	}
	for _, route := range migrationPrivateRoutes {
		migrationPrivateGroup.HandleFunc(route.Path, route.Handler)
	}

	cfg, err := config.LoadConfig()
	if err != nil {
		return err
	}
	logs.Info("api http server starting", "addr", ":"+cfg.API_PORT)
	if err := http.ListenAndServe(":"+cfg.API_PORT, mux); err != nil {
		logs.Error("api http server error", "err", err)
		return err
	}
	logs.Info("api service listening")
	return nil
}
