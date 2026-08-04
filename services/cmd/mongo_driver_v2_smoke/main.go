// Command mongo_driver_v2_smoke exercises driver v2 connect / CRUD / changestream
// against a live Mongo (migration-plans/mongo-driver-v2 Stage A4).
//
// Example (from repo root, stack up, app network eip-core):
//
//	cd services
//	set GOOS=linux& set GOARCH=amd64& set CGO_ENABLED=0
//	go build -o ../.tmp/mongo_v2_smoke ./cmd/mongo_driver_v2_smoke
//	docker run --rm --network eip-core --env-file ../.env -e MONGO_HOST=mongo -e MONGO_PORT=27017 -v %CD%/../.tmp/mongo_v2_smoke:/smoke:ro --entrypoint /smoke alpine:3.20
package main

import (
	"context"
	"fmt"
	"os"
	"time"

	eipmongo "eve-industry-planner/shared/mongo"

	"go.mongodb.org/mongo-driver/v2/bson"
	mongodriver "go.mongodb.org/mongo-driver/v2/mongo"
	"go.mongodb.org/mongo-driver/v2/mongo/options"
)

const smokeColl = "_mongo_driver_v2_smoke"

func main() {
	if err := run(); err != nil {
		fmt.Fprintf(os.Stderr, "FAIL: %v\n", err)
		os.Exit(1)
	}
	fmt.Println("PASS: connect, CRUD, changestream, Distinct path OK")
}

func run() error {
	ctx, cancel := context.WithTimeout(context.Background(), 45*time.Second)
	defer cancel()

	mongo, err := eipmongo.ConnectPrimary()
	if err != nil {
		return fmt.Errorf("connect: %w", err)
	}
	defer mongo.Disconnect(ctx)

	if err := mongo.Ping(ctx); err != nil {
		return fmt.Errorf("ping: %w", err)
	}
	fmt.Println("ok: ping")

	coll := mongo.Coll(smokeColl)
	defer func() { _ = coll.Drop(context.Background()) }()

	id := fmt.Sprintf("smoke-%d", time.Now().UnixNano())
	doc := bson.M{"_id": id, "n": 1, "_meta": bson.M{"accountID": "smoke-account"}}

	csCtx, csCancel := context.WithCancel(ctx)
	defer csCancel()
	stream, err := coll.Watch(csCtx, mongodriver.Pipeline{}, options.ChangeStream().SetFullDocument(options.UpdateLookup))
	if err != nil {
		return fmt.Errorf("watch: %w", err)
	}
	defer stream.Close(context.Background())

	sawInsert := make(chan struct{}, 1)
	go func() {
		for stream.Next(csCtx) {
			var ev bson.M
			if err := stream.Decode(&ev); err != nil {
				continue
			}
			if op, _ := ev["operationType"].(string); op == "insert" {
				select {
				case sawInsert <- struct{}{}:
				default:
				}
				return
			}
		}
	}()

	if _, err := coll.InsertOne(ctx, doc); err != nil {
		return fmt.Errorf("insert: %w", err)
	}
	fmt.Println("ok: insert")

	var got bson.M
	if err := coll.FindOne(ctx, bson.M{"_id": id}).Decode(&got); err != nil {
		return fmt.Errorf("find: %w", err)
	}
	meta := eipmongo.AsDocumentM(got["_meta"])
	if meta == nil || meta["accountID"] != "smoke-account" {
		return fmt.Errorf("find nested _meta: %#v (type %T)", got["_meta"], got["_meta"])
	}
	fmt.Println("ok: find + DefaultDocumentM nested bson.M")

	if _, err := coll.UpdateOne(ctx, bson.M{"_id": id}, bson.M{"$set": bson.M{"n": 2}}); err != nil {
		return fmt.Errorf("update: %w", err)
	}
	if _, err := coll.DeleteOne(ctx, bson.M{"_id": id}); err != nil {
		return fmt.Errorf("delete: %w", err)
	}
	fmt.Println("ok: update + delete")

	select {
	case <-sawInsert:
		fmt.Println("ok: changestream saw insert")
	case <-time.After(10 * time.Second):
		return fmt.Errorf("changestream: timed out waiting for insert event")
	case <-ctx.Done():
		return fmt.Errorf("changestream: %w", ctx.Err())
	}

	if _, err := coll.InsertOne(ctx, bson.M{"_id": id + "-d", "_meta": bson.M{"accountID": "smoke-account"}}); err != nil {
		return fmt.Errorf("distinct setup insert: %w", err)
	}
	var accounts []any
	if err := coll.Distinct(ctx, "_meta.accountID", bson.M{}).Decode(&accounts); err != nil {
		return fmt.Errorf("distinct: %w", err)
	}
	found := false
	for _, a := range accounts {
		if s, ok := a.(string); ok && s == "smoke-account" {
			found = true
			break
		}
	}
	if !found {
		return fmt.Errorf("distinct: smoke-account not in %#v", accounts)
	}
	fmt.Println("ok: Distinct.Decode")

	return nil
}
