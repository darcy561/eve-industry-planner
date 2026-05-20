package archiveimport

import (
	"encoding/json"
	"math"
	"os"
	"path/filepath"
	"runtime"
	"strings"
	"testing"
	"time"

	"eve-industry-planner/shared/shared/models"

	"go.mongodb.org/mongo-driver/bson"
)

func TestJobFromFirestoreMap_legacyNumericJobIDAndFlatBlueprintFields(t *testing.T) {
	doc := map[string]any{
		"jobID":              float64(1640347432587),
		"jobType":            float64(1),
		"name":               "Test Job",
		"itemID":             float64(213),
		"maxProductionLimit": float64(600),
		"jobStatus":          float64(4),
		"volume":             float64(0.015),
		"archived":           true,
		"archiveProcessed":   true,
		"apiJobs":            []any{float64(1)},
		"bpME":               float64(3),
		"bpTE":               float64(0),
		"runCount":           float64(3),
		"jobCount":           float64(4),
		"structureType":      float64(0),
		"rigType":            float64(0),
		"systemType":         float64(1),
		"rawData": map[string]any{
			"products": []any{
				map[string]any{"quantity": float64(100), "typeID": float64(213)},
			},
			"time": float64(300),
		},
		"build": map[string]any{
			"buildChar": nil,
			"products": map[string]any{
				"quantityPerJob": float64(300),
				"totalQuantity":  float64(1200),
			},
			"costs": map[string]any{
				"extrasCosts":    []any{},
				"totalPurchaseCost": float64(100),
				"installCosts":   float64(10),
				"linkedJobs":     []any{},
			},
			"materials": []any{
				map[string]any{
					"typeID":   float64(34),
					"name":     "Trit",
					"quantity": float64(1),
					"jobType":  float64(0),
					"volume":   float64(0.01),
				},
			},
			"sale": map[string]any{
				"marketOrders": []any{
					map[string]any{
						"order_id":       float64(1),
						"price":          float64(11.35),
						"duration":     float64(90),
						"is_corporation": false,
						"type_id":        float64(213),
						"volume_total":   float64(100),
						"volume_remain":  float64(0),
						"range":          "region",
						"region_id":      float64(1),
						"location_id":    float64(2),
						"issued":         "2021-12-28T19:12:35Z",
					},
				},
				"transactions": []any{},
				"brokersFee":   []any{},
			},
		},
		"skills": []any{},
		"parentJob": []any{},
	}

	job, err := JobFromFirestoreMap(doc, "acct-1")
	if err != nil {
		t.Fatal(err)
	}
	if job.JobID != "job-1640347432587" {
		t.Fatalf("jobID: got %q", job.JobID)
	}
	if job.MetaData.AccountID != "acct-1" {
		t.Fatalf("_meta.accountID: got %q", job.MetaData.AccountID)
	}
	if !job.DisplayOnPlanner {
		t.Fatal("expected DisplayOnPlanner true without groupID")
	}
	if job.GroupID != "" {
		t.Fatalf("groupID: got %q want \"\"", job.GroupID)
	}
	if job.IncludedInGroup {
		t.Fatal("expected IncludedInGroup false without groupID")
	}
	if len(job.Build.Setup) != 1 {
		t.Fatalf("setup keys: %d", len(job.Build.Setup))
	}
	var su models.JobSetup
	for _, s := range job.Build.Setup {
		su = s
		break
	}
	if su.ID == "" || su.ID == "legacy" {
		t.Fatalf("setup id: %q", su.ID)
	}
	if su.RunCount != 3 || su.ME != 3 || su.JobCount != 4 || su.JobType != 1 {
		t.Fatalf("setup: %+v", su)
	}
	if su.StructureID != 0 || su.RigID != 0 {
		t.Fatalf("structure/rig: %d %d", su.StructureID, su.RigID)
	}
	if su.SystemTypeID != 0 {
		t.Fatalf("systemTypeID: %d (v7 maps root systemType value 1 → id 0)", su.SystemTypeID)
	}
	if su.SystemID != 30000142 {
		t.Fatalf("systemID: %d", su.SystemID)
	}
	if su.TaxValue != 0.25 {
		t.Fatalf("taxValue: %v", su.TaxValue)
	}
	if su.RawTime != 300 {
		t.Fatalf("rawTime: %v", su.RawTime)
	}
	mc, ok := su.MaterialCount["34"]
	if !ok || mc.Quantity != 1 || mc.RawQuantity != 1 || mc.TypeID != 34 {
		t.Fatalf("materialCount[34]: %+v ok=%v", mc, ok)
	}
	if job.ItemsProducedPerRun != 100 {
		t.Fatalf("ItemsProducedPerRun: %d", job.ItemsProducedPerRun)
	}
	if len(job.Build.Sale.MarketOrders) != 1 {
		t.Fatalf("market orders: %d", len(job.Build.Sale.MarketOrders))
	}
	if job.Build.Sale.MarketOrders[0].ItemPrice != 11.35 {
		t.Fatalf("item_price remap: %v", job.Build.Sale.MarketOrders[0].ItemPrice)
	}
	if job.Build.Sale.MarketOrders[0].Range != "region" {
		t.Fatalf("range: %q (ESI string range must survive import)", job.Build.Sale.MarketOrders[0].Range)
	}
}

func TestJobFromFirestoreMap_extrasCostsRemapAndLinkedJobType(t *testing.T) {
	doc := map[string]any{
		"jobID":    float64(1),
		"jobType":  float64(2),
		"name":     "X",
		"itemID":   float64(1),
		"jobStatus": float64(0),
		"volume":   float64(1),
		"archived": true,
		"maxProductionLimit": float64(1),
		"rawData": map[string]any{
			"products": []any{map[string]any{"quantity": float64(1), "typeID": float64(1)}},
		},
		"build": map[string]any{
			"products": map[string]any{"totalQuantity": float64(1)},
			"costs": map[string]any{
				"extrasCosts": []any{
					map[string]any{
						"id":         "extras-row-1",
						"extraText":  "Fee",
						"extraValue": float64(12.5),
						"category":   float64(3), // matches extras.jsx numeric category id
					},
				},
				"linkedJobs": []any{
					map[string]any{"job_id": float64(99), "status": "delivered"},
				},
			},
			"materials": []any{},
			"sale":      map[string]any{"marketOrders": []any{}, "transactions": []any{}, "brokersFee": []any{}},
		},
		"bpME":     float64(0),
		"runCount": float64(1),
		"jobCount": float64(1),
	}

	job, err := JobFromFirestoreMap(doc, "a")
	if err != nil {
		t.Fatal(err)
	}
	if len(job.Build.Costs.ExtrasCosts) != 1 {
		t.Fatal(len(job.Build.Costs.ExtrasCosts))
	}
	ex := job.Build.Costs.ExtrasCosts[0]
	if ex.ExtraText != "Fee" || ex.ExtraValue != 12.5 || ex.Category != "3" {
		t.Fatalf("%+v", ex)
	}
	if ex.ID != "extras-row-1" {
		t.Fatalf("extras id: %q", ex.ID)
	}
	if len(job.Build.Costs.LinkedJobs) != 1 || job.Build.Costs.LinkedJobs[0].JobType != 2 {
		t.Fatalf("%+v", job.Build.Costs.LinkedJobs)
	}
	if job.JobID != "job-1" {
		t.Fatalf("jobID: %q", job.JobID)
	}
}

