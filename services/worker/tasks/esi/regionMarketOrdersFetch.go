package tasks

import (
	"compress/gzip"
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"strconv"
	"time"

	rediscore "eve-industry-planner/shared/core/redis"
	"eve-industry-planner/shared/logs"
	esicore "eve-industry-planner/worker/esi"
	esiratelimiter "eve-industry-planner/worker/ratelimiter"

	"github.com/redis/go-redis/v9"
)

// regionPageCacheTTL is how long a fetched region order page stays replayable for a 304 response.
const regionPageCacheTTL = 24 * time.Hour

// ESIMarketOrder represents an individual market order from ESI.
type ESIMarketOrder struct {
	Duration     int32     `json:"duration"`
	IsBuyOrder   bool      `json:"is_buy_order"`
	Issued       time.Time `json:"issued"`
	LocationID   int64     `json:"location_id"`
	MinVolume    int32     `json:"min_volume"`
	OrderID      int64     `json:"order_id"`
	Price        float64   `json:"price"`
	Range        string    `json:"range"`
	SystemID     int32     `json:"system_id"`
	TypeID       int32     `json:"type_id"`
	VolumeRemain int32     `json:"volume_remain"`
	VolumeTotal  int32     `json:"volume_total"`
}

// RegionOrdersFetchResult reports what one region pagination pass did.
type RegionOrdersFetchResult struct {
	ETags        map[int]string // ETag per page, for the next refresh
	AllUnchanged bool           // every page answered 304 and replayed from cache
	TotalPages   int            // page count reported by ESI
	TotalBytes   int64          // decoded bytes read from the wire
	CacheSeconds int            // max-age parsed from the first page
}

// FetchRegionMarketOrders walks every page of one region's market order book and invokes
// onOrder for each order, from the wire on 200 and from the page cache on 304.
//
// Pages are cached unfiltered so the cache stays valid for any station in the region; callers
// apply their own station filter inside onOrder.
func FetchRegionMarketOrders(ctx context.Context, esiClient esiratelimiter.ClientInterface, redisClient *redis.Client, regionID int32, prevETags map[int]string, onOrder func(ESIMarketOrder) error) (RegionOrdersFetchResult, error) {
	result := RegionOrdersFetchResult{ETags: make(map[int]string), AllUnchanged: true}

	if esiClient == nil {
		return result, errors.New("ESI client is nil")
	}
	if onOrder == nil {
		return result, errors.New("onOrder callback is nil")
	}
	if prevETags == nil {
		prevETags = make(map[int]string)
	}

	path := fmt.Sprintf("/markets/%d/orders/", regionID)
	groupDesignation := esiratelimiter.GroupDesignation{PrimaryGroup: "market-order"}

	page := 1
	for {
		if err := ctx.Err(); err != nil {
			return result, err
		}

		queryPath := path + "?datasource=tranquility&order_type=all&page=" + strconv.Itoa(page)

		headers := map[string]string{
			"Accept":               "application/json",
			"Accept-Encoding":      "gzip",
			"X-Compatibility-Date": esicore.CompatibilityDate,
		}
		if prevETag, ok := prevETags[page]; ok && prevETag != "" {
			headers["If-None-Match"] = prevETag
		}

		logs.DebugCtx(ctx, "fetching region market orders page", "region_id", regionID, "page", page)

		resp, err := DoRequestWithRetry(ctx, 4, queryPath, func() (*http.Response, error) {
			return esiClient.DoRequest(ctx, http.MethodGet, queryPath, headers, groupDesignation)
		})
		if err != nil {
			return result, err
		}
		if resp == nil {
			return result, errors.New("nil HTTP response")
		}

		pageBytes, err := consumeRegionOrdersPage(ctx, resp, redisClient, regionID, page, prevETags, &result, onOrder)
		resp.Body.Close()
		if err != nil {
			return result, err
		}
		result.TotalBytes += pageBytes

		if result.TotalPages > 0 && page >= result.TotalPages {
			break
		}
		if result.TotalPages == 0 {
			// No X-Pages header: treat the first page as the whole book rather than looping blind.
			break
		}
		page++
	}

	return result, nil
}

