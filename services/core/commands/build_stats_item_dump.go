package commands

import (
	"context"
	"encoding/json"
	"flag"
	"fmt"
	"sort"
	"strconv"
	"strings"
	"time"

	authzhmac "eve-industry-planner/shared/core/crypto/authzhmac/helper"
	mongocore "eve-industry-planner/shared/core/mongo"
	"eve-industry-planner/shared"
	"eve-industry-planner/shared/models"
	archivedjobshelpers "eve-industry-planner/worker/tasks/archivedjobs/helpers"

	"go.mongodb.org/mongo-driver/bson"
	"go.mongodb.org/mongo-driver/mongo"
)

// runDumpBuildStatsItem prints Mongo state for one account + item type + corporation to debug
// build_stats / corp_build_stats vs archived snapshots (flagged corp in UI but missing from corp stats).
func runDumpBuildStatsItem(ctx context.Context, args []string) error {
	fs := flag.NewFlagSet("dumpBuildStatsItem", flag.ContinueOnError)
	fs.Usage = func() {
		fmt.Fprintf(fs.Output(), "Usage: tasks dumpBuildStatsItem -account <firebase_uid> -type-id <itemTypeID> -corp <corporation_id>\n\n")
		fs.PrintDefaults()
	}
	accountID := fs.String("account", "", "required: account id (same as Mongo accountID on snapshots)")
	typeID := fs.Int("type-id", 0, "required: EVE item / blueprint typeID")
	corpIDStr := fs.String("corp", "", "required: corporation_id (numeric) for corp_build_stats + attribution checks")
	if err := fs.Parse(args); err != nil {
		return err
	}
	acc := strings.TrimSpace(*accountID)
	if acc == "" {
		return fmt.Errorf("dumpBuildStatsItem: -account is required")
	}
	if *typeID <= 0 {
		return fmt.Errorf("dumpBuildStatsItem: -type-id must be a positive integer")
	}
	corpTrim := strings.TrimSpace(*corpIDStr)
	if corpTrim == "" {
		return fmt.Errorf("dumpBuildStatsItem: -corp is required")
	}
	corpID, err := strconv.ParseInt(corpTrim, 10, 64)
	if err != nil || corpID <= 0 {
		return fmt.Errorf("dumpBuildStatsItem: -corp must be a positive integer corporation id")
	}

	h, err := authzhmac.NewFromEnv()
	if err != nil {
		return err
	}
	corpRef, err := h.RefFromCorporationID(corpID)
	if err != nil {
		return err
	}

	_, keyring, hmacAgg, errCrypto := archivedjobshelpers.LoadPipelineCrypto()
	if errCrypto != nil {
		return fmt.Errorf("pipeline crypto (for corp aggregation rules): %w", errCrypto)
	}

	clients, err := shared.ConnectServices(ctx, shared.ServiceMongo)
	if err != nil {
		return err
	}
	defer runImmediateCleanups(clients.CleanupFns...)

	db := clients.Mongo.Database(mongocore.DatabaseName)
	ctxOp, cancel := context.WithTimeout(ctx, 3*time.Minute)
	defer cancel()

	statsID := mongocore.BuildStatsDocumentID(acc, *typeID)
	corpStatsID := mongocore.CorpBuildStatsDocumentID(corpRef, *typeID)

	snapFilter := bson.M{
		"accountID": acc,
		"typeID":    *typeID,
		"revoked":   bson.M{"$ne": true},
	}

	var userSnaps, corpSnapsAccountScoped, corpSnapsCorpRefScoped []models.ArchivedJobStats
	if err := findAll(ctxOp, db.Collection(mongocore.CollectionUserArchivedJobStats), snapFilter, &userSnaps); err != nil {
		return fmt.Errorf("user_archived_job_stats: %w", err)
	}
	if err := findAll(ctxOp, db.Collection(mongocore.CollectionCorpArchivedJobStats), snapFilter, &corpSnapsAccountScoped); err != nil {
		return fmt.Errorf("corp_archived_job_stats (accountID filter): %w", err)
	}
	corpOwnedFilter := bson.M{
		"corpRef": corpRef,
		"typeID":  *typeID,
		"revoked": bson.M{"$ne": true},
	}
	if err := findAll(ctxOp, db.Collection(mongocore.CollectionCorpArchivedJobStats), corpOwnedFilter, &corpSnapsCorpRefScoped); err != nil {
		return fmt.Errorf("corp_archived_job_stats (corpRef filter): %w", err)
	}
	userSnaps = nonNilArchivedSnapshots(userSnaps)
	corpSnapsAccountScoped = nonNilArchivedSnapshots(corpSnapsAccountScoped)
	corpSnapsCorpRefScoped = nonNilArchivedSnapshots(corpSnapsCorpRefScoped)
	corpSnapsMerged := mergeCorpArchivedSnapshots(corpSnapsAccountScoped, corpSnapsCorpRefScoped)

	var buildRowPtr, userRowPtr *models.BuildStatsRow
	{
		var r models.BuildStatsRow
		switch err := db.Collection(mongocore.CollectionBuildStats).FindOne(ctxOp, bson.M{"_id": statsID}).Decode(&r); err {
		case nil:
			buildRowPtr = &r
		case mongo.ErrNoDocuments:
		default:
			return fmt.Errorf("build_stats: %w", err)
		}
	}
	{
		var r models.BuildStatsRow
		switch err := db.Collection(mongocore.CollectionUserBuildStats).FindOne(ctxOp, bson.M{"_id": statsID}).Decode(&r); err {
		case nil:
			userRowPtr = &r
		case mongo.ErrNoDocuments:
		default:
			return fmt.Errorf("user_build_stats: %w", err)
		}
	}

	var corpStatsRow models.CorpBuildStatsRow
	switch err := db.Collection(mongocore.CollectionCorpBuildStats).FindOne(ctxOp, bson.M{"_id": corpStatsID}).Decode(&corpStatsRow); err {
	case nil:
	case mongo.ErrNoDocuments:
		corpStatsRow = models.CorpBuildStatsRow{CorpRef: corpRef, TypeID: *typeID}
	default:
		return fmt.Errorf("corp_build_stats: %w", err)
	}

	dirtyAccount := db.Collection(mongocore.CollectionUserBuildStatsDirtyAccounts).FindOne(ctxOp, bson.M{"_id": acc}).Err() == nil
	dirtyCorp := db.Collection(mongocore.CollectionCorpBuildStatsDirtyRefs).FindOne(ctxOp, bson.M{"_id": corpRef}).Err() == nil

	corpSnapAnalysis := make([]dumpCorpSnapshotRow, 0, len(corpSnapsMerged))
	for _, doc := range corpSnapsMerged {
		lifetimes, _ := archivedjobshelpers.AccumulateCorpBuildStats([]models.ArchivedJobStats{doc}, keyring, hmacAgg)
		var keys []string
		for k := range lifetimes {
			keys = append(keys, fmt.Sprintf("%s|typeID=%d", k.CorpRef, k.TypeID))
		}
		sort.Strings(keys)
		contrib := archivedjobshelpers.ArchivedJobStatsContributesToCorpBuildStats(doc, keyring, hmacAgg)
		seg := archivedjobshelpers.ClassifyArchivedJobStatsSegment(doc)
		corpSnapAnalysis = append(corpSnapAnalysis, dumpCorpSnapshotRow{
			JobID:                        doc.JobID,
			ContributesToCorpBuildStats:  contrib,
			Segment:                      segmentName(seg),
			CorpLifetimeKeysFromThisDoc:  keys,
			MatchesRequestedCorpRef:      docAppliesToCorpRef(lifetimes, *typeID, corpRef),
			LinkedIndustryCorpIDs:        doc.LinkedIndustryCorpIDs,
			TransactionLinesCorpKnown:   countCorpKnownTx(&doc),
			FeeLinesCorpKnown:            countCorpKnownFees(&doc),
		})
	}

	out := dumpBuildStatsItemOut{
		AccountID:                acc,
		TypeID:                   *typeID,
		CorporationID:            corpID,
		CorpRef:                  corpRef,
		BuildStatsID:             statsID,
		CorpBuildStatsID:         corpStatsID,
		BuildStatsRow:            buildRowPtr,
		UserBuildStatsRow:        userRowPtr,
		CorpBuildStatsRow:        corpStatsRow,
		DirtyUserBuildStatsQueue: dirtyAccount,
		DirtyCorpBuildStatsQueue: dirtyCorp,
		UserSnapshotCount:              len(userSnaps),
		CorpSnapshotCountAccountScoped: len(corpSnapsAccountScoped),
		CorpSnapshotCountCorpRefScoped: len(corpSnapsCorpRefScoped),
		CorpSnapshotMergedCount:        len(corpSnapsMerged),
		UserSnapshots:                  userSnaps,
		CorpSnapshotsAccountScoped:     corpSnapsAccountScoped,
		CorpSnapshotsCorpRefScoped:       corpSnapsCorpRefScoped,
		CorpSnapshotsMerged:              corpSnapsMerged,
		CorpSnapshotAttribution:        corpSnapAnalysis,
		Hints: buildDumpHints(&corpStatsRow, corpSnapsMerged, corpSnapAnalysis, dirtyCorp, dirtyAccount,
			len(corpSnapsAccountScoped), len(corpSnapsCorpRefScoped)),
	}

	b, err := json.MarshalIndent(out, "", "  ")
	if err != nil {
		return err
	}
	fmt.Println(string(b))
	return nil
}

