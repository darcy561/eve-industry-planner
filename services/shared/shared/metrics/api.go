package metrics

import (
	"sync"
	"time"

	"eve-industry-planner/shared/shared/logs"
)

// APISystemIndexesMetrics holds metrics for the system indexes API endpoint
type APISystemIndexesMetrics struct {
	Requests            *Histogram
	RequestsCount       *Counter
	SystemsRequested    *Histogram
	SystemsFound        *Counter
	SystemsNotFound     *Counter
	SystemsNotFoundByID *CounterVec
	Errors              *CounterVec
}

var apiSystemIndexesMetrics *APISystemIndexesMetrics
var apiSystemIndexesOnce sync.Once

// InitAPISystemIndexes initializes and registers metrics for the system indexes API
func InitAPISystemIndexes() *APISystemIndexesMetrics {
	apiSystemIndexesOnce.Do(func() {
		apiSystemIndexesMetrics = &APISystemIndexesMetrics{
			Requests:            &Histogram{},
			RequestsCount:       &Counter{},
			SystemsRequested:    &Histogram{},
			SystemsFound:        &Counter{},
			SystemsNotFound:     &Counter{},
			SystemsNotFoundByID: NewCounterVec(),
			Errors:              NewCounterVec(),
		}
	})
	return apiSystemIndexesMetrics
}

// GetAPISystemIndexes returns the API system indexes metrics, initializing if needed
func GetAPISystemIndexes() *APISystemIndexesMetrics {
	if apiSystemIndexesMetrics == nil {
		return InitAPISystemIndexes()
	}
	return apiSystemIndexesMetrics
}

// APIMarketPricesMetrics holds metrics for the market prices API endpoint
type APIMarketPricesMetrics struct {
	Requests       *Histogram
	RequestsCount  *Counter
	TypesRequested *Histogram
	TypesFound     *Counter
	TypesNotFound  *Counter
	Errors         *CounterVec
}

var apiMarketPricesMetrics *APIMarketPricesMetrics
var apiMarketPricesOnce sync.Once

// InitAPIMarketPrices initializes and registers metrics for the market prices API
func InitAPIMarketPrices() *APIMarketPricesMetrics {
	apiMarketPricesOnce.Do(func() {
		apiMarketPricesMetrics = &APIMarketPricesMetrics{
			Requests:       &Histogram{},
			RequestsCount:  &Counter{},
			TypesRequested: &Histogram{},
			TypesFound:     &Counter{},
			TypesNotFound:  &Counter{},
			Errors:         NewCounterVec(),
		}
	})
	return apiMarketPricesMetrics
}

// GetAPIMarketPrices returns the API market prices metrics, initializing if needed
func GetAPIMarketPrices() *APIMarketPricesMetrics {
	if apiMarketPricesMetrics == nil {
		return InitAPIMarketPrices()
	}
	return apiMarketPricesMetrics
}

// APIAuthLoginMetrics holds metrics for the auth login API endpoint
type APIAuthLoginMetrics struct {
	Requests      *Histogram
	RequestsCount *Counter
	Successes     *Counter
	Errors        *CounterVec
}

var apiAuthLoginMetrics *APIAuthLoginMetrics
var apiAuthLoginOnce sync.Once

// InitAPIAuthLogin initializes and registers metrics for the auth login API
func InitAPIAuthLogin() *APIAuthLoginMetrics {
	apiAuthLoginOnce.Do(func() {
		apiAuthLoginMetrics = &APIAuthLoginMetrics{
			Requests:      &Histogram{},
			RequestsCount: &Counter{},
			Successes:     &Counter{},
			Errors:        NewCounterVec(),
		}
	})
	return apiAuthLoginMetrics
}

// GetAPIAuthLogin returns the API auth login metrics, initializing if needed
func GetAPIAuthLogin() *APIAuthLoginMetrics {
	if apiAuthLoginMetrics == nil {
		return InitAPIAuthLogin()
	}
	return apiAuthLoginMetrics
}

// APIAuthRefreshMetrics holds metrics for the auth refresh API endpoint
type APIAuthRefreshMetrics struct {
	Requests      *Histogram
	RequestsCount *Counter
	Successes     *Counter
	Errors        *CounterVec
}

var apiAuthRefreshMetrics *APIAuthRefreshMetrics
var apiAuthRefreshOnce sync.Once