func TestJobFromFirestoreMap_extrasCosts_missingCategoryDefaultsToZero(t *testing.T) {
	doc := map[string]any{
		"jobID":               float64(2),
		"jobType":             float64(1),
		"name":                "Y",
		"itemID":              float64(34),
		"jobStatus":           float64(0),
		"volume":              float64(1),
		"archived":            true,
		"maxProductionLimit":  float64(1),
		"rawData":             map[string]any{"products": []any{map[string]any{"quantity": float64(1), "typeID": float64(1)}}},
		"bpME":                float64(0),
		"runCount":            float64(1),
		"jobCount":            float64(1),
		"build": map[string]any{
			"products":  map[string]any{"totalQuantity": float64(1)},
			"materials": []any{},
			"sale":      map[string]any{"marketOrders": []any{}, "transactions": []any{}, "brokersFee": []any{}},
			"costs": map[string]any{
				"extrasCosts": []any{
					map[string]any{
						"extraText":  "No category",
						"extraValue": float64(1),
					},
				},
				"linkedJobs": []any{},
			},
		},
	}

	job, err := JobFromFirestoreMap(doc, "a")
	if err != nil {
		t.Fatal(err)
	}
	if len(job.Build.Costs.ExtrasCosts) != 1 {
		t.Fatal(len(job.Build.Costs.ExtrasCosts))
	}
	if job.Build.Costs.ExtrasCosts[0].Category != "" {
		t.Fatalf("want category \"\", got %q", job.Build.Costs.ExtrasCosts[0].Category)
	}
}

func TestJobFromFirestoreMap_modernShapeRoundTripMeta(t *testing.T) {
	// Minimal modern doc: setup already under build, string jobID, linked uses isCorp
	doc := map[string]any{
		"jobID":              "job-uuid-1",
		"jobType":            float64(1),
		"name":               "Modern",
		"itemID":             float64(2420),
		"maxProductionLimit": float64(10),
		"jobStatus":          float64(4),
		"volume":             float64(20),
		"archived":           true,
		"itemsProducedPerRun": float64(1),
		"buildVer":           "0.7.65",
		"groupID":            nil,
		"build": map[string]any{
			"childJobs": map[string]any{"11399": []any{}},
			"setup": map[string]any{
				"sid": map[string]any{
					"id": "sid", "runCount": float64(1), "jobCount": float64(1),
					"ME": float64(3), "TE": float64(1), "jobType": float64(1),
					"materialCount": map[string]any{},
				},
			},
			"products": map[string]any{"totalQuantity": float64(13)},
			"costs": map[string]any{
				"extrasCosts":   []any{},
				"linkedJobs": []any{
					map[string]any{
						"job_id": float64(1), "status": "delivered", "isCorp": true,
						"runs": float64(1), "start_date": "x", "end_date": "y",
						"cost": float64(0),
					},
				},
			},
			"materials": []any{},
			"sale": map[string]any{
				"marketOrders": []any{}, "transactions": []any{}, "brokersFee": []any{},
			},
		},
		"rawData": map[string]any{"materials": []any{}, "products": []any{}, "time": float64(0)},
		"skills":  []any{},
		"parentJob": []any{},
	}

	cj := doc["build"].(map[string]any)["costs"].(map[string]any)
	lj := cj["linkedJobs"].([]any)[0].(map[string]any)
	lj["blueprint_type_id"] = float64(1)
	lj["product_type_id"] = float64(1)
	lj["activity_id"] = float64(1)
	lj["duration"] = float64(1)
	lj["station_id"] = float64(1)

	job, err := JobFromFirestoreMap(doc, "acc")
	if err != nil {
		t.Fatal(err)
	}
	if job.JobID != "job-uuid-1" {
		t.Fatal(job.JobID)
	}
	if !job.Build.Costs.LinkedJobs[0].IsCorporation {
		t.Fatal("isCorp → is_corporation")
	}
	if job.GroupID != "" || job.IncludedInGroup || !job.DisplayOnPlanner {
		t.Fatalf("nil groupID doc: groupID=%q includedInGroup=%v displayOnPlanner=%v", job.GroupID, job.IncludedInGroup, job.DisplayOnPlanner)
	}
}

// Firestore can persist NaN in double fields; json.Marshal in cloneMap used to fail until we sanitize.
func TestJobFromFirestoreMap_nestedNaNIsSanitized(t *testing.T) {
	doc := map[string]any{
		"jobID":               "job-uuid-nan",
		"jobType":             float64(1),
		"name":                "N",
		"itemID":              float64(2420),
		"maxProductionLimit":  float64(10),
		"jobStatus":           float64(4),
		"volume":              float64(20),
		"archived":            true,
		"itemsProducedPerRun": float64(1),
		"buildVer":            "0.7.65",
		"groupID":             nil,
		"badFloat":            math.NaN(),
		"build": map[string]any{
			"childJobs": map[string]any{},
			"setup":     map[string]any{},
			"products":  map[string]any{"totalQuantity": float64(1)},
			"costs": map[string]any{
				"extrasCosts": []any{}, "linkedJobs": []any{},
			},
			"materials": []any{},
			"sale":      map[string]any{"marketOrders": []any{}, "transactions": []any{}, "brokersFee": []any{}},
		},
		"rawData":   map[string]any{"materials": []any{}, "products": []any{}, "time": float64(0)},
		"skills":    []any{},
		"parentJob": []any{},
	}
	_, err := JobFromFirestoreMap(doc, "acc")
	if err != nil {
		t.Fatal(err)
	}
}

