package mongo_test

import (
	"context"
	"fmt"
	"testing"
	"time"

	"eve-industry-planner/shared/models"
	eipmongo "eve-industry-planner/shared/mongo"
	"eve-industry-planner/testing/mongolive"

	"go.mongodb.org/mongo-driver/v2/bson"
	"go.mongodb.org/mongo-driver/v2/mongo/options"
)

func TestLive_customStructures_foldsStoredLanes(t *testing.T) {
	mongo := mongolive.Require(t)
	ctx, cancel := context.WithTimeout(context.Background(), time.Minute)
	defer cancel()

	settingsColl := mongo.ApplicationSettings.Collection()
	settingsID := fmt.Sprintf("%s-structure-fold", parityScratchAccount)

	t.Cleanup(func() {
		cctx, c := context.WithTimeout(context.Background(), 30*time.Second)
		defer c()
		_, _ = settingsColl.DeleteOne(cctx, bson.M{"_id": settingsID})
	})

	now := time.Now().UTC()
	seedDoc := models.DefaultApplicationSettings(settingsID, now)
	seed, err := eipmongo.StructToMongoDoc(seedDoc, settingsID)
	if err != nil {
		t.Fatalf("build seed document: %v", err)
	}
	delete(seed, "schemaVersion")
	seed["customStructures"] = bson.M{
		"manufacturing": []bson.M{{"id": "manStruct-fold", "name": "Sotiyo", "rigType": 3, "systemID": int64(30000142), "tax": 1.5, "default": true}},
		"reaction":      []bson.M{{"id": "reacStruct-fold", "name": "Tatara"}},
		"reprocessing":  []bson.M{{"id": "reprocessingStruct-fold", "name": "Athanor", "rigSlot1": 7, "rigSlot2": 8, "implant": 4}},
		"invention":     []bson.M{{"id": "inventionStruct-fold", "name": "Raitaru", "rigSlot1": 9}},
	}

	if _, err := settingsColl.ReplaceOne(ctx, bson.M{"_id": settingsID}, seed, options.Replace().SetUpsert(true)); err != nil {
		t.Fatalf("seed settings: %v", err)
	}

	doc, err := mongo.LoadApplicationSettings(ctx, settingsID, now)
	if err != nil {
		t.Fatalf("LoadApplicationSettings: %v", err)
	}

	if len(doc.CustomStructures) != 4 {
		t.Fatalf("read %d structures, want the 4 seeded: %+v", len(doc.CustomStructures), doc.CustomStructures)
	}

	byID := map[string]models.CustomStructure{}
	for _, row := range doc.CustomStructures {
		byID[row.ID] = row
	}
	for id, wantJobType := range map[string]int{
		"manStruct-fold":          models.JobTypeManufacturing,
		"reacStruct-fold":         models.JobTypeReaction,
		"reprocessingStruct-fold": models.JobTypeReprocessing,
		"inventionStruct-fold":    models.JobTypeInvention,
	} {
		row, found := byID[id]
		if !found {
			t.Fatalf("row %q was lost in the fold", id)
		}
		if row.JobType != wantJobType {
			t.Errorf("row %q jobType = %d, want %d", id, row.JobType, wantJobType)
		}
	}

	if row := byID["manStruct-fold"]; row.RigType != 3 || row.SystemID != 30000142 || row.Tax != 1.5 || !row.Default {
		t.Errorf("manufacturing row lost fields in the fold: %+v", row)
	}
	if row := byID["reprocessingStruct-fold"]; row.RigSlot1 != 7 || row.RigSlot2 != 8 || row.Implant != 4 {
		t.Errorf("reprocessing row lost fields in the fold: %+v", row)
	}

	if _, _, err := mongo.ApplicationSettings.UpsertApplicationSettings(ctx, settingsID, doc); err != nil {
		t.Fatalf("UpsertApplicationSettings: %v", err)
	}

	stored := loadRawByID(t, ctx, settingsColl, settingsID)
	if _, isDoc := stored["customStructures"].(bson.M); isDoc {
		t.Fatalf("customStructures was written back as keyed lists, want one array: %+v", stored["customStructures"])
	}

	reread, err := mongo.LoadApplicationSettings(ctx, settingsID, now)
	if err != nil {
		t.Fatalf("re-read settings: %v", err)
	}
	if len(reread.CustomStructures) != len(doc.CustomStructures) {
		t.Fatalf("second read gave %d rows, first gave %d", len(reread.CustomStructures), len(doc.CustomStructures))
	}
	for i := range doc.CustomStructures {
		if doc.CustomStructures[i] != reread.CustomStructures[i] {
			t.Errorf("row %d changed on the second read:\n first: %+v\nsecond: %+v",
				i, doc.CustomStructures[i], reread.CustomStructures[i])
		}
	}
}