type dumpBuildStatsItemOut struct {
	AccountID        string `json:"accountID"`
	TypeID           int    `json:"typeID"`
	CorporationID    int64  `json:"corporationID"`
	CorpRef          string `json:"corpRef"`
	BuildStatsID     string `json:"buildStatsID"`
	CorpBuildStatsID string `json:"corpBuildStatsID"`

	BuildStatsRow     *models.BuildStatsRow     `json:"buildStatsRow,omitempty"`
	UserBuildStatsRow *models.BuildStatsRow     `json:"userBuildStatsRow,omitempty"`
	CorpBuildStatsRow models.CorpBuildStatsRow  `json:"corpBuildStatsRow"`

	DirtyUserBuildStatsQueue bool `json:"dirtyUserBuildStatsQueue"`
	DirtyCorpBuildStatsQueue bool `json:"dirtyCorpBuildStatsQueue"`

	UserSnapshotCount              int `json:"userSnapshotCount"`
	CorpSnapshotCountAccountScoped int `json:"corpSnapshotCountAccountScoped"`
	CorpSnapshotCountCorpRefScoped int `json:"corpSnapshotCountCorpRefScoped"`
	CorpSnapshotMergedCount        int `json:"corpSnapshotMergedCount"`

	UserSnapshots              []models.ArchivedJobStats `json:"userSnapshots"`
	CorpSnapshotsAccountScoped []models.ArchivedJobStats `json:"corpSnapshotsAccountScoped"`
	CorpSnapshotsCorpRefScoped []models.ArchivedJobStats `json:"corpSnapshotsCorpRefScoped"`
	CorpSnapshotsMerged        []models.ArchivedJobStats `json:"corpSnapshotsMerged"`

	CorpSnapshotAttribution []dumpCorpSnapshotRow `json:"corpSnapshotAttribution"`
	Hints                   []string              `json:"hints,omitempty"`
}

