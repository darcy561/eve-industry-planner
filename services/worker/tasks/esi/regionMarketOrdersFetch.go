package tasks

import (
	"context"
	"errors"
	"fmt"
	"net/http"
	"net/url"
	"strconv"
	"time"

	rediscore "eve-industry-planner/shared/core/redis"
	"eve-industry-planner/shared/esiclient"
	"eve-industry-planner/shared/httpclient"
	"eve-industry-planner/shared/logs"

	"github.com/redis/go-redis/v9"
)

// regionPageCacheTTL is how long a fetched region order page stays replayable
// for a 304 response.
const regionPageCacheTTL = 24 * time.Hour

// RegionOrdersFetchResult reports what one region pagination pass did.
type RegionOrdersFetchResult struct {
	ETags        map[int]string // ETag per page, for the next refresh
	AllUnchanged bool           // every page answered 304 and replayed from cache
	TotalPages   int            // page count reported by ESI
	TotalBytes   int64          // decoded bytes read from the wire
	CacheSeconds int            // max-age parsed from the first page
}

// FetchRegionMarketOrders walks every page of one region's market order book,
// invoking onOrder for each order — from the wire on 200, from the page cache
// on 304.
//
// Pages are cached unfiltered so the cache stays valid for any station in the
// region; callers apply their own station filter inside onOrder.
func FetchRegionMarketOrders(
	ctx context.Context,
	client esiclient.API,
	redisClient *redis.Client,
	regionID int32,
	prevETags map[int]string,
	onOrder func(esiclient.MarketOrder) error,
) (RegionOrdersFetchResult, error) {
	result := RegionOrdersFetchResult{ETags: make(map[int]string), AllUnchanged: true}

	if client == nil {
		return result, errors.New("ESI client is nil")
	}
	if onOrder == nil {
		return result, errors.New("onOrder callback is nil")
	}
	if prevETags == nil {
		prevETags = make(map[int]string)
	}

	path := fmt.Sprintf("/markets/%d/orders/", regionID)

	for page := 1; ; page++ {
		if err := ctx.Err(); err != nil {
			return result, err
		}

		logs.DebugCtx(ctx, "fetching region market orders page", "region_id", regionID, "page", page)

		pageBytes, err := fetchRegionOrdersPage(ctx, client, redisClient, path, regionID, page, prevETags, &result, onOrder)
		if err != nil {
			return result, err
		}
		result.TotalBytes += pageBytes

		// No X-Pages means the first page is the whole book, rather than looping
		// blind until something errors.
		if result.TotalPages == 0 || page >= result.TotalPages {
			return result, nil
		}
	}
}

// fetchRegionOrdersPage walks one page: a 200 is decoded, cached and fed
// through; a 304 replays what was cached last time.
func fetchRegionOrdersPage(
	ctx context.Context,
	client esiclient.API,
	redisClient *redis.Client,
	path string,
	regionID int32,
	page int,
	prevETags map[int]string,
	result *RegionOrdersFetchResult,
	onOrder func(esiclient.MarketOrder) error,
) (int64, error) {
	stream, err := client.Stream(ctx, esiclient.Request{
		Method: http.MethodGet,
		Path:   path,
		Query: url.Values{
			"datasource": {"tranquility"},
			"order_type": {"all"},
			"page":       {strconv.Itoa(page)},
		},
		Class:       esiclient.ClassBackground,
		IfNoneMatch: prevETags[page],
		Retry:       httpclient.DefaultRetry(),
	})
	if err != nil {
		return 0, err
	}
	defer stream.Body.Close()

	if stream.ETag != "" {
		result.ETags[page] = stream.ETag
	} else if prevETag, ok := prevETags[page]; ok {
		result.ETags[page] = prevETag
	}

	if page == 1 {
		result.CacheSeconds = int(stream.MaxAge.Seconds())
	}
	if result.TotalPages == 0 {
		if xPages := stream.Header.Get("X-Pages"); xPages != "" {
			parsed, err := strconv.Atoi(xPages)
			if err != nil || parsed <= 0 {
				logs.WarnCtx(ctx, "failed to parse X-Pages header", "value", xPages, "error", err)
			} else {
				result.TotalPages = parsed
			}
		}
	}

	if stream.NotModified {
		return 0, replayCachedRegionPage(ctx, redisClient, regionID, page, result, onOrder)
	}
	if stream.Status != http.StatusOK {
		return 0, fmt.Errorf("unexpected status %d fetching region %d page %d", stream.Status, regionID, page)
	}

	// A 200 means this page moved, so the aggregate must be rebuilt from live data.
	result.AllUnchanged = false

	// The page is collected rather than streamed straight through, because it is
	// cached whole for the next pass to replay on a 304.
	orders := make([]esiclient.MarketOrder, 0, 1000)
	if err := httpclient.StreamJSON(stream.Body, func(order esiclient.MarketOrder) error {
		orders = append(orders, order)
		return nil
	}); err != nil {
		return stream.Wire(), fmt.Errorf("decoding market orders: %w", err)
	}

	if redisClient != nil {
		if err := rediscore.SaveRegionMarketOrdersPage(ctx, redisClient, regionID, page, orders, regionPageCacheTTL); err != nil {
			logs.WarnCtx(ctx, "failed caching region orders page", "region_id", regionID, "page", page, "error", err)
		}
	}

	for _, order := range orders {
		if err := onOrder(order); err != nil {
			return stream.Wire(), err
		}
	}
	return stream.Wire(), nil
}

// replayCachedRegionPage feeds a previously cached page back through onOrder
// for a 304. A missing cache entry downgrades the page to "changed", so the
// caller does not treat the region as fully unchanged on incomplete data.
func replayCachedRegionPage(
	ctx context.Context,
	redisClient *redis.Client,
	regionID int32,
	page int,
	result *RegionOrdersFetchResult,
	onOrder func(esiclient.MarketOrder) error,
) error {
	if redisClient == nil {
		logs.WarnCtx(ctx, "redis unavailable for 304 region page replay", "region_id", regionID, "page", page)
		result.AllUnchanged = false
		return nil
	}

	var cached []esiclient.MarketOrder
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
