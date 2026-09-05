package esisoak_test

import (
	"context"
	"net/http"
	"sync"
	"sync/atomic"
	"testing"
	"time"

	"eve-industry-planner/shared/esiclient"
	esisoak "eve-industry-planner/testing/esi_soak/lib"
	"eve-industry-planner/testing/redisfake"
)

// The shape production actually has, which "N identical callers looping" is not:
// a long sequential walk of a region's order book on the bulk lane, and short
// bursts of user-triggered work arriving on the interactive lane while it runs.
//
// The question is whether a user-facing call gets through promptly while a walk
// is in progress, and whether the walk still finishes.

func TestPagedWalkWithInteractiveBursts(t *testing.T) {
	const pages = 60

	origin := esisoak.NewOrigin(esisoak.OriginConfig{
		Allowance: 400, Window: 30 * time.Second, Pages: pages,
	})
	t.Cleanup(origin.Close)

	cfg := esiclient.DefaultConfig()
	cfg.BaseURL = origin.URL()
	cfg.Transport = origin.Transport()
	cfg.Endpoints = []esiclient.EndpointPolicy{{
		Pattern:           "/markets/{region_id}/orders/",
		CompatibilityDate: "2025-12-16",
		MinSpacing:        5 * time.Millisecond,
		Conditional:       true,
	}}
	cfg.Tolerance = map[esiclient.Class]time.Duration{
		esiclient.ClassBackground:    time.Second,
		esiclient.ClassUserRequested: 2 * time.Second,
	}

	client, stop, err := esiclient.New(redisfake.New(t).Client, cfg)
	if err != nil {
		t.Fatalf("New: %v", err)
	}
	t.Cleanup(stop)

	ctx, cancel := context.WithTimeout(t.Context(), 10*time.Second)
	defer cancel()

	// Learn the bucket before either lane starts, so discovery is not what is
	// being measured.
	if _, err := client.Do(ctx, walkRequest(1)); err != nil {
		t.Fatalf("warm: %v", err)
	}

	var walked atomic.Int64
	var walkDone = make(chan struct{})
	var interactiveWaits []time.Duration
	var mu sync.Mutex

	go func() {
		defer close(walkDone)
		for page := 1; page <= pages && ctx.Err() == nil; page++ {
			if _, err := client.Do(ctx, walkRequest(page)); err != nil {
				// A yield during a walk is expected; the page is simply retried.
				time.Sleep(20 * time.Millisecond)
				page--
				continue
			}
			walked.Add(1)
		}
	}()

	// A user-facing call every 150ms while the walk runs.
	var bursts sync.WaitGroup
	for range 20 {
		if ctx.Err() != nil {
			break
		}
		bursts.Go(func() {
			started := time.Now()
			req := walkRequest(1)
			req.Class = esiclient.ClassUserRequested
			if _, err := client.Do(ctx, req); err == nil {
				mu.Lock()
				interactiveWaits = append(interactiveWaits, time.Since(started))
				mu.Unlock()
			}
		})
		time.Sleep(150 * time.Millisecond)
	}
	bursts.Wait()
	<-walkDone

	mu.Lock()
	served := len(interactiveWaits)
	var total time.Duration
	var worst time.Duration
	for _, d := range interactiveWaits {
		total += d
		worst = max(worst, d)
	}
	mu.Unlock()

	if served == 0 {
		t.Fatal("no interactive call got through while the walk ran")
	}
	mean := total / time.Duration(served)
	t.Logf("walk covered %d of %d pages; %d of 20 interactive calls served, mean %v, worst %v",
		walked.Load(), pages, served, mean.Round(time.Millisecond), worst.Round(time.Millisecond))

	if stats := origin.Stats(); stats.Refusals > 0 {
		t.Errorf("origin refused %d calls during a realistic mix", stats.Refusals)
	}

	// A user waiting on a page load should not be held up by a background walk
	// for anything like as long as the walk itself takes.
	if mean > 500*time.Millisecond {
		t.Errorf("interactive calls waited a mean of %v behind the walk", mean)
	}
	if served < 15 {
		t.Errorf("only %d of 20 interactive calls got through", served)
	}
	if walked.Load() < pages/2 {
		t.Errorf("walk only reached %d of %d pages; bursts should not stall it", walked.Load(), pages)
	}
}

func walkRequest(page int) esiclient.Request {
	return esiclient.Request{
		Method:      http.MethodGet,
		Path:        "/markets/10000002/orders/",
		Query:       map[string][]string{"page": {itoaSmall(page)}},
		Class:       esiclient.ClassBackground,
		IfNoneMatch: `"soak"`,
	}
}

func itoaSmall(n int) string {
	if n == 0 {
		return "0"
	}
	var out []byte
	for n > 0 {
		out = append([]byte{byte('0' + n%10)}, out...)
		n /= 10
	}
	return string(out)
}