func TestJobFromFirestoreMap_jobSetupFillsAllModelFields(t *testing.T) {
	doc := map[string]any{
		"jobID":              "job-min-setup",
		"jobType":            float64(1),
		"name":               "S",
		"itemID":             float64(34),
		"maxProductionLimit": float64(1),
		"jobStatus":          float64(0),
		"volume":             float64(1),
		"archived":           true,
		"build": map[string]any{
			"setup": map[string]any{
				"only-id-and-materials": map[string]any{
					"id":            "only-id-and-materials",
					"jobType":       float64(1),
					"runCount":      float64(2),
					"jobCount":      float64(3),
					"materialCount": map[string]any{},
				},
			},
			"products":  map[string]any{"totalQuantity": float64(1)},
			"materials": []any{},
			"sale":      map[string]any{"marketOrders": []any{}, "transactions": []any{}, "brokersFee": []any{}},
			"costs": map[string]any{
				"extrasCosts": []any{},
				"linkedJobs":  []any{},
			},
		},
		"rawData": map[string]any{
			"materials": []any{},
			"products":  []any{map[string]any{"quantity": float64(1), "typeID": float64(34)}},
			"time":      float64(0),
		},
		"skills":    []any{},
		"parentJob": []any{},
	}

	job, err := JobFromFirestoreMap(doc, "acc")
	if err != nil {
		t.Fatal(err)
	}
	if len(job.Build.Setup) != 1 {
		t.Fatalf("setups: %d", len(job.Build.Setup))
	}
	var su models.JobSetup
	for _, s := range job.Build.Setup {
		su = s
		break
	}
	if su.StructureID != 0 || su.RigID != 0 || su.SystemTypeID != 0 || su.SystemID != 0 {
		t.Fatalf("ints: %+v", su)
	}
	if su.ME != 0 || su.TE != 0 {
		t.Fatalf("ME/TE: %+v", su)
	}
	if su.RunCount != 2 || su.JobCount != 3 {
		t.Fatalf("run/job count: %+v", su)
	}
	if su.TaxValue != 0.25 {
		t.Fatalf("tax default: %v", su.TaxValue)
	}
	if su.AppliedRequirementID != -1 {
		t.Fatalf("appliedRequirementID: %d", su.AppliedRequirementID)
	}
	if su.AlternativeSystemIndexValue != 0 || su.UseAlternativeSystemIndexValue {
		t.Fatalf("alt index: %v %v", su.AlternativeSystemIndexValue, su.UseAlternativeSystemIndexValue)
	}
	if su.CustomStructureID != "" || su.SelectedCharacter != "" {
		t.Fatalf("strings: %q %q", su.CustomStructureID, su.SelectedCharacter)
	}
	if su.EstimatedInstallCost != 0 || su.EstimatedTime != 0 || su.RawTime != 0 {
		t.Fatalf("floats: %+v", su)
	}
}

func TestJobFromFirestoreMap_groupIDSetsIncludedInGroup(t *testing.T) {
	doc := map[string]any{
		"jobID":              float64(1),
		"jobType":            float64(1),
		"name":               "Grouped",
		"itemID":             float64(34),
		"maxProductionLimit": float64(1),
		"jobStatus":          float64(0),
		"volume":             float64(1),
		"archived":           true,
		"groupID":            "group-xyz",
		"rawData": map[string]any{
			"materials": []any{},
			"products":  []any{map[string]any{"quantity": float64(1), "typeID": float64(1)}},
			"time":      float64(0),
		},
		"build": map[string]any{
			"setup": map[string]any{
				"s1": map[string]any{
					"id": "s1", "runCount": float64(1), "jobCount": float64(1),
					"ME": float64(0), "TE": float64(0), "jobType": float64(1),
					"materialCount": map[string]any{},
				},
			},
			"products":  map[string]any{"totalQuantity": float64(1)},
			"materials": []any{},
			"sale":      map[string]any{"marketOrders": []any{}, "transactions": []any{}, "brokersFee": []any{}},
			"costs": map[string]any{
				"extrasCosts": []any{},
				"linkedJobs":  []any{},
			},
		},
		"skills":    []any{},
		"parentJob": []any{},
	}

	job, err := JobFromFirestoreMap(doc, "acc-1")
	if err != nil {
		t.Fatal(err)
	}
	if job.GroupID != "group-xyz" {
		t.Fatalf("groupID: %q", job.GroupID)
	}
	if !job.IncludedInGroup {
		t.Fatal("expected IncludedInGroup true when groupID set")
	}
	if job.DisplayOnPlanner {
		t.Fatal("expected DisplayOnPlanner false when in group and not ready to sell")
	}
}

func TestJobFromFirestoreMap_groupJobReadyToSellDisplaysOnPlanner(t *testing.T) {
	doc := map[string]any{
		"jobID":              float64(2),
		"jobType":            float64(1),
		"name":               "GroupSell",
		"itemID":             float64(34),
		"maxProductionLimit": float64(1),
		"jobStatus":          float64(0),
		"volume":             float64(1),
		"archived":           true,
		"groupID":            "g1",
		"isReadyToSell":      true,
		"rawData": map[string]any{
			"materials": []any{},
			"products":  []any{map[string]any{"quantity": float64(1), "typeID": float64(1)}},
			"time":      float64(0),
		},
		"build": map[string]any{
			"setup": map[string]any{
				"s1": map[string]any{
					"id": "s1", "runCount": float64(1), "jobCount": float64(1),
					"ME": float64(0), "TE": float64(0), "jobType": float64(1),
					"materialCount": map[string]any{},
				},
			},
			"products":  map[string]any{"totalQuantity": float64(1)},
			"materials": []any{},
			"sale":      map[string]any{"marketOrders": []any{}, "transactions": []any{}, "brokersFee": []any{}},
			"costs": map[string]any{
				"extrasCosts": []any{},
				"linkedJobs":  []any{},
			},
		},
		"skills":    []any{},
		"parentJob": []any{},
	}

	job, err := JobFromFirestoreMap(doc, "acc-1")
	if err != nil {
		t.Fatal(err)
	}
	if !job.IncludedInGroup || job.GroupID != "g1" {
		t.Fatalf("group: %+v %q", job.IncludedInGroup, job.GroupID)
	}
	if !job.IsReadyToSell || !job.DisplayOnPlanner {
		t.Fatalf("ready/display: ready=%v display=%v", job.IsReadyToSell, job.DisplayOnPlanner)
	}
}

func TestJobFromFirestoreMap_normalizesLinkedJobCompletedDateAndCorporationID(t *testing.T) {
	ts := float64(1_700_000_000_000)
	doc := map[string]any{
		"jobID":              float64(1),
		"jobType":            float64(1),
		"name":               "L",
		"itemID":             float64(1),
		"maxProductionLimit": float64(1),
		"jobStatus":          float64(0),
		"volume":             float64(1),
		"archived":           true,
		"rawData": map[string]any{
			"materials": []any{},
			"products":  []any{map[string]any{"quantity": float64(1), "typeID": float64(1)}},
			"time":      float64(0),
		},
		"build": map[string]any{
			"setup": map[string]any{
				"x": map[string]any{
					"id": "x", "runCount": float64(1), "jobCount": float64(1),
					"ME": float64(0), "TE": float64(0), "jobType": float64(1),
					"materialCount": map[string]any{},
				},
			},
			"products":  map[string]any{"totalQuantity": float64(1)},
			"materials": []any{},
			"sale":      map[string]any{"marketOrders": []any{}, "transactions": []any{}, "brokersFee": []any{}},
			"costs": map[string]any{
				"extrasCosts": []any{},
				"linkedJobs": []any{
					map[string]any{
						"job_id":         float64(1),
						"status":         "active",
						"completed_date": ts,
						"corporation_id": "987654",
					},
				},
			},
		},
		"skills":    []any{},
		"parentJob": []any{},
	}

	job, err := JobFromFirestoreMap(doc, "acct-1")
	if err != nil {
		t.Fatal(err)
	}
	if len(job.Build.Costs.LinkedJobs) != 1 {
		t.Fatalf("linkedJobs len %d", len(job.Build.Costs.LinkedJobs))
	}
	lj := job.Build.Costs.LinkedJobs[0]
	wantDate := time.UnixMilli(1_700_000_000_000).UTC().Format(time.RFC3339Nano)
	if lj.CompletedDate != wantDate {
		t.Fatalf("completed_date: got %q want %q", lj.CompletedDate, wantDate)
	}
	if lj.CorporationID != 987654 {
		t.Fatalf("corporation_id: got %d", lj.CorporationID)
	}
}