// consumeRegionOrdersPage handles one page response: header extraction, then either a streaming
// decode (200) or a replay of the cached page (304). Returns bytes read from the wire.
func consumeRegionOrdersPage(ctx context.Context, resp *http.Response, redisClient *redis.Client, regionID int32, page int, prevETags map[int]string, result *RegionOrdersFetchResult, onOrder func(ESIMarketOrder) error) (int64, error) {
	if etag := resp.Header.Get("ETag"); etag != "" {
		result.ETags[page] = etag
	} else if prevETag, ok := prevETags[page]; ok {
		result.ETags[page] = prevETag
	}

	if page == 1 {
		result.CacheSeconds = parseCacheSeconds(resp)
	}

	if result.TotalPages == 0 {
		if xPages := resp.Header.Get("X-Pages"); xPages != "" {
			if parsed, err := strconv.Atoi(xPages); err == nil && parsed > 0 {
				result.TotalPages = parsed
			} else {
				logs.WarnCtx(ctx, "failed to parse X-Pages header", "value", xPages, "error", err)
			}
		}
	}

	if resp.StatusCode == http.StatusNotModified {
		return 0, replayCachedRegionPage(ctx, redisClient, regionID, page, result, onOrder)
	}

	if resp.StatusCode != http.StatusOK {
		return 0, fmt.Errorf("unexpected status %d fetching region %d page %d", resp.StatusCode, regionID, page)
	}

	// A 200 means this page moved, so the aggregate must be rebuilt from live data.
	result.AllUnchanged = false

	orders, bytesRead, err := decodeRegionOrdersPage(resp)
	if err != nil {
		return bytesRead, err
	}

	if redisClient != nil {
		if err := rediscore.SaveRegionMarketOrdersPage(ctx, redisClient, regionID, page, orders, regionPageCacheTTL); err != nil {
			logs.WarnCtx(ctx, "failed caching region orders page", "region_id", regionID, "page", page, "error", err)
		}
	}

	for _, order := range orders {
		if err := onOrder(order); err != nil {
			return bytesRead, err
		}
	}

	return bytesRead, nil
}

// replayCachedRegionPage feeds a previously cached page back through onOrder for a 304 response.
// A missing cache entry downgrades the page to "changed" so the caller does not treat the
// region as fully unchanged on incomplete data.
func replayCachedRegionPage(ctx context.Context, redisClient *redis.Client, regionID int32, page int, result *RegionOrdersFetchResult, onOrder func(ESIMarketOrder) error) error {
	if redisClient == nil {
		logs.WarnCtx(ctx, "redis unavailable for 304 region page replay", "region_id", regionID, "page", page)
		result.AllUnchanged = false
		return nil
	}

	var cached []ESIMarketOrder
	if err := rediscore.GetRegionMarketOrdersPage(ctx, redisClient, regionID, page, &cached); err != nil {
		if errors.Is(err, redis.Nil) {
			logs.WarnCtx(ctx, "cache missing for 304 region page", "region_id", regionID, "page", page)
			result.AllUnchanged = false
			return nil
		}
		return err
	}

	for _, order := range cached {
		if err := onOrder(order); err != nil {
			return err
		}
	}

	return nil
}

// decodeRegionOrdersPage reads one page body, transparently handling gzip, and reports bytes read.
func decodeRegionOrdersPage(resp *http.Response) ([]ESIMarketOrder, int64, error) {
	counter := &countingReader{r: resp.Body}

	var reader io.Reader = counter
	if resp.Header.Get("Content-Encoding") == "gzip" {
		gz, err := gzip.NewReader(counter)
		if err != nil {
			return nil, counter.n, fmt.Errorf("creating gzip reader: %w", err)
		}
		defer gz.Close()
		reader = gz
	}

	var orders []ESIMarketOrder
	if err := json.NewDecoder(reader).Decode(&orders); err != nil {
		return nil, counter.n, fmt.Errorf("decoding market orders: %w", err)
	}

	return orders, counter.n, nil
}
