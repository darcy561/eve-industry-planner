// Command model_parity sweeps a live Mongo for disagreements between the stored
// documents and the Go models.
//
// Implementation: eve-industry-planner/testing/model_parity/lib (package modelparity).
//
// Phases: -phase all|census|corpus
//
//	census — decode every document, encode it back, report what did not survive
//	corpus — write the job documents as the API serialises them, for the SPA test
//
// Build and run against the stack (from testing/):
//
//	go build -o ../.tmp/model_parity ./model_parity
//	docker run --rm --network eip-core --env-file ../.env \
//	  -e LOG_LEVEL=warn -e MONGO_HOST=mongo -e MONGO_PORT=27017 \
//	  -v "$PWD/../.tmp:/out" -v "$PWD/../.tmp/model_parity:/model_parity:ro" \
//	  --entrypoint /model_parity alpine:3.20 -phase all -corpus /out/model-parity/jobs.jsonl
//
// The corpus and the schema beside it feed frontend/src/Classes/job.parity.test.js:
//
//	cd frontend && EIP_JOB_CORPUS=../.tmp/model-parity/jobs.jsonl npx vitest run src/Classes/job.parity.test.js
//
// Exit status is 1 when a model rejected or altered a stored document.
package main

import (
	"context"
	"flag"
	"fmt"
	"os"
	"os/signal"
	"path/filepath"
	"syscall"
	"time"

	eipmongo "eve-industry-planner/shared/mongo"
	modelparity "eve-industry-planner/testing/model_parity/lib"
)

func main() {
	if err := run(); err != nil {
		fmt.Fprintf(os.Stderr, "model_parity: %v\n", err)
		os.Exit(1)
	}
}

func run() error {
	var (
		phase   = flag.String("phase", "all", "all|census|corpus")
		corpus  = flag.String("corpus", filepath.Join("..", ".tmp", "model-parity", "jobs.jsonl"), "where to write the SPA parity corpus")
		timeout = flag.Duration("timeout", 30*time.Minute, "whole-sweep deadline")
	)
	flag.Parse()

	parsed, err := modelparity.ParsePhase(*phase)
	if err != nil {
		return err
	}

	ctx, cancel := signal.NotifyContext(context.Background(), os.Interrupt, syscall.SIGTERM)
	defer cancel()
	ctx, cancelTimeout := context.WithTimeout(ctx, *timeout)
	defer cancelTimeout()

	mongo, err := eipmongo.ConnectPrimary(ctx)
	if err != nil {
		return fmt.Errorf("connect mongo: %w", err)
	}
	defer mongo.Client.Disconnect(context.Background())

	ok, err := modelparity.Run(ctx, mongo, os.Stdout, modelparity.Config{
		Phase:      parsed,
		CorpusPath: *corpus,
	})
	if err != nil {
		return err
	}
	if !ok {
		return fmt.Errorf("a model rejected or altered a stored document")
	}
	return nil
}
