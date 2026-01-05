package metrics

import (
	"fmt"
	"sync"
	"sync/atomic"
	"time"

	"eve-industry-planner/shared/shared/logs"
)

// Simple in-memory metrics implementation for Dozzle log viewing

// Counter is a simple counter metric
type Counter struct {
	value atomic.Uint64
}

// Inc increments the counter by 1
func (c *Counter) Inc() {
	c.value.Add(1)
}

// Add adds the given value to the counter
func (c *Counter) Add(delta float64) {
	c.value.Add(uint64(delta))
}

// Get returns the current counter value
func (c *Counter) Get() uint64 {
	return c.value.Load()
}

// Gauge is a simple gauge metric
type Gauge struct {
	value atomic.Uint64
}

// Set sets the gauge to the given value
func (g *Gauge) Set(value float64) {
	g.value.Store(uint64(value))
}

// Get returns the current gauge value
func (g *Gauge) Get() uint64 {
	return g.value.Load()
}

// Histogram is a simple histogram metric
type Histogram struct {
	mu           sync.RWMutex
	observations []float64
	sum          float64
	count        uint64
}

// Observe records an observation
func (h *Histogram) Observe(value float64) {
	h.mu.Lock()
	defer h.mu.Unlock()
	h.observations = append(h.observations, value)
	h.sum += value
	h.count++
	// Keep only last 1000 observations to prevent memory bloat
	if len(h.observations) > 1000 {
		h.observations = h.observations[len(h.observations)-1000:]
	}
}

// GetCount returns the number of observations
func (h *Histogram) GetCount() uint64 {
	h.mu.RLock()
	defer h.mu.RUnlock()
	return h.count
}

// GetSum returns the sum of all observations
func (h *Histogram) GetSum() float64 {
	h.mu.RLock()
	defer h.mu.RUnlock()
	return h.sum
}

// GetAvg returns the average of all observations
func (h *Histogram) GetAvg() float64 {
	h.mu.RLock()
	defer h.mu.RUnlock()
	if h.count == 0 {
		return 0
	}
	return h.sum / float64(h.count)
}

// CounterVec is a counter with labels
type CounterVec struct {
	mu       sync.RWMutex
	counters map[string]*Counter
}

// NewCounterVec creates a new CounterVec
func NewCounterVec() *CounterVec {
	return &CounterVec{
		counters: make(map[string]*Counter),
	}
}

// WithLabelValues returns a Counter for the given label values
func (cv *CounterVec) WithLabelValues(labels ...string) *Counter {
	key := ""
	for i, label := range labels {
		if i > 0 {
			key += ","
		}
		key += label
	}

	cv.mu.Lock()
	defer cv.mu.Unlock()

	if counter, ok := cv.counters[key]; ok {
		return counter
	}

	counter := &Counter{}
	cv.counters[key] = counter
	return counter
}

// GetCounters returns all counters with their labels
func (cv *CounterVec) GetCounters() map[string]uint64 {
	cv.mu.RLock()
	defer cv.mu.RUnlock()

	result := make(map[string]uint64)
	for key, counter := range cv.counters {
		result[key] = counter.Get()
	}
	return result
}

// GaugeVec is a gauge with labels
type GaugeVec struct {
	mu     sync.RWMutex
	gauges map[string]*Gauge
}

// NewGaugeVec creates a new GaugeVec
func NewGaugeVec() *GaugeVec {
	return &GaugeVec{
		gauges: make(map[string]*Gauge),
	}
}

// WithLabelValues returns a Gauge for the given label values
func (gv *GaugeVec) WithLabelValues(labels ...string) *Gauge {
	key := ""
	for i, label := range labels {
		if i > 0 {
			key += ","
		}
		key += label
	}

	gv.mu.Lock()
	defer gv.mu.Unlock()

	if gauge, ok := gv.gauges[key]; ok {
		return gauge
	}

	gauge := &Gauge{}
	gv.gauges[key] = gauge
	return gauge
}

// GetGauges returns all gauges with their labels
func (gv *GaugeVec) GetGauges() map[string]uint64 {
	gv.mu.RLock()
	defer gv.mu.RUnlock()

	result := make(map[string]uint64)
	for key, gauge := range gv.gauges {
		result[key] = gauge.Get()
	}
	return result
}

// ESIIndustrySystemsMetrics holds all metrics for ESI industry systems operations
type ESIIndustrySystemsMetrics struct {
	Requests    *Histogram
	Bytes       *Counter
	Items       *Counter
	LastUpdated *Gauge
	NextRefresh *Gauge
	Errors      *CounterVec
}

var industrySystemsMetrics *ESIIndustrySystemsMetrics
var industrySystemsOnce sync.Once

