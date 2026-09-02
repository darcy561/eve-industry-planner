package helper_test

import (
	"context"
	"errors"
	"fmt"
	"testing"
	"time"

	"eve-industry-planner/api/helper"
	"eve-industry-planner/shared/models"
	eipmongo "eve-industry-planner/shared/mongo"
	"eve-industry-planner/testing/mongolive"

	"go.mongodb.org/mongo-driver/v2/bson"
	"go.mongodb.org/mongo-driver/v2/mongo"
)

// Call-site live Mongo checks (not unit tests). Same gate as shared/mongo parity:
//
//	EIP_MONGO_PARITY_LIVE=1
//
// Uses scratch account eip-api-live-account; docs deleted in cleanup.
// Exercises API helper + the same Docs put/get paths handlers use after auth/lock gates.

const apiLiveScratchAccount = "eip-api-live-account"

func cleanupAPILiveAccount(t *testing.T, m *eipmongo.Mongo) {
	t.Helper()
	t.Cleanup(func() {
		ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
		defer cancel()
		accountFilter := bson.M{"_meta.accountID": apiLiveScratchAccount}
		idFilter := bson.M{"_id": apiLiveScratchAccount}
		_, _ = m.JobDocuments.Collection().DeleteMany(ctx, accountFilter)
		_, _ = m.Groups.Collection().DeleteMany(ctx, accountFilter)
		_, _ = m.Users.Collection().DeleteMany(ctx, idFilter)
		_, _ = m.ApplicationSettings.Collection().DeleteMany(ctx, idFilter)
		_, _ = m.WatchlistDeprecated.Collection().DeleteMany(ctx, idFilter)
	})
}

func TestLive_ResolveUserDocumentsForLogin(t *testing.T) {
	m := mongolive.Require(t)
	cleanupAPILiveAccount(t, m)

	ctx, cancel := context.WithTimeout(context.Background(), 2*time.Minute)
	defer cancel()

	// Ensure clean slate for first-login path.
	_, _ = m.Users.Collection().DeleteMany(ctx, bson.M{"_id": apiLiveScratchAccount})
	_, _ = m.ApplicationSettings.Collection().DeleteMany(ctx, bson.M{"_id": apiLiveScratchAccount})

	first, err := helper.ResolveUserDocumentsForLogin(ctx, m, apiLiveScratchAccount)
	if err != nil {
		t.Fatalf("first ResolveUserDocumentsForLogin: %v", err)
	}
	if !first.FirstLogin {
		t.Fatalf("expected FirstLogin=true on empty account")
	}
	if first.User.MetaData.AccountID != apiLiveScratchAccount {
		t.Fatalf("user accountID: got %q", first.User.MetaData.AccountID)
	}
	if first.Settings.MetaData.AccountID != apiLiveScratchAccount {
		t.Fatalf("settings accountID: got %q", first.Settings.MetaData.AccountID)
	}

	loadedUser, err := m.LoadUserAccount(ctx, apiLiveScratchAccount)
	if err != nil {
		t.Fatalf("LoadUserAccount after first login: %v", err)
	}
	if loadedUser.MetaData.AccountID != apiLiveScratchAccount {
		t.Fatalf("persisted user accountID: got %q", loadedUser.MetaData.AccountID)
	}
	loadedSettings, err := m.LoadApplicationSettings(ctx, apiLiveScratchAccount, time.Now().UTC())
	if err != nil {
		t.Fatalf("LoadApplicationSettings after first login: %v", err)
	}
	if loadedSettings.MetaData.AccountID != apiLiveScratchAccount {
		t.Fatalf("persisted settings accountID: got %q", loadedSettings.MetaData.AccountID)
	}

	firstLoginAt := first.User.MetaData.LastLoginAt
	time.Sleep(20 * time.Millisecond)

	second, err := helper.ResolveUserDocumentsForLogin(ctx, m, apiLiveScratchAccount)
	if err != nil {
		t.Fatalf("second ResolveUserDocumentsForLogin: %v", err)
	}
	if second.FirstLogin {
		t.Fatalf("expected FirstLogin=false when user already exists")
	}
	if !second.User.MetaData.LastLoginAt.After(firstLoginAt) {
		t.Fatalf("expected lastLoginAt to advance: first=%v second=%v", firstLoginAt, second.User.MetaData.LastLoginAt)
	}
}

