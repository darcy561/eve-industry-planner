package commands

import (
	"context"
	"crypto/rand"
	"encoding/binary"
	"flag"
	"fmt"
	"maps"
	"slices"
	"strings"
	"time"

	"eve-industry-planner/shared/lifecycle"
	"eve-industry-planner/shared/models"
	eipmongo "eve-industry-planner/shared/mongo"
	"eve-industry-planner/shared/stackservices"

	"go.mongodb.org/mongo-driver/v2/bson"
	mongodriver "go.mongodb.org/mongo-driver/v2/mongo"
	"go.mongodb.org/mongo-driver/v2/mongo/options"
)

// reshapeJobCollections are the collections holding a job document.
var reshapeJobCollections = []string{
	eipmongo.CollectionJobDocuments,
	eipmongo.CollectionJobs,
	eipmongo.CollectionArchivedJobs,
}

type reshapeJobDocumentsOptions struct {
	database    string
	collections []string
	limit       int
	write       bool
	showRefused int
}

// runReshapeJobDocuments converts stored job documents to the shape
// technical-documentation/migration-plans/job-document-drafts describes.
//
// It reports and writes nothing unless asked. That is the opposite of the
// release steps, and deliberate: this rewrites every job a planner holds, so the
// outcome is something to read first and apply second. `-database` points it at
// a restored copy, which is where reading it first is worth anything.
func runReshapeJobDocuments(ctx context.Context, args []string) error {
	opts, err := parseReshapeJobDocumentsOptions(args)
	if err != nil {
		return err
	}

	clients, stopDeps, err := stackservices.Connect(ctx, stackservices.Services{Mongo: true})
	if err != nil {
		return err
	}
	defer lifecycle.RunCleanups(5*time.Second, stopDeps)

	database := clients.Mongo.DB
	if opts.database != "" {
		database = clients.Mongo.Client.Database(opts.database)
	}

	if opts.write {
		fmt.Printf("writing to %s\n", database.Name())
	} else {
		fmt.Printf("dry run against %s — nothing is written\n", database.Name())
	}

	var total reshapeReport
	var examined, converted, refused, alreadyShaped int
	for _, name := range opts.collections {
		result, err := reshapeCollection(ctx, database.Collection(name), opts)
		if err != nil {
			return fmt.Errorf("%s: %w", name, err)
		}
		fmt.Println(result.line(name))
		total.add(result.report)
		examined += result.examined
		converted += result.converted
		refused += result.refused
		alreadyShaped += result.alreadyShaped
	}

	fmt.Printf("\n%d examined, %d converted, %d already in shape, %d refused\n",
		examined, converted, alreadyShaped, refused)
	fmt.Printf("rows keyed %d; orders merged %d; purchase typeIDs dropped %d; transactions minted %d; invention entries stamped v%d %d\n",
		total.RowsKeyed, total.OrdersMerged, total.PurchaseTypeIDs, total.TransactionsMinted,
		models.InventionEntrySchemaCurrent, total.InventionVersionsStamped)
	fmt.Printf("duplicate rows collapsed %d\n", total.DuplicateRows)
	if len(total.FieldsDropped) > 0 {
		fmt.Println("fields dropped, by name:")
		for _, field := range slices.Sorted(maps.Keys(total.FieldsDropped)) {
			fmt.Printf("  %-34s %d\n", field, total.FieldsDropped[field])
		}
	}
	fmt.Printf("fees folded %d; dropped %d duplicates (%.0f ISK), %d later entries (%.0f ISK), %d with no order (%.0f ISK)\n",
		total.FeesFolded, total.FeesDroppedCopy, total.FeeISKDroppedCopy,
		total.FeesDroppedLater, total.FeeISKDroppedLater, total.FeesDroppedOrphan, total.FeeISKDroppedOrphan)

	if refused > 0 {
		return fmt.Errorf("%d document(s) were refused rather than converted", refused)
	}
	return nil
}

// reshapeJobDocumentsStep is the conversion as the release runs it: over the
// stack's own database, every job collection, writing unless this is a dry run.
//
// The command above exists to rehearse this against a restored copy. What runs
// in the window is the same conversion, so what a rehearsal reports is what the
// release will do.
func reshapeJobDocumentsStep(ctx context.Context, clients *stackservices.Clients, dryRun bool) (string, error) {
	opts := reshapeJobDocumentsOptions{collections: reshapeJobCollections, write: !dryRun}

	var total reshapeReport
	var reports []string
	var refused int
	for _, name := range opts.collections {
		result, err := reshapeCollection(ctx, clients.Mongo.Coll(name), opts)
		if err != nil {
			return "", fmt.Errorf("%s: %w", name, err)
		}
		total.add(result.report)
		refused += result.refused
		reports = append(reports, fmt.Sprintf("%s: %d converted, %d already in shape, %d refused",
			name, result.converted, result.alreadyShaped, result.refused))
	}

	if refused > 0 {
		// A refusal is a row the conversion could not account for. The release
		// stops rather than leaving a corpus half in each shape with nobody told
		// which documents were skipped.
		return "", fmt.Errorf("%d document(s) refused; run `tasks reshapeJobDocuments` to see which", refused)
	}

	reports = append(reports, fmt.Sprintf("%d rows keyed, %d fees folded, %d invention entries stamped v%d",
		total.RowsKeyed, total.FeesFolded, total.InventionVersionsStamped, models.InventionEntrySchemaCurrent))
	return strings.Join(reports, "; "), nil
}