// InitAPIAuthRefresh initializes and registers metrics for the auth refresh API
func InitAPIAuthRefresh() *APIAuthRefreshMetrics {
	apiAuthRefreshOnce.Do(func() {
		apiAuthRefreshMetrics = &APIAuthRefreshMetrics{
			Requests:      &Histogram{},
			RequestsCount: &Counter{},
			Successes:     &Counter{},
			Errors:        NewCounterVec(),
		}
	})
	return apiAuthRefreshMetrics
}

// GetAPIAuthRefresh returns the API auth refresh metrics, initializing if needed
func GetAPIAuthRefresh() *APIAuthRefreshMetrics {
	if apiAuthRefreshMetrics == nil {
		return InitAPIAuthRefresh()
	}
	return apiAuthRefreshMetrics
}

// APIAuthJWKSMetrics holds metrics for the auth JWKS API endpoint
type APIAuthJWKSMetrics struct {
	Requests      *Histogram
	RequestsCount *Counter
	Errors        *CounterVec
}

var apiAuthJWKSMetrics *APIAuthJWKSMetrics
var apiAuthJWKSOnce sync.Once

// InitAPIAuthJWKS initializes and registers metrics for the auth JWKS API
func InitAPIAuthJWKS() *APIAuthJWKSMetrics {
	apiAuthJWKSOnce.Do(func() {
		apiAuthJWKSMetrics = &APIAuthJWKSMetrics{
			Requests:      &Histogram{},
			RequestsCount: &Counter{},
			Errors:        NewCounterVec(),
		}
	})
	return apiAuthJWKSMetrics
}

// GetAPIAuthJWKS returns the API auth JWKS metrics, initializing if needed
func GetAPIAuthJWKS() *APIAuthJWKSMetrics {
	if apiAuthJWKSMetrics == nil {
		return InitAPIAuthJWKS()
	}
	return apiAuthJWKSMetrics
}

// APISSOExchangeMetrics holds metrics for the SSO token exchange API endpoint
type APISSOExchangeMetrics struct {
	Requests      *Histogram
	RequestsCount *Counter
	Successes     *Counter
	Errors        *CounterVec
}

var apiSSOExchangeMetrics *APISSOExchangeMetrics
var apiSSOExchangeOnce sync.Once

// InitAPISSOExchange initializes and registers metrics for the SSO token exchange API
func InitAPISSOExchange() *APISSOExchangeMetrics {
	apiSSOExchangeOnce.Do(func() {
		apiSSOExchangeMetrics = &APISSOExchangeMetrics{
			Requests:      &Histogram{},
			RequestsCount: &Counter{},
			Successes:     &Counter{},
			Errors:        NewCounterVec(),
		}
	})
	return apiSSOExchangeMetrics
}

// GetAPISSOExchange returns the API SSO token exchange metrics, initializing if needed
func GetAPISSOExchange() *APISSOExchangeMetrics {
	if apiSSOExchangeMetrics == nil {
		return InitAPISSOExchange()
	}
	return apiSSOExchangeMetrics
}

// APISSORefreshMetrics holds metrics for the SSO token refresh API endpoint
type APISSORefreshMetrics struct {
	Requests      *Histogram
	RequestsCount *Counter
	Successes     *Counter
	Errors        *CounterVec
}

var apiSSORefreshMetrics *APISSORefreshMetrics
var apiSSORefreshOnce sync.Once

// InitAPISSORefresh initializes and registers metrics for the SSO token refresh API
func InitAPISSORefresh() *APISSORefreshMetrics {
	apiSSORefreshOnce.Do(func() {
		apiSSORefreshMetrics = &APISSORefreshMetrics{
			Requests:      &Histogram{},
			RequestsCount: &Counter{},
			Successes:     &Counter{},
			Errors:        NewCounterVec(),
		}
	})
	return apiSSORefreshMetrics
}

// GetAPISSORefresh returns the API SSO token refresh metrics, initializing if needed
func GetAPISSORefresh() *APISSORefreshMetrics {
	if apiSSORefreshMetrics == nil {
		return InitAPISSORefresh()
	}
	return apiSSORefreshMetrics
}

// APIJobsMetrics holds metrics for the jobs API endpoints
type APIJobsMetrics struct {
	Requests      *Histogram
	RequestsCount *Counter
	Successes     *Counter
	JobsRequested *Histogram
	JobsDeleted   *Counter
	JobsSaved     *Counter
	Errors        *CounterVec
}

var apiJobsMetrics *APIJobsMetrics
var apiJobsOnce sync.Once