func TestLive_JobDocumentsPutGetFlow(t *testing.T) {
	m := mongolive.Require(t)
	cleanupAPILiveAccount(t, m)

	ctx, cancel := context.WithTimeout(context.Background(), 2*time.Minute)
	defer cancel()

	now := time.Now().UTC().Truncate(time.Millisecond)
	job := scratchJob(fmt.Sprintf("eip-api-live-job-%d", now.UnixNano()), "eip-api-live-job")

	// Same Docs call path as PutJobDocumentsHandler after lock gate.
	result, failed, err := m.JobDocuments.BulkUpsertJobs(ctx, apiLiveScratchAccount, []models.Job{job}, now, "api-live-sess", "api-live-client")
	if err != nil {
		t.Fatalf("BulkUpsertJobs: %v", err)
	}
	if failed != 0 || result == nil {
		t.Fatalf("BulkUpsertJobs: failed=%d result=%v", failed, result)
	}
	if result.UpsertedCount+result.ModifiedCount < 1 {
		t.Fatalf("BulkUpsertJobs: expected write, got %+v", result)
	}

	got, err := m.JobDocuments.LoadJobByID(ctx, apiLiveScratchAccount, job.JobID)
	if err != nil {
		t.Fatalf("LoadJobByID: %v", err)
	}
	if got.JobID != job.JobID || got.Name != job.Name {
		t.Fatalf("loaded job mismatch: id=%q name=%q", got.JobID, got.Name)
	}
	if got.MetaData.AccountID != apiLiveScratchAccount {
		t.Fatalf("loaded accountID: got %q", got.MetaData.AccountID)
	}
	if got.MetaData.LastUpdatedBy != apiLiveScratchAccount {
		t.Fatalf("loaded lastUpdatedBy: got %q", got.MetaData.LastUpdatedBy)
	}
	if got.MetaData.SessionID != "api-live-sess" || got.MetaData.ClientID != "api-live-client" {
		t.Fatalf("session/client meta: sess=%q client=%q", got.MetaData.SessionID, got.MetaData.ClientID)
	}

	// Wrong account must not see the doc (handler ownership filter).
	_, err = m.JobDocuments.LoadJobByID(ctx, "eip-api-live-other", job.JobID)
	if err == nil {
		t.Fatal("expected LoadJobByID to fail for other account")
	}
	if !errors.Is(err, mongo.ErrNoDocuments) {
		t.Fatalf("expected ErrNoDocuments for other account, got %v", err)
	}
}

func TestLive_GroupsPutGetFlow(t *testing.T) {
	m := mongolive.Require(t)
	cleanupAPILiveAccount(t, m)

	ctx, cancel := context.WithTimeout(context.Background(), 2*time.Minute)
	defer cancel()

	now := time.Now().UTC().Truncate(time.Millisecond)
	group := scratchGroup(fmt.Sprintf("eip-api-live-group-%d", now.UnixNano()), "eip-api-live-group")

	res, err := m.Groups.BulkUpsertGroups(ctx, apiLiveScratchAccount, []models.Group{group}, now, "api-live-sess", "api-live-client")
	if err != nil {
		t.Fatalf("BulkUpsertGroups: %v", err)
	}
	if res == nil || res.UpsertedCount+res.ModifiedCount < 1 {
		t.Fatalf("BulkUpsertGroups: unexpected result %+v", res)
	}

	got, err := m.Groups.LoadGroupByID(ctx, apiLiveScratchAccount, group.GroupID)
	if err != nil {
		t.Fatalf("LoadGroupByID: %v", err)
	}
	if got.GroupID != group.GroupID || got.GroupName != group.GroupName {
		t.Fatalf("loaded group mismatch: id=%q name=%q", got.GroupID, got.GroupName)
	}
	if got.MetaData.AccountID != apiLiveScratchAccount {
		t.Fatalf("loaded accountID: got %q", got.MetaData.AccountID)
	}
	if got.MetaData.SessionID != "api-live-sess" || got.MetaData.ClientID != "api-live-client" {
		t.Fatalf("session/client meta: sess=%q client=%q", got.MetaData.SessionID, got.MetaData.ClientID)
	}
}