type reshapeResult struct {
	examined      int
	converted     int
	refused       int
	alreadyShaped int
	report        reshapeReport
}

func (r reshapeResult) line(collection string) string {
	return fmt.Sprintf("%s: %d examined, %d converted, %d already in shape, %d refused",
		collection, r.examined, r.converted, r.alreadyShaped, r.refused)
}

// reshapeCollection walks one collection, converting each document and writing
// only the ones that converted cleanly.
//
// A refused document is left exactly as it was. A partly converted corpus is
// recoverable — the command can be run again once the refusals are understood —
// where a corpus converted over a row it silently dropped is not.
func reshapeCollection(ctx context.Context, coll *mongodriver.Collection, opts reshapeJobDocumentsOptions) (reshapeResult, error) {
	var result reshapeResult
	find := options.Find().SetSort(bson.D{{Key: "_id", Value: 1}})
	if opts.limit > 0 {
		find.SetLimit(int64(opts.limit))
	}
	cursor, err := coll.Find(ctx, bson.M{}, find)
	if err != nil {
		return result, fmt.Errorf("read: %w", err)
	}
	defer cursor.Close(ctx)

	shown := 0
	for cursor.Next(ctx) {
		var doc bson.M
		if err := cursor.Decode(&doc); err != nil {
			return result, fmt.Errorf("decode: %w", err)
		}
		result.examined++

		converted, report := reshapeJobDocument(doc, mintNegativeTransactionID)
		if report.AlreadyShaped {
			result.alreadyShaped++
			continue
		}
		result.report.add(report)
		if report.refused() {
			result.refused++
			if shown < opts.showRefused {
				fmt.Printf("  refused %v: %s\n", doc["_id"], strings.Join(report.Refusals, "; "))
				shown++
			}
			continue
		}
		result.converted++

		if !opts.write {
			continue
		}
		if _, err := coll.ReplaceOne(ctx, bson.M{"_id": doc["_id"]}, converted); err != nil {
			return result, fmt.Errorf("write %v: %w", doc["_id"], err)
		}
	}
	return result, cursor.Err()
}

// mintNegativeTransactionID mints an id for a hand-entered sale carrying none,
// in the shape `Transaction.mintCustomID` already produces: negative, so
// `models.IsMarketTransactionID` reads it as the app's rather than ESI's, and
// drawn at random over 48 bits rather than from the clock.
func mintNegativeTransactionID() int64 {
	var buf [8]byte
	if _, err := rand.Read(buf[:]); err != nil {
		panic(fmt.Sprintf("reshapeJobDocuments: no randomness to mint a transaction id: %v", err))
	}
	return -int64(binary.BigEndian.Uint64(buf[:])&0xFFFFFFFFFFFF + 1)
}

func parseReshapeJobDocumentsOptions(args []string) (reshapeJobDocumentsOptions, error) {
	fs := flag.NewFlagSet("reshapeJobDocuments", flag.ContinueOnError)
	database := fs.String("database", "", "database to convert (default: the stack's)")
	collection := fs.String("collection", "", "one collection to convert (default: every job collection)")
	limit := fs.Int("limit", 0, "stop after this many documents per collection (0: all)")
	write := fs.Bool("write", false, "apply the conversion; without it nothing is written")
	showRefused := fs.Int("show-refused", 20, "how many refusals to print per collection")
	fs.Usage = func() {
		fmt.Fprintf(fs.Output(), "Usage: tasks reshapeJobDocuments [flags]\n\n")
		fmt.Fprintf(fs.Output(), "Converts job documents to the reshaped form. Reports only unless -write.\n\n")
		fs.PrintDefaults()
	}
	if err := fs.Parse(args); err != nil {
		return reshapeJobDocumentsOptions{}, err
	}

	opts := reshapeJobDocumentsOptions{
		database:    *database,
		collections: reshapeJobCollections,
		limit:       *limit,
		write:       *write,
		showRefused: *showRefused,
	}
	if *collection != "" {
		if !slices.Contains(reshapeJobCollections, *collection) {
			return opts, fmt.Errorf("collection %q holds no job documents", *collection)
		}
		opts.collections = []string{*collection}
	}
	return opts, nil
}