// InitAPIJobs initializes and registers metrics for the jobs API
func InitAPIJobs() *APIJobsMetrics {
	apiJobsOnce.Do(func() {
		apiJobsMetrics = &APIJobsMetrics{
			Requests:      &Histogram{},
			RequestsCount: &Counter{},
			Successes:     &Counter{},
			JobsRequested: &Histogram{},
			JobsDeleted:   &Counter{},
			JobsSaved:     &Counter{},
			Errors:        NewCounterVec(),
		}
	})
	return apiJobsMetrics
}

// GetAPIJobs returns the API jobs metrics, initializing if needed
func GetAPIJobs() *APIJobsMetrics {
	if apiJobsMetrics == nil {
		return InitAPIJobs()
	}
	return apiJobsMetrics
}

// APIGroupsMetrics holds metrics for the groups API endpoints
type APIGroupsMetrics struct {
	Requests        *Histogram
	RequestsCount   *Counter
	Successes       *Counter
	GroupsRequested *Histogram
	GroupsDeleted   *Counter
	GroupsSaved     *Counter
	Errors          *CounterVec
}

var apiGroupsMetrics *APIGroupsMetrics
var apiGroupsOnce sync.Once

// InitAPIGroups initializes and registers metrics for the groups API
func InitAPIGroups() *APIGroupsMetrics {
	apiGroupsOnce.Do(func() {
		apiGroupsMetrics = &APIGroupsMetrics{
			Requests:        &Histogram{},
			RequestsCount:   &Counter{},
			Successes:       &Counter{},
			GroupsRequested: &Histogram{},
			GroupsDeleted:   &Counter{},
			GroupsSaved:     &Counter{},
			Errors:          NewCounterVec(),
		}
	})
	return apiGroupsMetrics
}

// GetAPIGroups returns the API groups metrics, initializing if needed
func GetAPIGroups() *APIGroupsMetrics {
	if apiGroupsMetrics == nil {
		return InitAPIGroups()
	}
	return apiGroupsMetrics
}