func TestLive_UserAndSettingsUpsertReload(t *testing.T) {
	m := mongolive.Require(t)
	cleanupAPILiveAccount(t, m)

	ctx, cancel := context.WithTimeout(context.Background(), 2*time.Minute)
	defer cancel()

	now := time.Now().UTC().Truncate(time.Millisecond)
	userDoc := models.DefaultUserAccountDocument(apiLiveScratchAccount, now)
	userDoc.ShareCitadelNames = false
	userDoc.HasCompletedFirstLoginFlow = true
	userDoc.MetaData.SessionID = "api-live-sess"
	userDoc.MetaData.ClientID = "api-live-client"

	ures, _, err := m.Users.UpsertUserAccount(ctx, apiLiveScratchAccount, userDoc)
	if err != nil {
		t.Fatalf("UpsertUserAccount: %v", err)
	}
	if ures == nil || ures.UpsertedCount+ures.MatchedCount < 1 {
		t.Fatalf("UpsertUserAccount: unexpected result %+v", ures)
	}

	gotUser, err := m.LoadUserAccount(ctx, apiLiveScratchAccount)
	if err != nil {
		t.Fatalf("LoadUserAccount: %v", err)
	}
	if gotUser.ShareCitadelNames {
		t.Fatal("expected ShareCitadelNames=false after upsert")
	}
	if !gotUser.HasCompletedFirstLoginFlow {
		t.Fatal("expected HasCompletedFirstLoginFlow=true after upsert")
	}
	if gotUser.MetaData.ClientID != "api-live-client" {
		t.Fatalf("user clientID: got %q", gotUser.MetaData.ClientID)
	}

	settings := models.DefaultApplicationSettings(apiLiveScratchAccount, now)
	settings.DefaultMarketLocation = "amarr"
	settings.MetaData.SessionID = "api-live-sess"
	settings.MetaData.ClientID = "api-live-client"

	sres, _, err := m.ApplicationSettings.UpsertApplicationSettings(ctx, apiLiveScratchAccount, settings)
	if err != nil {
		t.Fatalf("UpsertApplicationSettings: %v", err)
	}
	if sres == nil || sres.UpsertedCount+sres.MatchedCount < 1 {
		t.Fatalf("UpsertApplicationSettings: unexpected result %+v", sres)
	}

	gotSettings, err := m.LoadApplicationSettings(ctx, apiLiveScratchAccount, now)
	if err != nil {
		t.Fatalf("LoadApplicationSettings: %v", err)
	}
	if gotSettings.DefaultMarketLocation != "amarr" {
		t.Fatalf("DefaultMarketLocation: got %q", gotSettings.DefaultMarketLocation)
	}
	if gotSettings.MetaData.ClientID != "api-live-client" {
		t.Fatalf("settings clientID: got %q", gotSettings.MetaData.ClientID)
	}
}

func TestLive_WatchlistPutGetFlow(t *testing.T) {
	m := mongolive.Require(t)
	cleanupAPILiveAccount(t, m)

	ctx, cancel := context.WithTimeout(context.Background(), 2*time.Minute)
	defer cancel()

	now := time.Now().UTC().Truncate(time.Millisecond)
	groups := []any{bson.M{"name": "eip-api-live-wl"}}
	items := []any{bson.M{"typeID": 34}}

	result, err := m.WatchlistDeprecated.UpsertWatchlistDeprecated(ctx, apiLiveScratchAccount, groups, items, now, "api-live-sess", "api-live-client")
	if err != nil {
		t.Fatalf("UpsertWatchlistDeprecated: %v", err)
	}
	if result == nil || result.UpsertedCount+result.MatchedCount < 1 {
		t.Fatalf("UpsertWatchlistDeprecated: unexpected result %+v", result)
	}

	raw, err := m.WatchlistDeprecated.LoadWatchlistDeprecated(ctx, apiLiveScratchAccount)
	if err != nil {
		t.Fatalf("LoadWatchlistDeprecated: %v", err)
	}
	if raw["_id"] != apiLiveScratchAccount {
		t.Fatalf("watchlist _id: got %#v", raw["_id"])
	}
	meta, ok := raw["_meta"].(bson.M)
	if !ok {
		t.Fatalf("watchlist _meta type: %T", raw["_meta"])
	}
	if meta["accountID"] != apiLiveScratchAccount {
		t.Fatalf("watchlist accountID: got %#v", meta["accountID"])
	}
	if meta["sessionID"] != "api-live-sess" || meta["clientID"] != "api-live-client" {
		t.Fatalf("watchlist session/client: %#v / %#v", meta["sessionID"], meta["clientID"])
	}
	if _, ok := raw["groups"]; !ok {
		t.Fatal("watchlist missing groups")
	}
	if _, ok := raw["items"]; !ok {
		t.Fatal("watchlist missing items")
	}
}

