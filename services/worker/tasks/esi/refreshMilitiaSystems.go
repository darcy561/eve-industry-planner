package esi

import (
	"context"
	"fmt"
	"net/http"
	"time"

	"eve-industry-planner/shared/jsoncodec"
	"eve-industry-planner/worker/taskrun"

	esitypes "eve-industry-planner/shared/core/esi/types"
	"eve-industry-planner/shared/esiclient"
	"eve-industry-planner/shared/httpclient"
	"eve-industry-planner/shared/logs"
	eipredis "eve-industry-planner/shared/redis"
)

// RefreshMilitiaSystems stores which faction holds each system in factional
// warfare, skipping the write entirely when the ETag says nothing changed.
func RefreshMilitiaSystems(ctx context.Context, deps *taskrun.Dependencies) error {
	ctx, cancel := context.WithTimeout(ctx, 15*time.Second)
	defer cancel()

	logs.InfoCtx(ctx, "militia systems task received")

	release, held := deps.Redis.AcquireRefresh(ctx, eipredis.DatasetMilitiaSystems.Dataset())
	if !held {
		return nil
	}
	defer release()

	cache := deps.Redis.Cache(eipredis.DatasetMilitiaSystems)

	prevETag, err := cache.ETag(ctx)
	if err != nil {
		logs.WarnCtx(ctx, "failed to get previous ETag", "error", err)
	}

	start := time.Now()

	newETag, notModified, maxAge, err := streamMilitiaSystems(ctx, deps.ESI, prevETag, func(system esitypes.MilitiaSystem) error {
		return cache.PutEntry(ctx, system.SolarSystemID, system)
	})
	if err != nil {
		return HandleStreamError(ctx, err, "militia systems refresh")
	}

	recordNextRefresh(ctx, deps.Redis, eipredis.DatasetMilitiaSystems.Dataset(), maxAge)

	if notModified {
		logs.InfoCtx(ctx, "Militia Systems Refresh Completed - Not Modified (ETag Match)")
		return nil
	}

	if err := cache.PutETag(ctx, newETag); err != nil {
		return fmt.Errorf("failed to save ETag: %w", err)
	}
	if err := cache.PutLastUpdated(ctx, time.Now()); err != nil {
		return fmt.Errorf("failed to save last updated timestamp: %w", err)
	}

	logs.InfoCtx(ctx, "Militia Systems Refresh Complete", "duration_ms", time.Since(start).Milliseconds())
	return nil
}

// militiaSystem is one row of ESI's factional warfare system list.
type militiaSystem struct {
	SolarSystemID  int32 `json:"solar_system_id"`
	OwnerFactionID int32 `json:"owner_faction_id"`
}

// streamMilitiaSystems walks ESI's factional warfare systems as they decode.
func streamMilitiaSystems(
	ctx context.Context,
	client esiclient.API,
	etag string,
	onItem func(esitypes.MilitiaSystem) error,
) (newETag string, notModified bool, maxAge time.Duration, err error) {
	if client == nil {
		return "", false, 0, fmt.Errorf("ESI client is nil")
	}

	stream, err := client.Stream(ctx, esiclient.Request{
		Method:      http.MethodGet,
		Path:        "/fw/systems/",
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
		return "", false, 0, fmt.Errorf("ESI militia systems: unexpected status %d", stream.Status)
	}

	walk := func(system militiaSystem) error {
		return onItem(esitypes.MilitiaSystem{
			SolarSystemID:  system.SolarSystemID,
			OwnerFactionID: system.OwnerFactionID,
		})
	}
	if err := jsoncodec.StreamArray(stream.Body, walk); err != nil {
		return "", false, 0, err
	}
	return stream.ETag, false, stream.MaxAge, nil
}
