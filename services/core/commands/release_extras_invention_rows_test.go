package commands

import (
	"strings"
	"testing"

	"eve-industry-planner/shared/models"

	"go.mongodb.org/mongo-driver/v2/bson"
)

func jobWithRows(extras, invention bson.M) bson.M {
	return bson.M{"_id": "job-1", "build": bson.M{"extrasCosts": extras, "inventionEntries": invention}}
}

func TestNormaliseRows_aNumericInventionIDIsWrittenAsTheStringItIsKeyedBy(t *testing.T) {
	t.Parallel()

	doc := jobWithRows(bson.M{}, bson.M{
		"1712345678901": bson.M{"version": int32(1), "id": int64(1712345678901), "itemName": "Datacore", "itemCost": 1500.0},
	})

	set, report := normaliseExtrasAndInventionRowsInDocument(doc)

	row := asDocument(set["build.inventionEntries.1712345678901"])
	if row["id"] != "1712345678901" || row["itemName"] != "Datacore" || row["itemCost"] != 1500.0 {
		t.Fatalf("normalised row = %v", row)
	}
	if report.Normalised != 1 || len(report.Refusals) != 0 {
		t.Errorf("report = %+v", report)
	}
}

func TestNormaliseRows_anIDStoredAsADoubleKeepsItsDigits(t *testing.T) {
	t.Parallel()

	doc := jobWithRows(bson.M{}, bson.M{
		"1712345678901": bson.M{"version": int32(1), "id": 1712345678901.0, "itemName": "Datacore", "itemCost": 1.0},
	})

	set, report := normaliseExtrasAndInventionRowsInDocument(doc)

	if got := asDocument(set["build.inventionEntries.1712345678901"])["id"]; got != "1712345678901" {
		t.Errorf("id = %v, want the integer's digits", got)
	}
	if len(report.Refusals) != 0 {
		t.Errorf("refusals = %v", report.Refusals)
	}
}

func TestNormaliseRows_aCorrectlyTypedRowIsLeftAsItIs(t *testing.T) {
	t.Parallel()

	doc := jobWithRows(
		bson.M{"e-1": bson.M{"id": "e-1", "extraText": "Courier", "extraValue": 120000.0}},
		bson.M{"i-1": bson.M{"version": int32(1), "id": "i-1", "itemName": "Datacore", "itemCost": int32(5)}},
	)

	set, report := normaliseExtrasAndInventionRowsInDocument(doc)

	if len(set) != 0 || report.Normalised != 0 || len(report.Refusals) != 0 {
		t.Errorf("set %v report %+v, want nothing touched", set, report)
	}
}

func TestNormaliseRows_aRewrittenExtraWithoutACategoryIsFiledAsTheModelReadsIt(t *testing.T) {
	t.Parallel()

	doc := jobWithRows(bson.M{"e-1": bson.M{"id": "e-1", "extraText": "Courier", "extraValue": "120000"}}, bson.M{})

	set, _ := normaliseExtrasAndInventionRowsInDocument(doc)

	row := asDocument(set["build.extrasCosts.e-1"])
	if row["extraValue"] != 120000.0 {
		t.Fatalf("extraValue = %v, want the number the string held", row["extraValue"])
	}
	if row["category"] != models.ExtrasCategoryUnassigned {
		t.Errorf("category = %v, want the unassigned category every reader already files it under", row["category"])
	}
}

func TestNormaliseRows_aCorrectlyTypedExtraWithoutACategoryKeepsHavingNone(t *testing.T) {
	t.Parallel()

	doc := jobWithRows(bson.M{"e-1": bson.M{"id": "e-1", "extraText": "Courier", "extraValue": 120000.0}}, bson.M{})

	if set, _ := normaliseExtrasAndInventionRowsInDocument(doc); len(set) != 0 {
		t.Errorf("set = %v, want a well-typed row left alone", set)
	}
}

func TestNormaliseRows_aRowWhoseIDDisagreesWithItsKeyIsRefused(t *testing.T) {
	t.Parallel()

	doc := jobWithRows(bson.M{}, bson.M{
		"i-1": bson.M{"version": int32(1), "id": int64(99), "itemName": "Datacore", "itemCost": 1.0},
	})

	set, report := normaliseExtrasAndInventionRowsInDocument(doc)

	if len(set) != 0 {
		t.Errorf("set = %v, want nothing written for a refused row", set)
	}
	if len(report.Refusals) != 1 || !strings.Contains(report.Refusals[0], "build.inventionEntries.i-1") {
		t.Errorf("refusals = %v, want the row named", report.Refusals)
	}
}

func TestNormaliseRows_aDocumentWithoutRowsAsksForNothing(t *testing.T) {
	t.Parallel()

	for name, doc := range map[string]bson.M{
		"no build":         {"_id": "job-1"},
		"empty rows":       jobWithRows(bson.M{}, bson.M{}),
		"rows not present": {"_id": "job-1", "build": bson.M{"materials": bson.M{}}},
	} {
		t.Run(name, func(t *testing.T) {
			t.Parallel()
			set, report := normaliseExtrasAndInventionRowsInDocument(doc)
			if len(set) != 0 || report.Normalised != 0 || len(report.Refusals) != 0 {
				t.Errorf("set %v report %+v", set, report)
			}
		})
	}
}

func TestNormaliseRows_followsTheReshapeOnAJobInTheShapeLiveHoldsIt(t *testing.T) {
	t.Parallel()

	live := bson.M{"_id": "job-1", "build": bson.M{"costs": bson.M{
		"extrasCosts": bson.A{bson.M{"id": "e-1", "extraText": "Courier", "extraValue": 120000.0}},
		"inventionEntries": bson.A{
			bson.M{"id": int64(1712345678901), "itemName": "Datacore", "itemCost": 1500.0},
			bson.M{"id": 1712345678902.0, "itemName": "Decryptor", "itemCost": 800.0},
		},
	}}}

	reshaped, reshapeReport := reshapeJobDocument(live, mintNegativeTransactionID)
	if len(reshapeReport.Refusals) != 0 {
		t.Fatalf("reshape refused: %v", reshapeReport.Refusals)
	}
	set, report := normaliseExtrasAndInventionRowsInDocument(reshaped)

	if len(report.Refusals) != 0 || report.Normalised != 2 {
		t.Fatalf("report = %+v, want both invention rows normalised and nothing refused", report)
	}
	for _, id := range []string{"1712345678901", "1712345678902"} {
		if got := asDocument(set["build.inventionEntries."+id])["id"]; got != id {
			t.Errorf("row keyed %s carries id %v", id, got)
		}
	}
	if _, touched := set["build.extrasCosts.e-1"]; touched {
		t.Error("a well-typed extras row was rewritten")
	}
}