func TestLive_JobDocumentsDeleteFlow(t *testing.T) {
	m := mongolive.Require(t)
	cleanupAPILiveAccount(t, m)

	ctx, cancel := context.WithTimeout(context.Background(), 2*time.Minute)
	defer cancel()

	now := time.Now().UTC().Truncate(time.Millisecond)
	job := scratchJob(fmt.Sprintf("eip-api-live-del-job-%d", now.UnixNano()), "eip-api-live-del")
	if _, failed, err := m.JobDocuments.BulkUpsertJobs(ctx, apiLiveScratchAccount, []models.Job{job}, now, "api-live-sess", "api-live-client"); err != nil || failed != 0 {
		t.Fatalf("seed BulkUpsertJobs: failed=%d err=%v", failed, err)
	}

	filter := bson.M{
		"_meta.accountID": apiLiveScratchAccount,
		"_id":             bson.M{"$in": []string{job.JobID}},
	}
	deleted, err := m.JobDocuments.DeleteManyAfterStampingMeta(ctx, filter, now, "api-live-sess", "api-live-client",
		eipmongo.WithOpName("api live delete job documents"))
	if err != nil {
		t.Fatalf("DeleteManyAfterStampingMeta jobs: %v", err)
	}
	if deleted != 1 {
		t.Fatalf("deleted count: got %d want 1", deleted)
	}
	_, err = m.JobDocuments.LoadJobByID(ctx, apiLiveScratchAccount, job.JobID)
	if err == nil {
		t.Fatal("expected job gone after delete")
	}
	if !errors.Is(err, mongo.ErrNoDocuments) {
		t.Fatalf("expected ErrNoDocuments after delete, got %v", err)
	}
}

func TestLive_GroupsDeleteFlow(t *testing.T) {
	m := mongolive.Require(t)
	cleanupAPILiveAccount(t, m)

	ctx, cancel := context.WithTimeout(context.Background(), 2*time.Minute)
	defer cancel()

	now := time.Now().UTC().Truncate(time.Millisecond)
	group := scratchGroup(fmt.Sprintf("eip-api-live-del-group-%d", now.UnixNano()), "eip-api-live-del-group")
	if res, err := m.Groups.BulkUpsertGroups(ctx, apiLiveScratchAccount, []models.Group{group}, now, "api-live-sess", "api-live-client"); err != nil || res == nil {
		t.Fatalf("seed BulkUpsertGroups: res=%v err=%v", res, err)
	}

	filter := bson.M{
		"_meta.accountID": apiLiveScratchAccount,
		"_id":             bson.M{"$in": []string{group.GroupID}},
	}
	deleted, err := m.Groups.DeleteManyAfterStampingMeta(ctx, filter, now, "api-live-sess", "api-live-client",
		eipmongo.WithOpName("api live delete groups"))
	if err != nil {
		t.Fatalf("DeleteManyAfterStampingMeta groups: %v", err)
	}
	if deleted != 1 {
		t.Fatalf("deleted count: got %d want 1", deleted)
	}
	_, err = m.Groups.LoadGroupByID(ctx, apiLiveScratchAccount, group.GroupID)
	if err == nil {
		t.Fatal("expected group gone after delete")
	}
	if !errors.Is(err, mongo.ErrNoDocuments) {
		t.Fatalf("expected ErrNoDocuments after delete, got %v", err)
	}
}