type dumpCorpSnapshotRow struct {
	JobID                       string   `json:"jobID"`
	ContributesToCorpBuildStats bool     `json:"contributesToCorpBuildStats"`
	Segment                     string   `json:"segment"`
	CorpLifetimeKeysFromThisDoc []string `json:"corpLifetimeKeysFromThisDoc"`
	MatchesRequestedCorpRef     bool     `json:"matchesRequestedCorpRef"`
	LinkedIndustryCorpIDs       []int    `json:"linkedIndustryCorpIDs,omitempty"`
	TransactionLinesCorpKnown   int      `json:"transactionLinesCorpKnown"`
	FeeLinesCorpKnown           int      `json:"feeLinesCorpKnown"`
}

// mergeCorpArchivedSnapshots merges account-scoped and corp-owned corp_archived_job_stats rows.
// Rows from corp_archivedJobs (corpRef + jobID, empty accountID) only appear under corpRef filter — corp-owned wins on duplicate jobID.
// nonNilArchivedSnapshots avoids JSON "null" for empty Mongo cursor results (driver may leave slice nil).
func nonNilArchivedSnapshots(s []models.ArchivedJobStats) []models.ArchivedJobStats {
	if s == nil {
		return []models.ArchivedJobStats{}
	}
	return s
}

func mergeCorpArchivedSnapshots(accountScoped, corpRefScoped []models.ArchivedJobStats) []models.ArchivedJobStats {
	byJob := make(map[string]models.ArchivedJobStats, len(accountScoped)+len(corpRefScoped))
	for _, d := range accountScoped {
		if d.JobID != "" {
			byJob[d.JobID] = d
		}
	}
	for _, d := range corpRefScoped {
		if d.JobID != "" {
			byJob[d.JobID] = d
		}
	}
	out := make([]models.ArchivedJobStats, 0, len(byJob))
	for _, d := range byJob {
		out = append(out, d)
	}
	sort.Slice(out, func(i, j int) bool {
		return out[i].JobID < out[j].JobID
	})
	return out
}

