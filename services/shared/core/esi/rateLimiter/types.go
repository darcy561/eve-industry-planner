package ratelimiter

import (
	"net/http"
	"sync"
	"time"

	"golang.org/x/time/rate"
)

// Used to designate which group to use for rate limiting. PrimaryGroup-SecondaryGroup.
type GroupDesignation struct {
	PrimaryGroup   string
	SecondaryGroup string
}

// TokenConsumption tracks token consumption with timestamps for floating window
type TokenConsumption struct {
	Tokens   int
	Consumed time.Time
}

// GroupLimiter holds a limiter and token bucket tracking for ESI rate limiting.
type GroupLimiter struct {
	// Rate limiter for general throttling
	Limiter      *rate.Limiter
	DefaultRate  rate.Limit
	DefaultBurst int
	Name         string

	// Token bucket tracking (floating window)
	mu                    sync.RWMutex
	EnforceTokenRestrictions bool // If true, enforce token limits; if false, only use rate limiter
	TokenLimit            int                // Total tokens allowed (from X-Ratelimit-Limit)
	TokenUsed             int                // Current tokens used
	consumptions          []TokenConsumption // History for floating window (15 min)
	lastUpdate            time.Time
	retryAfter            time.Time     // When to retry after 429
	windowDuration        time.Duration // Token return window (15 minutes)
	lastUsed              time.Time     // Last time this limiter was used for a request
}

// ESIClient manages API requests and per-group dynamic rate limiting.
type ESIClient struct {
	httpClient *http.Client
	baseURL    string
	mu         sync.RWMutex
	limiters   map[string]*GroupLimiter // Key: group name from X-Ratelimit-Group header
	defLim     *GroupLimiter
	// Tracks which paths belong to which groups (discovered dynamically)
	pathToGroup map[string]string
	// Synchronization for unknown groups - prevents concurrent requests to same unknown group
	unknownGroupMutex sync.Mutex
	unknownGroups     map[string]*sync.Mutex // Per-path mutex for unknown groups
	// Cleanup configuration
	cleanupInterval time.Duration // How often to run cleanup (default: 1 hour)
	maxIdleTime     time.Duration // How long a group can be idle before cleanup (default: 24 hours)
}
