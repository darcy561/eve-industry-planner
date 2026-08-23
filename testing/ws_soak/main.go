// Command ws_soak holds many authenticated /ws connections against a live stack
// (Traefik or ws-router), reconnects on please_reconnect / close, and reports
// sticky + NATS soft/full + place outcomes from connected.container_id.
//
// Implementation: eve-industry-planner/testing/ws_soak/lib (package soaklib).
//
// Hold soak (default — drain / reconnect evidence):
//
//	go build -o ../.tmp/ws_soak ./ws_soak
//	docker run --rm --network eip-core --env-file ../.env \
//	  -e LOG_LEVEL=warn -e REDIS_HOST=redis -e REDIS_PORT=6379 -e NATS_URL=nats://nats:4222 \
//	  -v "$PWD/../.tmp/ws_soak:/ws_soak:ro" --entrypoint /ws_soak alpine:3.20 \
//	  -clients 50 -duration 5m
//	# default -ws-url ws://traefik:80/ws; bypass: -ws-url ws://ws-router:8080/ws
//
// Limits soak (soft + hard pressure — sync low thresholds first):
//
//	# eip.config.yaml: target_clients: 20, client_cutoff: 40 → eip sync
//	docker run … /ws_soak -profile limits -expect-target 20 -expect-cutoff 40 -duration 2m
//
// Pressure soak (multi-group hold + soft/hard divert — sync thresholds first):
//
//	# eip.config.yaml: target_clients: 40, client_cutoff: 80 → eip sync; ≥2 websocket replicas
//	docker run … /ws_soak -profile pressure -expect-target 40 -expect-cutoff 80 \
//	  -groups 12 -group-size 15 -clients 400 -duration 5m
//
// Fan-out load (JetStream → WS; soft bootstrap then continuous tenantGen + churn + publisher):
//
//	docker run … /ws_soak -profile fanout -publish jetstream \
//	  -clients 500 -fanout-rate 100 -fanout-live-ratio 0.65 \
//	  -fanout-affinity-mix 0.25 -fanout-seed 0 -duration 10m -flag-wait 90s -ramp 30s
//	# Default -ws-url is Traefik edge (ws://traefik:80/ws) — same hop as browsers.
//	# Bypass edge for router-only debug: -ws-url ws://ws-router:8080/ws
//	# -clients = bootstrap + inventory cap (gen does not grow past this — keeps harness CPU off hot path)
//	# Wall = -ramp (connect only; NATS FilterSubjects spike OK) + -duration (steady JetStream pubs ~rate/s)
//	# -fanout-messages = optional soft pub floor (warn only); publishing stops when publish window ends then drains
//	# FilterSubjects widen gap accepted; exact expects use ready (post-settle) recipients
//	# pass: wrong=0 dup=0 offline_hit=0; shared corp/alliance affinity keys stay co-located (-require-coloc)
//	# Always override LOG_LEVEL=warn (or higher) — .env debug floods JetStream publish logs and starves the host
package main

import (
	"context"
	"flag"
	"fmt"
	"os"
	"os/signal"
	"syscall"
	"time"

	soaklib "eve-industry-planner/testing/ws_soak/lib"
)

func main() {
	if err := run(); err != nil {
		fmt.Fprintf(os.Stderr, "ws_soak: %v\n", err)
		os.Exit(1)
	}
}

