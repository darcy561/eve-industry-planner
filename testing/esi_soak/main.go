// Command esi_soak drives several replicas at an ESI stand-in through the
// shared limiter and reports whether the fleet stayed inside one budget.
//
// The origin meters the way ESI does and answers 429 once its allowance is
// gone, so it judges the run: a correct limiter never provokes one.
//
// Against a throwaway Redis:
//
//	docker run --rm -d --name esi-soak-redis -p 63799:6379 redis:8
//	go run ./esi_soak -redis 127.0.0.1:63799 -replicas 4 -duration 30s -allowance 600
//	docker rm -f esi-soak-redis
//
// Point -redis at a scratch server, never the stack's: the run writes bucket
// state, which the running system paces itself on.
//
// Implementation: eve-industry-planner/testing/esi_soak/lib (package esisoak).
package main

import (
	"context"
	"flag"
	"fmt"
	"os"
	"os/signal"
	"syscall"
	"time"

	"eve-industry-planner/shared/esiclient"
	esisoak "eve-industry-planner/testing/esi_soak/lib"

	"github.com/redis/go-redis/v9"
)

func main() {
	var (
		addr      = flag.String("redis", "127.0.0.1:6379", "scratch Redis to coordinate through")
		password  = flag.String("redis-password", "", "Redis password, if any")
		replicas  = flag.Int("replicas", 4, "independent dispatchers sharing the clock")
		callers   = flag.Int("callers", 6, "concurrent callers per replica")
		duration  = flag.Duration("duration", 30*time.Second, "how long to drive load")
		allowance = flag.Int("allowance", 600, "token allowance the origin enforces")
		window    = flag.Duration("window", time.Minute, "window the origin refills over")
	)
	flag.Parse()

	ctx, stop := signal.NotifyContext(context.Background(), os.Interrupt, syscall.SIGTERM)
	defer stop()

	rdb := redis.NewClient(&redis.Options{Addr: *addr, Password: *password})
	if err := rdb.Ping(ctx).Err(); err != nil {
		fmt.Fprintf(os.Stderr, "redis at %s: %v\n", *addr, err)
		os.Exit(1)
	}
	defer rdb.Close()

	origin := esisoak.NewOrigin(esisoak.OriginConfig{Allowance: *allowance, Window: *window})
	defer origin.Close()

	cfg := esisoak.DefaultConfig()
	cfg.Replicas = *replicas
	cfg.Callers = *callers
	cfg.Duration = *duration
	cfg.Mix = map[esiclient.Class]int{
		esiclient.ClassBackground:    max(*callers-2, 1),
		esiclient.ClassUserRequested: 1,
	}

	result, err := esisoak.Run(ctx, cfg, origin, rdb)
	if err != nil {
		fmt.Fprintf(os.Stderr, "soak: %v\n", err)
		os.Exit(1)
	}

	fmt.Println(result)
	if !result.Healthy() {
		fmt.Fprintf(os.Stderr, "\nFAILED: overspend=%d origin refusals=%d\n", result.Overspend, result.Refused429)
		os.Exit(1)
	}
	fmt.Println("\nOK: the fleet stayed inside the allowance and the origin never had to refuse it")
}