// LogAPIMetrics logs all API metrics as structured JSON for Dozzle viewing
func LogAPIMetrics() {
	logger := logs.Component("metrics")

	// Log System Indexes metrics
	if apiSystemIndexesMetrics != nil {
		logger.Info("API System Indexes Metrics",
			"requests_count", apiSystemIndexesMetrics.RequestsCount.Get(),
			"requests_avg_seconds", apiSystemIndexesMetrics.Requests.GetAvg(),
			"systems_requested_avg", apiSystemIndexesMetrics.SystemsRequested.GetAvg(),
			"systems_found_total", apiSystemIndexesMetrics.SystemsFound.Get(),
			"systems_not_found_total", apiSystemIndexesMetrics.SystemsNotFound.Get(),
			"systems_not_found_by_id", apiSystemIndexesMetrics.SystemsNotFoundByID.GetCounters(),
			"errors", apiSystemIndexesMetrics.Errors.GetCounters(),
		)
	}

	// Log Market Prices metrics
	if apiMarketPricesMetrics != nil {
		logger.Info("API Market Prices Metrics",
			"requests_count", apiMarketPricesMetrics.RequestsCount.Get(),
			"requests_avg_seconds", apiMarketPricesMetrics.Requests.GetAvg(),
			"types_requested_avg", apiMarketPricesMetrics.TypesRequested.GetAvg(),
			"types_found_total", apiMarketPricesMetrics.TypesFound.Get(),
			"types_not_found_total", apiMarketPricesMetrics.TypesNotFound.Get(),
			"errors", apiMarketPricesMetrics.Errors.GetCounters(),
		)
	}

	// Log Auth Login metrics
	if apiAuthLoginMetrics != nil {
		logger.Info("API Auth Login Metrics",
			"requests_count", apiAuthLoginMetrics.RequestsCount.Get(),
			"requests_avg_seconds", apiAuthLoginMetrics.Requests.GetAvg(),
			"successes_total", apiAuthLoginMetrics.Successes.Get(),
			"errors", apiAuthLoginMetrics.Errors.GetCounters(),
		)
	}

	// Log Auth Refresh metrics
	if apiAuthRefreshMetrics != nil {
		logger.Info("API Auth Refresh Metrics",
			"requests_count", apiAuthRefreshMetrics.RequestsCount.Get(),
			"requests_avg_seconds", apiAuthRefreshMetrics.Requests.GetAvg(),
			"successes_total", apiAuthRefreshMetrics.Successes.Get(),
			"errors", apiAuthRefreshMetrics.Errors.GetCounters(),
		)
	}

	// Log Auth JWKS metrics
	if apiAuthJWKSMetrics != nil {
		logger.Info("API Auth JWKS Metrics",
			"requests_count", apiAuthJWKSMetrics.RequestsCount.Get(),
			"requests_avg_seconds", apiAuthJWKSMetrics.Requests.GetAvg(),
			"errors", apiAuthJWKSMetrics.Errors.GetCounters(),
		)
	}

	// Log SSO Exchange metrics
	if apiSSOExchangeMetrics != nil {
		logger.Info("API SSO Exchange Metrics",
			"requests_count", apiSSOExchangeMetrics.RequestsCount.Get(),
			"requests_avg_seconds", apiSSOExchangeMetrics.Requests.GetAvg(),
			"successes_total", apiSSOExchangeMetrics.Successes.Get(),
			"errors", apiSSOExchangeMetrics.Errors.GetCounters(),
		)
	}

	// Log SSO Refresh metrics
	if apiSSORefreshMetrics != nil {
		logger.Info("API SSO Refresh Metrics",
			"requests_count", apiSSORefreshMetrics.RequestsCount.Get(),
			"requests_avg_seconds", apiSSORefreshMetrics.Requests.GetAvg(),
			"successes_total", apiSSORefreshMetrics.Successes.Get(),
			"errors", apiSSORefreshMetrics.Errors.GetCounters(),
		)
	}

	// Log Jobs metrics
	if apiJobsMetrics != nil {
		logger.Info("API Jobs Metrics",
			"requests_count", apiJobsMetrics.RequestsCount.Get(),
			"requests_avg_seconds", apiJobsMetrics.Requests.GetAvg(),
			"successes_total", apiJobsMetrics.Successes.Get(),
			"jobs_requested_avg", apiJobsMetrics.JobsRequested.GetAvg(),
			"jobs_deleted_total", apiJobsMetrics.JobsDeleted.Get(),
			"jobs_saved_total", apiJobsMetrics.JobsSaved.Get(),
			"errors", apiJobsMetrics.Errors.GetCounters(),
		)
	}

	// Log Groups metrics
	if apiGroupsMetrics != nil {
		logger.Info("API Groups Metrics",
			"requests_count", apiGroupsMetrics.RequestsCount.Get(),
			"requests_avg_seconds", apiGroupsMetrics.Requests.GetAvg(),
			"successes_total", apiGroupsMetrics.Successes.Get(),
			"groups_requested_avg", apiGroupsMetrics.GroupsRequested.GetAvg(),
			"groups_deleted_total", apiGroupsMetrics.GroupsDeleted.Get(),
			"groups_saved_total", apiGroupsMetrics.GroupsSaved.Get(),
			"errors", apiGroupsMetrics.Errors.GetCounters(),
		)
	}
}

// StartAPIMetricsLogger starts a goroutine that periodically logs API metrics
func StartAPIMetricsLogger(interval time.Duration) {
	go func() {
		ticker := time.NewTicker(interval)
		defer ticker.Stop()

		for range ticker.C {
			LogAPIMetrics()
		}
	}()
}

// LogRequestMetrics logs per-request metrics for slow requests or errors
// This provides real-time visibility in Dozzle for important events
func LogRequestMetrics(endpoint string, duration time.Duration, status string, kv ...any) {
	logger := logs.Component("api_request")

	// Log slow requests (> 1 second) as warnings
	if duration > 1*time.Second {
		fields := append([]any{
			"endpoint", endpoint,
			"duration_ms", duration.Milliseconds(),
			"duration_seconds", duration.Seconds(),
			"status", status,
			"slow_request", true,
		}, kv...)
		logger.Warn("slow API request", fields...)
		return
	}

	// Log errors immediately (status indicates error type)
	if status != "success" && status != "" {
		fields := append([]any{
			"endpoint", endpoint,
			"duration_ms", duration.Milliseconds(),
			"status", status,
		}, kv...)
		logger.Warn("API request error", fields...)
		return
	}

	// For fast successful requests, only log if explicitly requested or if interesting metrics
	// (This keeps logs clean while still capturing important info)
	if len(kv) > 0 {
		fields := append([]any{
			"endpoint", endpoint,
			"duration_ms", duration.Milliseconds(),
			"status", status,
		}, kv...)
		logger.Debug("API request", fields...)
	}
}
