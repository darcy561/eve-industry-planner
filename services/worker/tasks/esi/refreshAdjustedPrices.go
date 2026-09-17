package esi

import (
	"context"
	"eve-industry-planner/shared/jsoncodec"
	"eve-industry-planner/worker/taskrun"
	"fmt"
	"net/http"
	"time"

	esitypes "eve-industry-planner/shared/core/esi/types"
	"eve-industry-planner/shared/esiclient"
	"eve-industry-planner/shared/httpclient"
	"eve-industry-planner/shared/logs"
	eipredis "eve-industry-planner/shared/redis"
)

// RefreshAdjustedPrices stores ESI's adjusted prices, skipping the write
// entirely when the ETag says nothing changed. An unavailable server comes back
// as a downtime refusal from the request itself, so there is no pre-flight call.
func RefreshAdjustedPrices(ctx context.Context, deps *taskrun.Dependencies) error {
	ctx, cancel := context.WithTimeout(ctx, 15*time.Second)
	defer cancel()

	logs.InfoCtx(ctx, "Adjusted Prices Refresh Task Received")

	release, held := deps.Redis.AcquireRefresh(ctx, eipredis.DatasetMarketPrices.Dataset())
	if !held {
		return nil
	}
	defer release()

	cache := deps.Redis.Cache(eipredis.DatasetMarketPrices)
	prevETag, err := cache.ETag(ctx)
	if err != nil {
		logs.DebugCtx(ctx, "failed to get previous ETag", "error", err)
	}

	start := time.Now()
	logs.DebugCtx(ctx, "Adjusted Prices Refresh Started", "etag_used", prevETag)

	newETag, notModified, maxAge, err := streamAdjustedPrices(ctx, deps.ESI, prevETag, func(price esitypes.AdjustedPrice) error {
		return cache.PutEntry(ctx, price.TypeID, price)
	})
	if err != nil {
		return HandleStreamError(ctx, err, "adjusted prices refresh")
	}

	// A 304 carries a fresh max-age too, so the next refresh is rescheduled
	// whether or not the data changed.
	recordNextRefresh(ctx, deps.Redis, eipredis.DatasetMarketPrices.Dataset(), maxAge)

	if notModified {
		logs.InfoCtx(ctx, "ESI adjusted prices not modified (ETag match)")
		return nil
	}

	if err := cache.PutETag(ctx, newETag); err != nil {
		logs.ErrorCtx(ctx, "failed to save ETag", "error", err, "reason", "etag_save_error")
		return fmt.Errorf("failed to save ETag: %w", err)
	}

	if err := cache.PutLastUpdated(ctx, time.Now()); err != nil {
		logs.WarnCtx(ctx, "failed to save last updated timestamp", "error", err, "reason", "last_updated_save_error")
		return fmt.Errorf("failed to save last updated timestamp: %w", err)
	}

	logs.InfoCtx(ctx, "Adjusted Prices Refresh Complete", "duration_ms", time.Since(start).Milliseconds())
	return nil
}

// streamAdjustedPrices walks ESI's price list, handing each row to onItem as
// it decodes so the whole body is never held.
func streamAdjustedPrices(
	ctx context.Context,
	client esiclient.API,
	etag string,
	onItem func(esitypes.AdjustedPrice) error,
) (newETag string, notModified bool, maxAge time.Duration, err error) {
	if client == nil {
		return "", false, 0, fmt.Errorf("ESI client is nil")
	}

	stream, err := client.Stream(ctx, esiclient.Request{
		Method:      http.MethodGet,
		Path:        "/markets/prices/",
		Class:       esiclient.ClassBackground,
		IfNoneMatch: etag,
		Retry:       httpclient.DefaultRetry(),
	})
	if err != nil {
		return "", false, 0, err
	}
	defer stream.Body.Close()

	if stream.NotModified {
		return stream.ETag, true, stream.MaxAge, nil
	}
	if stream.Status != http.StatusOK {
		return "", false, 0, fmt.Errorf("ESI adjusted prices: unexpected status %d", stream.Status)
	}

	// ESI reports both an adjusted and an average price; only the adjusted one is
	// stored, and the row is stamped on arrival so a reader can tell how old it is.
	stamped := time.Now().UnixMilli()
	walk := func(price esiclient.TypePrice) error {
		return onItem(esitypes.AdjustedPrice{
			TypeID:        price.TypeID,
			AdjustedPrice: price.AdjustedPrice,
			LastUpdated:   stamped,
		})
	}
	if err := jsoncodec.StreamArray(stream.Body, walk); err != nil {
		return "", false, 0, err
	}
	return stream.ETag, false, stream.MaxAge, nil
}