// InitESIIndustrySystems initializes and registers metrics for ESI industry systems
func InitESIIndustrySystems() *ESIIndustrySystemsMetrics {
	industrySystemsOnce.Do(func() {
		industrySystemsMetrics = &ESIIndustrySystemsMetrics{
			Requests:    &Histogram{},
			Bytes:       &Counter{},
			Items:       &Counter{},
			LastUpdated: &Gauge{},
			NextRefresh: &Gauge{},
			Errors:      NewCounterVec(),
		}
	})
	return industrySystemsMetrics
}

// GetESIIndustrySystems returns the ESI industry systems metrics, initializing if needed
func GetESIIndustrySystems() *ESIIndustrySystemsMetrics {
	if industrySystemsMetrics == nil {
		return InitESIIndustrySystems()
	}
	return industrySystemsMetrics
}

// ESIMarketPricesMetrics holds all metrics for ESI market prices operations
// Note: LastUpdated and NextRefresh represent the most recent update from ANY market prices task
// (either market orders refresh or adjusted prices refresh), not a unified refresh cycle
type ESIMarketPricesMetrics struct {
	Requests    *Histogram
	Bytes       *Counter
	Items       *Counter
	LastUpdated *Gauge // Most recent completion time from either market orders or adjusted prices refresh
	NextRefresh *Gauge // Next refresh time from the most recent task's cache headers (varies by task)
	Errors      *CounterVec
}

var marketPricesMetrics *ESIMarketPricesMetrics
var marketPricesOnce sync.Once

// InitESIMarketPrices initializes and registers metrics for ESI market prices
func InitESIMarketPrices() *ESIMarketPricesMetrics {
	marketPricesOnce.Do(func() {
		marketPricesMetrics = &ESIMarketPricesMetrics{
			Requests:    &Histogram{},
			Bytes:       &Counter{},
			Items:       &Counter{},
			LastUpdated: &Gauge{},
			NextRefresh: &Gauge{},
			Errors:      NewCounterVec(),
		}
	})
	return marketPricesMetrics
}

// GetESIMarketPrices returns the ESI market prices metrics, initializing if needed
func GetESIMarketPrices() *ESIMarketPricesMetrics {
	if marketPricesMetrics == nil {
		return InitESIMarketPrices()
	}
	return marketPricesMetrics
}

// formatTimestamp converts Unix milliseconds to a readable date string
// Returns "never" if timestamp is 0, otherwise returns RFC3339 formatted date
func formatTimestamp(timestamp uint64) string {
	if timestamp == 0 {
		return "never"
	}
	return time.UnixMilli(int64(timestamp)).Format(time.RFC3339)
}

// formatBytes converts bytes to a human-readable string (KB, MB, GB, TB)
func formatBytes(bytes uint64) string {
	const unit = 1024
	if bytes < unit {
		return fmt.Sprintf("%d B", bytes)
	}
	div, exp := uint64(unit), 0
	for n := bytes / unit; n >= unit; n /= unit {
		div *= unit
		exp++
	}
	units := []string{"KB", "MB", "GB", "TB"}
	if exp >= len(units) {
		exp = len(units) - 1
		div = uint64(1) << (exp * 10)
	}
	return fmt.Sprintf("%.2f %s", float64(bytes)/float64(div), units[exp])
}

// LogMetrics logs all metrics as structured JSON for Dozzle viewing
func LogMetrics() {
	logger := logs.Component("metrics")

	// Log ESI Industry Systems metrics
	if industrySystemsMetrics != nil {
		logger.Info("ESI Industry Systems Metrics",
			"requests_count", industrySystemsMetrics.Requests.GetCount(),
			"requests_avg_seconds", industrySystemsMetrics.Requests.GetAvg(),
			"bytes_total", formatBytes(industrySystemsMetrics.Bytes.Get()),
			"items_total", industrySystemsMetrics.Items.Get(),
			"errors", industrySystemsMetrics.Errors.GetCounters(),
		)
	}

	// Log ESI Market Prices metrics
	// These metrics aggregate data from multiple tasks (market orders and adjusted prices)
	if marketPricesMetrics != nil {
		logger.Info("ESI Market Prices Metrics",
			"requests_count", marketPricesMetrics.Requests.GetCount(),
			"requests_avg_seconds", marketPricesMetrics.Requests.GetAvg(),
			"bytes_total", formatBytes(marketPricesMetrics.Bytes.Get()),
			"items_total", marketPricesMetrics.Items.Get(),
			"errors", marketPricesMetrics.Errors.GetCounters(),
		)
	}
}

// StartMetricsLogger starts a goroutine that periodically logs metrics
func StartMetricsLogger(interval time.Duration) {
	go func() {
		ticker := time.NewTicker(interval)
		defer ticker.Stop()

		for range ticker.C {
			LogMetrics()
		}
	}()
}