func TestJobFromFirestoreMap_exportSampleLegacyFile(t *testing.T) {
	p := exportPath(t, "job_00000001_1640347432587.json")
	if p == "" {
		t.Skip("archive export not present")
	}
	var wrap struct {
		Data map[string]any `json:"data"`
	}
	b, err := os.ReadFile(p)
	if err != nil {
		t.Fatal(err)
	}
	if err := json.Unmarshal(b, &wrap); err != nil {
		t.Fatal(err)
	}
	job, err := JobFromFirestoreMap(wrap.Data, "test-account")
	if err != nil {
		t.Fatal(err)
	}
	if job.JobID != "job-1640347432587" {
		t.Fatalf("jobID %q", job.JobID)
	}
	if len(job.Build.Setup) != 1 {
		t.Fatalf("setup %v", job.Build.Setup)
	}
}

func TestJobFromFirestoreMap_exportSampleModernFile(t *testing.T) {
	p := exportPath(t, "job_00000084_job-f7696281-cd3e-604b-9f83-0c9bde6ac408.json")
	if p == "" {
		t.Skip("archive export not present")
	}
	var wrap struct {
		Data map[string]any `json:"data"`
	}
	b, err := os.ReadFile(p)
	if err != nil {
		t.Fatal(err)
	}
	if err := json.Unmarshal(b, &wrap); err != nil {
		t.Fatal(err)
	}
	job, err := JobFromFirestoreMap(wrap.Data, "test-account")
	if err != nil {
		t.Fatal(err)
	}
	if job.JobID != "job-f7696281-cd3e-604b-9f83-0c9bde6ac408" {
		t.Fatalf("jobID %q", job.JobID)
	}
	if len(job.Build.Setup) != 1 {
		t.Fatalf("expected 1 setup, got %d", len(job.Build.Setup))
	}
}

func exportPath(t *testing.T, name string) string {
	t.Helper()
	_, file, _, ok := runtime.Caller(0)
	if !ok {
		return ""
	}
	repoRoot := filepath.Clean(filepath.Join(filepath.Dir(file), "..", "..", "..", ".."))
	p := filepath.Join(repoRoot, "archivejobs_firestore_samples", name)
	if _, err := os.Stat(p); err != nil {
		return ""
	}
	return p
}

func TestJobFromFirestoreMap_hoistsLifecycleIntoMetaAndUsesAccountID(t *testing.T) {
	const owner = "8XGnAtq8QEEQ76LfinJaI8MA6T4"
	doc := map[string]any{
		"jobID":              float64(1681555632971),
		"jobType":            float64(1),
		"name":               "X",
		"itemID":             float64(1),
		"maxProductionLimit": float64(1),
		"jobStatus":          float64(0),
		"volume":             float64(1),
		"archived":           true,
		"archiveProcessed":   true,
		"archiveTimeStamp":   float64(1_681_555_999_000),
		"deleted":            false,
		"rawData": map[string]any{
			"materials": []any{},
			"products":  []any{map[string]any{"quantity": float64(1), "typeID": float64(1)}},
			"time":      float64(0),
		},
		"build": map[string]any{
			"setup": map[string]any{
				"s": map[string]any{
					"id": "s", "runCount": float64(1), "jobCount": float64(1),
					"ME": float64(0), "TE": float64(0), "jobType": float64(1),
					"materialCount": map[string]any{},
				},
			},
			"products":  map[string]any{"totalQuantity": float64(1)},
			"costs":     map[string]any{"extrasCosts": []any{}, "linkedJobs": []any{}},
			"materials": []any{},
			"sale":      map[string]any{"marketOrders": []any{}, "transactions": []any{}, "brokersFee": []any{}},
		},
		"skills":    []any{},
		"parentJob": []any{},
	}

	job, err := JobFromFirestoreMap(doc, owner)
	if err != nil {
		t.Fatal(err)
	}
	if job.MetaData.AccountID != owner {
		t.Fatalf("_meta.accountID: %q", job.MetaData.AccountID)
	}
	if !job.MetaData.ArchiveProcessed {
		t.Fatal("expected _meta.archiveProcessed true")
	}
	if job.MetaData.ArchivedBy != owner {
		t.Fatalf("archivedBy: %#v", job.MetaData.ArchivedBy)
	}
	if job.MetaData.ArchivedAt.IsZero() {
		t.Fatal("missing archivedAt from archiveTimeStamp")
	}
	wantAt := time.UnixMilli(1_681_555_999_000).UTC()
	if !job.MetaData.ArchivedAt.Equal(wantAt) {
		t.Fatalf("archivedAt: got %v want %v", job.MetaData.ArchivedAt, wantAt)
	}
	if job.MetaData.LastUpdatedBy != owner {
		t.Fatalf("lastUpdatedBy: %q", job.MetaData.LastUpdatedBy)
	}

	b, err := bson.Marshal(&job)
	if err != nil {
		t.Fatal(err)
	}
	var top map[string]any
	if err := bson.Unmarshal(b, &top); err != nil {
		t.Fatal(err)
	}
	for _, k := range []string{"archiveProcessed", "archived", "archiveTimeStamp", "deleted", "deletedTimeStamp", "accountID"} {
		if _, ok := top[k]; ok {
			t.Fatalf("canonical Job BSON must not have root %q (belongs under _meta only)", k)
		}
	}
	meta, _ := top["_meta"].(map[string]any)
	if meta == nil {
		t.Fatal("missing _meta")
	}
	if !truthyAny(meta["archiveProcessed"]) {
		t.Fatalf("_meta.archiveProcessed: %#v", meta["archiveProcessed"])
	}
}