func TestLive_JobsGroupsListFlows(t *testing.T) {
	m := mongolive.Require(t)
	cleanupAPILiveAccount(t, m)

	ctx, cancel := context.WithTimeout(context.Background(), 2*time.Minute)
	defer cancel()

	now := time.Now().UTC().Truncate(time.Millisecond)
	jobA := scratchJob(fmt.Sprintf("eip-api-live-list-a-%d", now.UnixNano()), "list-a")
	jobB := scratchJob(fmt.Sprintf("eip-api-live-list-b-%d", now.UnixNano()), "list-b")
	group := scratchGroup(fmt.Sprintf("eip-api-live-list-g-%d", now.UnixNano()), "list-group")

	if _, failed, err := m.JobDocuments.BulkUpsertJobs(ctx, apiLiveScratchAccount, []models.Job{jobA, jobB}, now, "api-live-sess", "api-live-client"); err != nil || failed != 0 {
		t.Fatalf("BulkUpsertJobs: failed=%d err=%v", failed, err)
	}
	if _, err := m.Groups.BulkUpsertGroups(ctx, apiLiveScratchAccount, []models.Group{group}, now, "api-live-sess", "api-live-client"); err != nil {
		t.Fatalf("BulkUpsertGroups: %v", err)
	}

	byIDs, err := m.JobDocuments.LoadJobsByFilter(ctx, apiLiveScratchAccount, bson.M{
		"_meta.accountID": apiLiveScratchAccount,
		"_id":             bson.M{"$in": []string{jobA.JobID, jobB.JobID}},
	})
	if err != nil {
		t.Fatalf("LoadJobsByFilter: %v", err)
	}
	if len(byIDs) != 2 {
		t.Fatalf("LoadJobsByFilter: got %d jobs want 2", len(byIDs))
	}

	groups, err := m.Groups.LoadGroupsByAccount(ctx, apiLiveScratchAccount)
	if err != nil {
		t.Fatalf("LoadGroupsByAccount: %v", err)
	}
	found := false
	for _, g := range groups {
		if g.GroupID == group.GroupID {
			found = true
			break
		}
	}
	if !found {
		t.Fatalf("LoadGroupsByAccount missing group %s (got %d)", group.GroupID, len(groups))
	}
}

func TestLive_GroupsMembershipDelta(t *testing.T) {
	m := mongolive.Require(t)
	cleanupAPILiveAccount(t, m)

	ctx, cancel := context.WithTimeout(context.Background(), 2*time.Minute)
	defer cancel()

	now := time.Now().UTC().Truncate(time.Millisecond)
	jobID := fmt.Sprintf("eip-api-live-mem-job-%d", now.UnixNano())
	groupID := fmt.Sprintf("eip-api-live-mem-group-%d", now.UnixNano())
	group := scratchGroup(groupID, "membership")
	group.IncludedJobIDs = []string{}

	if _, err := m.Groups.BulkUpsertGroups(ctx, apiLiveScratchAccount, []models.Group{group}, now, "api-live-sess", "api-live-client"); err != nil {
		t.Fatalf("seed group: %v", err)
	}

	group.IncludedJobIDs = []string{jobID}
	res, err := m.Groups.BulkUpsertGroups(ctx, apiLiveScratchAccount, []models.Group{group}, now.Add(time.Second), "api-live-sess", "api-live-client")
	if err != nil {
		t.Fatalf("BulkUpsertGroups with membership: %v", err)
	}
	if res == nil {
		t.Fatal("BulkUpsertGroups returned nil result")
	}
	added := false
	for _, d := range res.Deltas {
		if d.GroupID != groupID {
			continue
		}
		for _, id := range d.AddedJobIDs {
			if id == jobID {
				added = true
			}
		}
	}
	if !added {
		t.Fatalf("expected AddedJobIDs to include %s; deltas=%+v", jobID, res.Deltas)
	}

	got, err := m.Groups.LoadGroupByID(ctx, apiLiveScratchAccount, groupID)
	if err != nil {
		t.Fatalf("LoadGroupByID: %v", err)
	}
	if len(got.IncludedJobIDs) != 1 || got.IncludedJobIDs[0] != jobID {
		t.Fatalf("IncludedJobIDs: got %v", got.IncludedJobIDs)
	}
}

func scratchJob(jobID, name string) models.Job {
	return models.Job{
		JobID:            jobID,
		Name:             name,
		ItemID:           34,
		DisplayOnPlanner: true,
		APIJobs:          []int{},
		APIOrders:        []int{},
		APITransactions:  []int{},
		ParentJobs:       []string{},
		Build: models.JobBuild{
			Setup:     map[string]models.JobSetup{},
			ChildJobs: map[string][]string{},
			Materials: []models.JobMaterial{},
		},
		Skills: []models.Skill{},
		MetaData: models.JobMetaData{
			MetaData: models.MetaData{AccountID: apiLiveScratchAccount},
		},
	}
}

func scratchGroup(groupID, name string) models.Group {
	return models.Group{
		GroupID:         groupID,
		GroupName:       name,
		IncludedJobIDs:  []string{},
		IncludedTypeIDs: []int{},
		MaterialIDs:     []int{},
		AreComplete:     []string{},
		LinkedJobIDs:    []int64{},
		LinkedOrderIDs:  []int64{},
		LinkedTransIDs:  []int64{},
		MetaData: models.GroupMetaData{
			MetaData: models.MetaData{AccountID: apiLiveScratchAccount},
		},
	}
}