func run() error {
	var (
		profileName  = flag.String("profile", "hold", "hold | limits | pressure | fanout")
		wsURL        = flag.String("ws-url", "ws://traefik:80/ws", "WebSocket upgrade URL (default Traefik edge; use ws://ws-router:8080/ws to bypass)")
		clients      = flag.Int("clients", 0, "concurrent /ws clients (0 = profile default; fanout: bootstrap inventory then continuous gen; pressure grows group-size to match)")
		accounts     = flag.Int("accounts", 0, "hold: distinct soak accounts (0 = 10)")
		duration     = flag.Duration("duration", 5*time.Minute, "how long to hold connections")
		ramp         = flag.Duration("ramp", 2*time.Second, "stagger first connects across this window")
		reportEvery  = flag.Duration("report-every", 15*time.Second, "progress line interval (0=off)")
		affinity     = flag.String("affinity", "", "hold: none|account|corp|alliance (empty = account). limits/pressure ignore")
		corpID       = flag.Int64("corp", 0, "hold: corporation id; limits/pressure: fill corp; fanout: affiliated-corp id base (standalone=corp+100000; default 920001)")
		allianceID   = flag.Int64("alliance", 0, "hold: affinity=alliance; fanout: alliance id base (default 910001)")
		reconnect    = flag.Bool("reconnect", true, "reconnect after please_reconnect / unexpected close (hold profile)")
		insecure     = flag.Bool("insecure", false, "skip TLS verify (local wss soak)")
		maxDrop      = flag.Float64("max-drop-rate", 1.0, "fail if unexpected_close/dial_ok exceeds this (1.0=never fail on drops)")
		seedOnly     = flag.Bool("seed-only", false, "seed Redis sessions and exit")
		noSeed       = flag.Bool("no-seed", false, "skip Redis session seed (sessions must already exist)")
		expectTarget = flag.Int("expect-target", 20, "limits/pressure: stack target_clients after eip sync")
		expectCutoff = flag.Int("expect-cutoff", 40, "limits/pressure: stack client_cutoff after eip sync")
		require503   = flag.Bool("require-503", false, "limits/pressure: fail unless HTTP 503 at_cutoff refuses (direct websocket -ws-url)")
		flagWait     = flag.Duration("flag-wait", 90*time.Second, "limits/pressure/fanout: max wait for soft/full or fanout delivery")
		softDivertN  = flag.Int("soft-divert", 0, "limits/pressure: mixed-key clients after soft (0 = auto)")
		fullProbeN   = flag.Int("full-probe", 0, "limits/pressure: mixed-key clients after full (0 = auto)")
		minDivert    = flag.Float64("min-divert-ratio", 0.8, "limits/pressure: min fraction of soft-divert keys that must place off soft")
		requireColoc = flag.Bool("require-coloc", true, "fail if shared affinity keys split backends (hold/limits/pressure; fanout: corp/alliance keys with ≥2 placements)")
		groups       = flag.Int("groups", 0, "pressure: sticky affinity groups (0 = 12; rotating account/corp/alliance)")
		groupSize    = flag.Int("group-size", 0, "pressure: clients per sticky group (0 = 10; grown if -clients set)")
		readIdle     = flag.Duration("read-idle", 0, "optional client read deadline (0=none; gorilla read errors are permanent — do not use as a ping timer)")
		publish      = flag.String("publish", "none", "fanout publisher: none | jetstream | mongo (fanout defaults to jetstream)")
		fanoutMsgs   = flag.Int("fanout-messages", 0, "fanout: soft pub floor warn only (0 = none); run ends on -duration")
		fanoutRate   = flag.Float64("fanout-rate", 0, "fanout: publishes per second (0 = 100)")
		fanoutLoss   = flag.Float64("fanout-max-loss", 0, "fanout: max allowed 1-recv/expect (0 = require full delivery)")
		fanoutSeed   = flag.Int64("fanout-seed", 0, "fanout: tenantGen RNG seed (0 = time-based)")
		fanoutAffMix = flag.Float64("fanout-affinity-mix", 0, "fanout: fraction of org members with corp/alliance affinity (0 = 0.25)")
		fanoutLive   = flag.Float64("fanout-live-ratio", 0, "fanout: fraction of inventory kept live by churn (0 = 0.65)")
	)
	flag.Parse()

	prof, err := soaklib.ParseProfile(*profileName)
	if err != nil {
		return err
	}
	pubMode, err := soaklib.ParsePublishMode(*publish)
	if err != nil {
		return err
	}

	ctx, stop := signal.NotifyContext(context.Background(), os.Interrupt, syscall.SIGTERM)
	defer stop()

	return soaklib.Run(ctx, soaklib.Config{
		Profile:           prof,
		WSURL:             *wsURL,
		Clients:           *clients,
		Accounts:          *accounts,
		Duration:          *duration,
		Ramp:              *ramp,
		ReportEvery:       *reportEvery,
		Affinity:          *affinity,
		CorpID:            *corpID,
		AllianceID:        *allianceID,
		Reconnect:         *reconnect,
		Insecure:          *insecure,
		MaxDrop:           *maxDrop,
		SeedOnly:          *seedOnly,
		NoSeed:            *noSeed,
		ExpectTarget:      *expectTarget,
		ExpectCutoff:      *expectCutoff,
		Require503:        *require503,
		FlagWait:          *flagWait,
		SoftDivert:        *softDivertN,
		FullProbes:        *fullProbeN,
		MinDivertRatio:    *minDivert,
		RequireColoc:      *requireColoc,
		Groups:            *groups,
		GroupSize:         *groupSize,
		ReadIdle:          *readIdle,
		Publish:           pubMode,
		FanoutMessages:    *fanoutMsgs,
		FanoutRate:        *fanoutRate,
		FanoutMaxLoss:     *fanoutLoss,
		FanoutSeed:        *fanoutSeed,
		FanoutAffinityMix: *fanoutAffMix,
		FanoutLiveRatio:   *fanoutLive,
	})
}