func TestJobFromFirestoreMap_normalizesNumericUnderscoreMetaArchivedAt(t *testing.T) {
	const owner = "acct-hist-1"
	doc := map[string]any{
		"jobID":              float64(1),
		"jobType":            float64(1),
		"name":               "A",
		"itemID":             float64(1),
		"maxProductionLimit": float64(1),
		"jobStatus":          float64(0),
		"volume":             float64(1),
		"archived":           true,
		"_meta": map[string]any{
			"archivedAt":       float64(1_681_555_999_000),
			"archiveProcessed": true,
		},
		"rawData": map[string]any{
			"materials": []any{},
			"products":  []any{map[string]any{"quantity": float64(1), "typeID": float64(1)}},
			"time":      float64(0),
		},
		"build": map[string]any{
			"setup": map[string]any{
				"x": map[string]any{
					"id": "x", "runCount": float64(1), "jobCount": float64(1),
					"ME": float64(0), "TE": float64(0), "jobType": float64(1),
					"materialCount": map[string]any{},
				},
			},
			"products":  map[string]any{"totalQuantity": float64(1)},
			"costs":     map[string]any{"extrasCosts": []any{}, "linkedJobs": []any{}},
			"materials": []any{},
			"sale":      map[string]any{"marketOrders": []any{}, "transactions": []any{}, "brokersFee": []any{}},
		},
		"skills":    []any{},
		"parentJob": []any{},
	}

	job, err := JobFromFirestoreMap(doc, owner)
	if err != nil {
		t.Fatal(err)
	}
	wantAt := time.UnixMilli(1_681_555_999_000).UTC()
	if !job.MetaData.ArchivedAt.Equal(wantAt) {
		t.Fatalf("archivedAt from _meta float ms: got %v want %v", job.MetaData.ArchivedAt, wantAt)
	}
}

func TestJobFromFirestoreMap_preservesHistoricMetaCreatedAtAndLastModified(t *testing.T) {
	const owner = "acct-hist-2"
	doc := map[string]any{
		"jobID":              float64(1),
		"jobType":            float64(1),
		"name":               "A",
		"itemID":             float64(1),
		"maxProductionLimit": float64(1),
		"jobStatus":          float64(0),
		"volume":             float64(1),
		"_meta": map[string]any{
			"createdAt":    "2018-03-01T10:00:00Z",
			"lastModified": "2018-03-02T15:30:00Z",
		},
		"rawData": map[string]any{
			"materials": []any{},
			"products":  []any{map[string]any{"quantity": float64(1), "typeID": float64(1)}},
			"time":      float64(0),
		},
		"build": map[string]any{
			"setup": map[string]any{
				"x": map[string]any{
					"id": "x", "runCount": float64(1), "jobCount": float64(1),
					"ME": float64(0), "TE": float64(0), "jobType": float64(1),
					"materialCount": map[string]any{},
				},
			},
			"products":  map[string]any{"totalQuantity": float64(1)},
			"costs":     map[string]any{"extrasCosts": []any{}, "linkedJobs": []any{}},
			"materials": []any{},
			"sale":      map[string]any{"marketOrders": []any{}, "transactions": []any{}, "brokersFee": []any{}},
		},
		"skills":    []any{},
		"parentJob": []any{},
	}

	job, err := JobFromFirestoreMap(doc, owner)
	if err != nil {
		t.Fatal(err)
	}
	wantCreated := time.Date(2018, 3, 1, 10, 0, 0, 0, time.UTC)
	if !job.MetaData.CreatedAt.Equal(wantCreated) {
		t.Fatalf("createdAt: got %v want %v", job.MetaData.CreatedAt, wantCreated)
	}
	wantLM := time.Date(2018, 3, 2, 15, 30, 0, 0, time.UTC)
	if !job.MetaData.LastModified.Equal(wantLM) {
		t.Fatalf("lastModified: got %v want %v", job.MetaData.LastModified, wantLM)
	}
}

func TestJobFromFirestoreMap_legacyDeletedToDeletedAt(t *testing.T) {
	const owner = "acct-del-1"
	ts := float64(1_700_000_000_000)
	wantAt := time.UnixMilli(1_700_000_000_000).UTC()
	doc := map[string]any{
		"jobID":              float64(1),
		"jobType":            float64(1),
		"name":               "A",
		"itemID":             float64(1),
		"maxProductionLimit": float64(1),
		"jobStatus":          float64(0),
		"volume":             float64(1),
		"deleted":            true,
		"deletedTimeStamp":   ts,
		"rawData": map[string]any{
			"materials": []any{},
			"products":  []any{map[string]any{"quantity": float64(1), "typeID": float64(1)}},
			"time":      float64(0),
		},
		"build": map[string]any{
			"setup": map[string]any{
				"x": map[string]any{
					"id": "x", "runCount": float64(1), "jobCount": float64(1),
					"ME": float64(0), "TE": float64(0), "jobType": float64(1),
					"materialCount": map[string]any{},
				},
			},
			"products":  map[string]any{"totalQuantity": float64(1)},
			"costs":     map[string]any{"extrasCosts": []any{}, "linkedJobs": []any{}},
			"materials": []any{},
			"sale":      map[string]any{"marketOrders": []any{}, "transactions": []any{}, "brokersFee": []any{}},
		},
		"skills":    []any{},
		"parentJob": []any{},
	}

	job, err := JobFromFirestoreMap(doc, owner)
	if err != nil {
		t.Fatal(err)
	}
	if !job.MetaData.DeletedAt.Equal(wantAt) {
		t.Fatalf("deletedAt: got %v want %v", job.MetaData.DeletedAt, wantAt)
	}
	if job.MetaData.DeletedBy != owner {
		t.Fatalf("deletedBy: got %q want %q", job.MetaData.DeletedBy, owner)
	}
}

func TestJobFromFirestoreMap_normalizesJobLayout(t *testing.T) {
	doc := map[string]any{
		"jobID":              float64(1),
		"jobType":            float64(1),
		"name":               "A",
		"itemID":             float64(1),
		"maxProductionLimit": float64(1),
		"jobStatus":          float64(0),
		"volume":             float64(1),
		"layout": map[string]any{
			"localMarketDisplay":  float64(2),
			"localOrderDisplay":   "  jita ",
			"esiJobTab":           nil,
			"setupToEdit":         float64(99),
			"resourceDisplayType": "",
		},
		"rawData": map[string]any{
			"materials": []any{},
			"products":  []any{map[string]any{"quantity": float64(1), "typeID": float64(1)}},
			"time":      float64(0),
		},
		"build": map[string]any{
			"setup": map[string]any{
				"x": map[string]any{
					"id": "x", "runCount": float64(1), "jobCount": float64(1),
					"ME": float64(0), "TE": float64(0), "jobType": float64(1),
					"materialCount": map[string]any{},
				},
			},
			"products":  map[string]any{"totalQuantity": float64(1)},
			"costs":     map[string]any{"extrasCosts": []any{}, "linkedJobs": []any{}},
			"materials": []any{},
			"sale":      map[string]any{"marketOrders": []any{}, "transactions": []any{}, "brokersFee": []any{}},
		},
		"skills":    []any{},
		"parentJob": []any{},
	}

	job, err := JobFromFirestoreMap(doc, "acct-1")
	if err != nil {
		t.Fatal(err)
	}
	if job.Layout.LocalMarketDisplay != "2" {
		t.Fatalf("localMarketDisplay: got %q", job.Layout.LocalMarketDisplay)
	}
	if job.Layout.LocalOrderDisplay != "jita" {
		t.Fatalf("localOrderDisplay: got %q", job.Layout.LocalOrderDisplay)
	}
	if job.Layout.ESIJobTab != "" {
		t.Fatalf("esiJobTab: got %q want empty", job.Layout.ESIJobTab)
	}
	if job.Layout.SetupToEdit != "99" {
		t.Fatalf("setupToEdit: got %q", job.Layout.SetupToEdit)
	}
	if job.Layout.ResourceDisplayType != "" {
		t.Fatalf("resourceDisplayType: got %q want empty", job.Layout.ResourceDisplayType)
	}
}