func findAll(ctx context.Context, coll *mongo.Collection, filter interface{}, dst interface{}) error {
	cur, err := coll.Find(ctx, filter)
	if err != nil {
		return err
	}
	defer cur.Close(ctx)
	return cur.All(ctx, dst)
}

func segmentName(seg archivedjobshelpers.ArchivedJobStatsSegment) string {
	switch seg {
	case archivedjobshelpers.SegmentProductionChain:
		return "productionChain"
	case archivedjobshelpers.SegmentRetainedStock:
		return "retainedStock"
	case archivedjobshelpers.SegmentStandaloneRecordedSale:
		return "standaloneRecordedSale"
	default:
		return fmt.Sprintf("unknown(%d)", seg)
	}
}

func docAppliesToCorpRef(lifetimes map[archivedjobshelpers.CorpLifetimeKey]*models.CorpBuildStatsRow, typeID int, wantCorpRef string) bool {
	for k := range lifetimes {
		if k.TypeID == typeID && k.CorpRef == wantCorpRef {
			return true
		}
	}
	return false
}

func countCorpKnownTx(doc *models.ArchivedJobStats) int {
	n := 0
	for _, t := range doc.TransactionLines {
		if t.CorpStatus == "corp_known" {
			n++
		}
	}
	return n
}

func countCorpKnownFees(doc *models.ArchivedJobStats) int {
	n := 0
	for _, f := range doc.FeeLines {
		if f.CorpStatus == "corp_known" {
			n++
		}
	}
	return n
}

func buildDumpHints(
	corpStats *models.CorpBuildStatsRow,
	corpSnapsMerged []models.ArchivedJobStats,
	analysis []dumpCorpSnapshotRow,
	dirtyCorp, dirtyAccount bool,
	nAccountCorpSnaps, nCorpRefCorpSnaps int,
) []string {
	var hints []string
	hints = append(hints, "corp_archived_job_stats: rows from corp_archivedJobs use corpRef + empty accountID — check corpSnapshotsCorpRefScoped (not only accountID filter). GET build-stats/snapshots uses accountID and misses corp-owned rows.")
	if nCorpRefCorpSnaps != nAccountCorpSnaps {
		hints = append(hints, fmt.Sprintf("corpRef-scoped query returned %d row(s); account-scoped returned %d — merged union is used for attribution.", nCorpRefCorpSnaps, nAccountCorpSnaps))
	}
	if corpStats.TotalJobs == 0 && corpStats.JobCostTotal == 0 && corpStats.SalesTotal == 0 {
		hints = append(hints, "corp_build_stats lifetime row for this corp_ref+typeID is missing or all zero (API returns empty aggregate).")
	}
	if dirtyCorp {
		hints = append(hints, "corp_build_stats_dirty_refs still lists this corp_ref — rebuild may be pending, in progress, or failed.")
	}
	if dirtyAccount {
		hints = append(hints, "user_build_stats_dirty_accounts lists this account — personal/user_build_stats rebuild may be pending.")
	}
	if len(corpSnapsMerged) > 0 {
		nContrib := 0
		nMatchCorp := 0
		for _, a := range analysis {
			if a.ContributesToCorpBuildStats {
				nContrib++
			}
			if a.MatchesRequestedCorpRef {
				nMatchCorp++
			}
		}
		if nContrib == 0 {
			hints = append(hints, "No corp_archived_job_stats rows contribute to corp_build_stats under AccumulateCorpBuildStats rules (corp_known tx/fee lines or single linkedIndustryCorpID path).")
		} else if nMatchCorp == 0 && nContrib > 0 {
			hints = append(hints, "Snapshots contribute to corp_build_stats for other corp_ref(s), not the requested corporation — check CorpLifetimeKeysFromThisDoc vs corpRef.")
		}
	}
	return hints
}

