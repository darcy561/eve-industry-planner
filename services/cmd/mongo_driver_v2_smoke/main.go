// Command mongo_driver_v2_smoke exercises Mongo connect / CRUD / changestream
// against a live Mongo.
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
	fmt.Println("PASS: connect, CRUD, changestream (cold+resume+invalid), Distinct path OK")
}

func run() error {
	ctx, cancel := context.WithTimeout(context.Background(), 90*time.Second)
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
	_ = coll.Drop(ctx)

	id := fmt.Sprintf("smoke-%d", time.Now().UnixNano())
	doc := bson.M{"_id": id, "n": 1, "_meta": bson.M{"accountID": "smoke-account"}}

	if err := smokeColdInsert(ctx, coll, id, doc); err != nil {
		return err
	}

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

	if err := smokeResumeRoundTrip(ctx, coll); err != nil {
		return err
	}
	if err := smokeInvalidResumeThenCold(ctx, coll); err != nil {
		return err
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

func smokeColdInsert(ctx context.Context, coll *mongodriver.Collection, id string, doc bson.M) error {
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

	select {
	case <-sawInsert:
		fmt.Println("ok: changestream saw insert (cold)")
	case <-time.After(10 * time.Second):
		return fmt.Errorf("changestream cold: timed out waiting for insert")
	case <-ctx.Done():
		return fmt.Errorf("changestream cold: %w", ctx.Err())
	}
	return nil
}

// smokeResumeRoundTrip: watch → insert A → capture resume token → reopen with StartAfter → insert B → see B.
func smokeResumeRoundTrip(ctx context.Context, coll *mongodriver.Collection) error {
	csCtx, csCancel := context.WithCancel(ctx)
	defer csCancel()

	stream, err := coll.Watch(csCtx, mongodriver.Pipeline{}, options.ChangeStream().SetFullDocument(options.UpdateLookup))
	if err != nil {
		return fmt.Errorf("resume watch open: %w", err)
	}

	idA := fmt.Sprintf("smoke-resume-a-%d", time.Now().UnixNano())
	gotToken := make(chan bson.Raw, 1)
	go func() {
		for stream.Next(csCtx) {
			var ev bson.M
			if err := stream.Decode(&ev); err != nil {
				continue
			}
			if op, _ := ev["operationType"].(string); op != "insert" {
				continue
			}
			token, err := marshalResumeToken(ev["_id"])
			if err != nil {
				continue
			}
			select {
			case gotToken <- token:
			default:
			}
			return
		}
	}()

	if _, err := coll.InsertOne(ctx, bson.M{"_id": idA, "phase": "resume-a"}); err != nil {
		_ = stream.Close(context.Background())
		return fmt.Errorf("resume insert A: %w", err)
	}

	var token bson.Raw
	select {
	case token = <-gotToken:
	case <-time.After(10 * time.Second):
		_ = stream.Close(context.Background())
		return fmt.Errorf("resume: timed out waiting for insert A event")
	case <-ctx.Done():
		_ = stream.Close(context.Background())
		return fmt.Errorf("resume: %w", ctx.Err())
	}
	_ = stream.Close(context.Background())
	csCancel()

	csCtx2, csCancel2 := context.WithCancel(ctx)
	defer csCancel2()
	stream2, err := coll.Watch(csCtx2, mongodriver.Pipeline{}, options.ChangeStream().
		SetFullDocument(options.UpdateLookup).
		SetStartAfter(token))
	if err != nil {
		return fmt.Errorf("resume StartAfter watch: %w", err)
	}
	defer stream2.Close(context.Background())

	idB := fmt.Sprintf("smoke-resume-b-%d", time.Now().UnixNano())
	sawB := make(chan struct{}, 1)
	go func() {
		for stream2.Next(csCtx2) {
			var ev bson.M
			if err := stream2.Decode(&ev); err != nil {
				continue
			}
			if op, _ := ev["operationType"].(string); op != "insert" {
				continue
			}
			if docIDFromEvent(ev) != idB {
				continue // should not re-deliver A after StartAfter
			}
			select {
			case sawB <- struct{}{}:
			default:
			}
			return
		}
	}()

	if _, err := coll.InsertOne(ctx, bson.M{"_id": idB, "phase": "resume-b"}); err != nil {
		return fmt.Errorf("resume insert B: %w", err)
	}

	select {
	case <-sawB:
		fmt.Println("ok: changestream resume StartAfter saw insert B")
	case <-time.After(10 * time.Second):
		return fmt.Errorf("resume: timed out waiting for insert B after StartAfter")
	case <-ctx.Done():
		return fmt.Errorf("resume: %w", ctx.Err())
	}
	return nil
}

// smokeInvalidResumeThenCold: bogus StartAfter must fail; cold Watch must still work.
func smokeInvalidResumeThenCold(ctx context.Context, coll *mongodriver.Collection) error {
	badToken, err := bson.Marshal(bson.M{"_data": "eip-smoke-invalid-resume-token"})
	if err != nil {
		return fmt.Errorf("marshal bad token: %w", err)
	}

	csCtx, csCancel := context.WithCancel(ctx)
	defer csCancel()
	_, err = coll.Watch(csCtx, mongodriver.Pipeline{}, options.ChangeStream().
		SetFullDocument(options.UpdateLookup).
		SetStartAfter(bson.Raw(badToken)))
	if err == nil {
		return fmt.Errorf("invalid resume: expected Watch error for bogus StartAfter")
	}
	fmt.Println("ok: changestream invalid StartAfter rejected")

	stream, err := coll.Watch(csCtx, mongodriver.Pipeline{}, options.ChangeStream().SetFullDocument(options.UpdateLookup))
	if err != nil {
		return fmt.Errorf("cold watch after invalid resume: %w", err)
	}
	defer stream.Close(context.Background())

	id := fmt.Sprintf("smoke-cold-after-invalid-%d", time.Now().UnixNano())
	saw := make(chan struct{}, 1)
	go func() {
		for stream.Next(csCtx) {
			var ev bson.M
			if err := stream.Decode(&ev); err != nil {
				continue
			}
			if op, _ := ev["operationType"].(string); op != "insert" {
				continue
			}
			if docIDFromEvent(ev) != id {
				continue
			}
			select {
			case saw <- struct{}{}:
			default:
			}
			return
		}
	}()

	if _, err := coll.InsertOne(ctx, bson.M{"_id": id, "phase": "cold-after-invalid"}); err != nil {
		return fmt.Errorf("cold after invalid insert: %w", err)
	}
	select {
	case <-saw:
		fmt.Println("ok: changestream cold start after invalid resume")
	case <-time.After(10 * time.Second):
		return fmt.Errorf("cold after invalid: timed out waiting for insert")
	case <-ctx.Done():
		return fmt.Errorf("cold after invalid: %w", ctx.Err())
	}
	return nil
}

func marshalResumeToken(id any) (bson.Raw, error) {
	if id == nil {
		return nil, fmt.Errorf("nil resume token")
	}
	if raw, ok := id.(bson.Raw); ok {
		return raw, nil
	}
	b, err := bson.Marshal(id)
	if err != nil {
		return nil, err
	}
	return bson.Raw(b), nil
}

func docIDFromEvent(ev bson.M) string {
	if dk, ok := ev["documentKey"].(bson.M); ok {
		if id, ok := dk["_id"].(string); ok {
			return id
		}
	}
	if full := eipmongo.AsDocumentM(ev["fullDocument"]); full != nil {
		if id, ok := full["_id"].(string); ok {
			return id
		}
	}
	return ""
}