func TestJobFromFirestoreMap_layoutRootNullHistoric(t *testing.T) {
	doc := map[string]any{
		"jobID":              float64(1),
		"jobType":            float64(1),
		"name":               "A",
		"itemID":             float64(1),
		"maxProductionLimit": float64(1),
		"jobStatus":          float64(0),
		"volume":             float64(1),
		"layout":             nil,
		"rawData": map[string]any{
			"materials": []any{},
			"products":  []any{map[string]any{"quantity": float64(1), "typeID": float64(1)}},
			"time":      float64(0),
		},
		"build": map[string]any{
			"setup": map[string]any{
				"x": map[string]any{
					"id": "x", "runCount": float64(1), "jobCount": float64(1),
					"ME": float64(0), "TE": float64(0), "jobType": float64(1),
					"materialCount": map[string]any{},
				},
			},
			"products":  map[string]any{"totalQuantity": float64(1)},
			"costs":     map[string]any{"extrasCosts": []any{}, "linkedJobs": []any{}},
			"materials": []any{},
			"sale":      map[string]any{"marketOrders": []any{}, "transactions": []any{}, "brokersFee": []any{}},
		},
		"skills":    []any{},
		"parentJob": []any{},
	}

	job, err := JobFromFirestoreMap(doc, "acct-1")
	if err != nil {
		t.Fatal(err)
	}
	if job.Layout.LocalMarketDisplay != "" || job.Layout.ESIJobTab != "" {
		t.Fatalf("expected zero JobLayout for layout: null, got %+v", job.Layout)
	}
	assertJobJSONHasLayoutKey(t, job)
}

func TestJobFromFirestoreMap_layoutAllNullFieldsHistoric(t *testing.T) {
	doc := map[string]any{
		"jobID":              float64(1),
		"jobType":            float64(1),
		"name":               "A",
		"itemID":             float64(1),
		"maxProductionLimit": float64(1),
		"jobStatus":          float64(0),
		"volume":             float64(1),
		"layout": map[string]any{
			"localMarketDisplay":  nil,
			"localOrderDisplay":   nil,
			"esiJobTab":           nil,
			"setupToEdit":         nil,
			"resourceDisplayType": nil,
		},
		"rawData": map[string]any{
			"materials": []any{},
			"products":  []any{map[string]any{"quantity": float64(1), "typeID": float64(1)}},
			"time":      float64(0),
		},
		"build": map[string]any{
			"setup": map[string]any{
				"x": map[string]any{
					"id": "x", "runCount": float64(1), "jobCount": float64(1),
					"ME": float64(0), "TE": float64(0), "jobType": float64(1),
					"materialCount": map[string]any{},
				},
			},
			"products":  map[string]any{"totalQuantity": float64(1)},
			"costs":     map[string]any{"extrasCosts": []any{}, "linkedJobs": []any{}},
			"materials": []any{},
			"sale":      map[string]any{"marketOrders": []any{}, "transactions": []any{}, "brokersFee": []any{}},
		},
		"skills":    []any{},
		"parentJob": []any{},
	}

	job, err := JobFromFirestoreMap(doc, "acct-1")
	if err != nil {
		t.Fatal(err)
	}
	if job.Layout.LocalMarketDisplay != "" || job.Layout.LocalOrderDisplay != "" {
		t.Fatalf("expected zero JobLayout, got %+v", job.Layout)
	}
	assertJobJSONHasLayoutKey(t, job)
}

func TestJobFromFirestoreMap_layoutWrongShapeBecomesEmpty(t *testing.T) {
	doc := map[string]any{
		"jobID":              float64(1),
		"jobType":            float64(1),
		"name":               "A",
		"itemID":             float64(1),
		"maxProductionLimit": float64(1),
		"jobStatus":          float64(0),
		"volume":             float64(1),
		"layout":             "not-a-map",
		"rawData": map[string]any{
			"materials": []any{},
			"products":  []any{map[string]any{"quantity": float64(1), "typeID": float64(1)}},
			"time":      float64(0),
		},
		"build": map[string]any{
			"setup": map[string]any{
				"x": map[string]any{
					"id": "x", "runCount": float64(1), "jobCount": float64(1),
					"ME": float64(0), "TE": float64(0), "jobType": float64(1),
					"materialCount": map[string]any{},
				},
			},
			"products":  map[string]any{"totalQuantity": float64(1)},
			"costs":     map[string]any{"extrasCosts": []any{}, "linkedJobs": []any{}},
			"materials": []any{},
			"sale":      map[string]any{"marketOrders": []any{}, "transactions": []any{}, "brokersFee": []any{}},
		},
		"skills":    []any{},
		"parentJob": []any{},
	}

	job, err := JobFromFirestoreMap(doc, "acct-1")
	if err != nil {
		t.Fatal(err)
	}
	if job.Layout.LocalMarketDisplay != "" || job.Layout.LocalOrderDisplay != "" {
		t.Fatalf("expected empty layout, got %+v", job.Layout)
	}
	assertJobJSONHasLayoutKey(t, job)
}

func assertJobJSONHasLayoutKey(t *testing.T, job models.Job) {
	t.Helper()
	payload, err := json.Marshal(job)
	if err != nil {
		t.Fatal(err)
	}
	var out map[string]any
	if err := json.Unmarshal(payload, &out); err != nil {
		t.Fatal(err)
	}
	if _, ok := out["layout"]; !ok {
		t.Fatal("expected layout key on encoded job")
	}
}

func TestJobFromFirestoreMap_normalizesSaleTransactionIDs(t *testing.T) {
	doc := map[string]any{
		"jobID":              float64(1),
		"jobType":            float64(1),
		"name":               "A",
		"itemID":             float64(1),
		"maxProductionLimit": float64(1),
		"jobStatus":          float64(0),
		"volume":             float64(1),
		"archived":           true,
		"rawData": map[string]any{
			"materials": []any{},
			"products":  []any{map[string]any{"quantity": float64(1), "typeID": float64(1)}},
			"time":      float64(0),
		},
		"build": map[string]any{
			"setup": map[string]any{
				"x": map[string]any{
					"id": "x", "runCount": float64(1), "jobCount": float64(1),
					"ME": float64(0), "TE": float64(0), "jobType": float64(1),
					"materialCount": map[string]any{},
				},
			},
			"products":  map[string]any{"totalQuantity": float64(1)},
			"costs":     map[string]any{"extrasCosts": []any{}, "linkedJobs": []any{}},
			"materials": []any{},
			"sale": map[string]any{
				"marketOrders": []any{},
				"brokersFee":   []any{},
				"transactions": []any{
					map[string]any{"transaction_id": "123456789012345", "order_id": "5001"},
					map[string]any{"transaction_id": float64(99.7), "order_id": nil},
					map[string]any{"transaction_id": int64(42), "order_id": float64(8.2)},
				},
			},
		},
		"skills":    []any{},
		"parentJob": []any{},
	}

	job, err := JobFromFirestoreMap(doc, "acct-1")
	if err != nil {
		t.Fatal(err)
	}
	tx := job.Build.Sale.Transactions
	if len(tx) != 3 {
		t.Fatalf("transactions: len %d", len(tx))
	}
	if tx[0].TransactionID != 123456789012345 {
		t.Fatalf("string id: got %d", tx[0].TransactionID)
	}
	if tx[1].TransactionID != 100 {
		t.Fatalf("float id: got %d want 100", tx[1].TransactionID)
	}
	if tx[2].TransactionID != 42 {
		t.Fatalf("int64 map value: got %d", tx[2].TransactionID)
	}
	if tx[0].OrderID != 5001 {
		t.Fatalf("order_id string: got %d", tx[0].OrderID)
	}
	if tx[1].OrderID != 0 {
		t.Fatalf("order_id null: got %d", tx[1].OrderID)
	}
	if tx[2].OrderID != 8 {
		t.Fatalf("order_id float: got %d want 8", tx[2].OrderID)
	}
}

func TestJobFromFirestoreMap_normalizesJobMaterialScalars(t *testing.T) {
	doc := map[string]any{
		"jobID":              float64(1),
		"jobType":            float64(1),
		"name":               "A",
		"itemID":             float64(1),
		"maxProductionLimit": float64(1),
		"jobStatus":          float64(0),
		"volume":             float64(1),
		"archived":           true,
		"rawData": map[string]any{
			"materials": []any{},
			"products":  []any{map[string]any{"quantity": float64(1), "typeID": float64(1)}},
			"time":      float64(0),
		},
		"build": map[string]any{
			"setup": map[string]any{
				"x": map[string]any{
					"id": "x", "runCount": float64(1), "jobCount": float64(1),
					"ME": float64(0), "TE": float64(0), "jobType": float64(1),
					"materialCount": map[string]any{},
				},
			},
			"products": map[string]any{"totalQuantity": float64(1)},
			"costs":    map[string]any{"extrasCosts": []any{}, "linkedJobs": []any{}},
			"materials": []any{
				map[string]any{
					"typeID":            float64(34),
					"name":              "Trit",
					"quantity":          "1001",
					"jobType":           float64(0),
					"volume":            "0.0375",
					"purchasing": []any{
						map[string]any{
							"id":             "p1",
							"itemCount":      "5",
							"itemCost":       "3.125",
							"childJobImport": false,
							"childID":        float64(1_640_347_432_587),
						},
						map[string]any{
							"id": "p2", "childID": nil,
							"itemCount": float64(1), "itemCost": float64(2),
						},
					},
					"quantityPurchased": float64(2.4),
					"purchasedCost":     "12.50",
				},
			},
			"sale": map[string]any{
				"marketOrders": []any{},
				"transactions": []any{},
				"brokersFee":   []any{},
			},
		},
		"skills":    []any{},
		"parentJob": []any{},
	}

	job, err := JobFromFirestoreMap(doc, "acct-1")
	if err != nil {
		t.Fatal(err)
	}
	if len(job.Build.Materials) != 1 {
		t.Fatalf("materials len: %d", len(job.Build.Materials))
	}
	m := job.Build.Materials[0]
	if m.Quantity != 1001 {
		t.Fatalf("quantity: got %d", m.Quantity)
	}
	if m.Volume != 0.0375 {
		t.Fatalf("volume: got %v want 0.0375", m.Volume)
	}
	if m.QuantityPurchased != 2 {
		t.Fatalf("quantityPurchased: got %d want 2 (rounded)", m.QuantityPurchased)
	}
	if m.PurchasedCost != 12.5 {
		t.Fatalf("purchasedCost: got %v", m.PurchasedCost)
	}
	if len(m.Purchasing) != 2 {
		t.Fatalf("purchasing len: %d", len(m.Purchasing))
	}
	p := m.Purchasing[0]
	if p.ItemCount != 5 {
		t.Fatalf("purchase itemCount: got %d", p.ItemCount)
	}
	if p.ItemCost != 3.125 {
		t.Fatalf("purchase itemCost: got %v", p.ItemCost)
	}
	if p.ChildID != "job-1640347432587" {
		t.Fatalf("purchase childID: got %q", p.ChildID)
	}
	if p2 := m.Purchasing[1]; p2.ChildID != "" {
		t.Fatalf("purchase childID null: got %q", p2.ChildID)
	}
}

func TestJobFromFirestoreMap_parentJobsNeverNull(t *testing.T) {
	doc := map[string]any{
		"jobID":              float64(1),
		"jobType":            float64(1),
		"name":               "A",
		"itemID":             float64(1),
		"maxProductionLimit": float64(1),
		"jobStatus":          float64(0),
		"volume":             float64(1),
		"archived":           true,
		"parentJob":          nil,
		"rawData": map[string]any{
			"materials": []any{},
			"products":  []any{map[string]any{"quantity": float64(1), "typeID": float64(1)}},
			"time":      float64(0),
		},
		"build": map[string]any{
			"setup": map[string]any{
				"x": map[string]any{
					"id": "x", "runCount": float64(1), "jobCount": float64(1),
					"ME": float64(0), "TE": float64(0), "jobType": float64(1),
					"materialCount": map[string]any{},
				},
			},
			"products":  map[string]any{"totalQuantity": float64(1)},
			"costs":     map[string]any{"extrasCosts": []any{}, "linkedJobs": []any{}},
			"materials": []any{},
			"sale":      map[string]any{"marketOrders": []any{}, "transactions": []any{}, "brokersFee": []any{}},
		},
		"skills": []any{},
	}

	job, err := JobFromFirestoreMap(doc, "a")
	if err != nil {
		t.Fatal(err)
	}
	if job.ParentJobs == nil {
		t.Fatal("ParentJobs slice is nil")
	}
	if len(job.ParentJobs) != 0 {
		t.Fatalf("ParentJobs: %v", job.ParentJobs)
	}
	b, err := json.Marshal(job)
	if err != nil {
		t.Fatal(err)
	}
	if !strings.Contains(string(b), `"parentJobs":[]`) {
		t.Fatalf("JSON missing parentJobs:[] — %s", string(b))
	}
}

func TestJobFromFirestoreMap_rootAPIArraysNeverNull(t *testing.T) {
	doc := map[string]any{
		"jobID":              float64(1),
		"jobType":            float64(1),
		"name":               "A",
		"itemID":             float64(1),
		"maxProductionLimit": float64(1),
		"jobStatus":          float64(0),
		"volume":             float64(1),
		"archived":           true,
		"apiJobs":            nil,
		"apiOrders":          nil,
		"apiTransactions":    nil,
		"rawData": map[string]any{
			"materials": []any{},
			"products":  []any{map[string]any{"quantity": float64(1), "typeID": float64(1)}},
			"time":      float64(0),
		},
		"build": map[string]any{
			"products":  map[string]any{"totalQuantity": float64(1)},
			"costs":     map[string]any{"extrasCosts": []any{}, "linkedJobs": []any{}},
			"materials": []any{},
			"sale":      map[string]any{"marketOrders": []any{}, "transactions": []any{}, "brokersFee": []any{}},
		},
		"bpME":     float64(0),
		"runCount": float64(1),
		"jobCount": float64(1),
		"skills":   []any{},
		"parentJob": []any{},
	}

	job, err := JobFromFirestoreMap(doc, "a")
	if err != nil {
		t.Fatal(err)
	}
	b, err := json.Marshal(job)
	if err != nil {
		t.Fatal(err)
	}
	var wrap map[string]json.RawMessage
	if err := json.Unmarshal(b, &wrap); err != nil {
		t.Fatal(err)
	}
	for _, key := range []string{"apiJobs", "apiOrders", "apiTransactions"} {
		raw := string(wrap[key])
		if raw != "[]" {
			t.Fatalf("%s: got %s want []", key, raw)
		}
	}
}

func TestJobFromFirestoreMap_metaLevelFromRecipeList(t *testing.T) {
	doc := map[string]any{
		"jobID":              float64(1),
		"jobType":            float64(1),
		"name":               "Meta fill",
		"itemID":             float64(213),
		"maxProductionLimit": float64(600),
		"jobStatus":          float64(4),
		"volume":             float64(0.015),
		"archived":           true,
		"apiJobs":            []any{},
		"rawData": map[string]any{
			"materials": []any{},
			"products":  []any{map[string]any{"quantity": float64(100), "typeID": float64(213)}},
			"time":      float64(300),
		},
		"build": map[string]any{
			"setup": map[string]any{
				"s": map[string]any{
					"id": "s", "runCount": float64(1), "jobCount": float64(1),
					"ME": float64(0), "TE": float64(0), "jobType": float64(1),
					"materialCount": map[string]any{},
				},
			},
			"products":  map[string]any{"totalQuantity": float64(100)},
			"costs":     map[string]any{"extrasCosts": []any{}, "linkedJobs": []any{}},
			"materials": []any{},
			"sale": map[string]any{
				"marketOrders": []any{}, "transactions": []any{}, "brokersFee": []any{},
			},
		},
		"bpME":     float64(0),
		"runCount": float64(1),
		"jobCount": float64(1),
		"skills":   []any{},
		"parentJob": []any{},
	}

	job, err := JobFromFirestoreMap(doc, "a")
	if err != nil {
		t.Fatal(err)
	}
	if job.MetaLevel == nil || *job.MetaLevel != 1 {
		t.Fatalf("metaLevel from recipe metaGroupID for item 213: %#v", job.MetaLevel)
	}
}

func TestJobFromFirestoreMap_blueprintTypeIDFromRecipeList(t *testing.T) {
	doc := map[string]any{
		"jobID":              float64(999),
		"jobType":            float64(1),
		"name":               "No linked",
		"itemID":             float64(213),
		"maxProductionLimit": float64(600),
		"jobStatus":          float64(4),
		"volume":             float64(0.015),
		"archived":           true,
		"apiJobs":            []any{},
		"bpME":               float64(3),
		"bpTE":               float64(0),
		"runCount":           float64(1),
		"jobCount":           float64(1),
		"structureType":      float64(0),
		"rigType":            float64(0),
		"systemType":         float64(1),
		"rawData": map[string]any{
			"materials": []any{},
			"products":  []any{map[string]any{"quantity": float64(100), "typeID": float64(213)}},
			"time":      float64(300),
		},
		"build": map[string]any{
			"products": map[string]any{
				"quantityPerJob": float64(100),
				"totalQuantity":  float64(100),
			},
			"costs": map[string]any{
				"extrasCosts": []any{},
				"linkedJobs":  []any{},
			},
			"materials": []any{},
			"sale":      map[string]any{"marketOrders": []any{}, "transactions": []any{}, "brokersFee": []any{}},
		},
		"skills":    []any{},
		"parentJob": []any{},
	}

	job, err := JobFromFirestoreMap(doc, "a")
	if err != nil {
		t.Fatal(err)
	}
	if job.BlueprintTypeID == nil || *job.BlueprintTypeID != 814 {
		t.Fatalf("blueprintTypeID from embedded recipeList: got %#v want 814", job.BlueprintTypeID)
	}
}

func TestJobFromFirestoreMap_blueprintTypeIDFromLinkedJob(t *testing.T) {
	doc := map[string]any{
		"jobID":              float64(404),
		"jobType":            float64(1),
		"name":               "Linked BP",
		"itemID":             float64(499),
		"maxProductionLimit": float64(200),
		"jobStatus":          float64(4),
		"volume":             float64(1),
		"archived":           true,
		"apiJobs":            []any{float64(477724009)},
		"bpME":               float64(0),
		"bpTE":               float64(0),
		"runCount":           float64(20),
		"jobCount":           float64(1),
		"structureType":      float64(0),
		"rigType":            float64(0),
		"systemType":         float64(1),
		"rawData": map[string]any{
			"materials": []any{},
			"products":  []any{map[string]any{"quantity": float64(20), "typeID": float64(499)}},
			"time":      float64(14400),
		},
		"build": map[string]any{
			"buildChar": "char",
			"products": map[string]any{
				"quantityPerJob": float64(20),
				"totalQuantity":  float64(20),
			},
			"costs": map[string]any{
				"extrasCosts": []any{},
				"linkedJobs": []any{
					map[string]any{
						"job_id":            float64(477724009),
						"blueprint_type_id": float64(786),
						"status":            "delivered",
					},
				},
			},
			"materials": []any{},
			"sale":      map[string]any{"marketOrders": []any{}, "transactions": []any{}, "brokersFee": []any{}},
		},
		"skills":    []any{},
		"parentJob": []any{},
	}

	job, err := JobFromFirestoreMap(doc, "a")
	if err != nil {
		t.Fatal(err)
	}
	if job.BlueprintTypeID == nil || *job.BlueprintTypeID != 786 {
		t.Fatalf("blueprintTypeID: %#v", job.BlueprintTypeID)
	}
}

func TestEnsureJobIDPrefix(t *testing.T) {
	tests := []struct{ in, want string }{
		{"", ""},
		{"1640347432587", "job-1640347432587"},
		{"job-1640347432587", "job-1640347432587"},
		{"job-f7696281-cd3e-604b-9f83-0c9bde6ac408", "job-f7696281-cd3e-604b-9f83-0c9bde6ac408"},
	}
	for _, tc := range tests {
		if got := EnsureJobIDPrefix(tc.in); got != tc.want {
			t.Errorf("%q: got %q want %q", tc.in, got, tc.want)
		}
	}
}
