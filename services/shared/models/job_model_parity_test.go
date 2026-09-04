package models

import (
	"bytes"
	"encoding/json"
	"testing"
	"time"

	"go.mongodb.org/mongo-driver/v2/bson"
)

// Parity expectations: ../../../../migration/JOB_MODEL_PARITY_AUDIT.md (Phase 0).

func TestJob_JSON_FirestoreToDocumentShape_IgnoresLegacyBuildVer(t *testing.T) {
	const firestoreLike = `{
		"buildVer": "9.9.9",
		"metaLevel": 2,
		"jobType": 1,
		"name": "Test",
		"jobID": "job-test-1",
		"jobStatus": 0,
		"volume": 1.5,
		"itemID": 34,
		"maxProductionLimit": 100,
		"parentJobs": [],
		"blueprintTypeID": null,
		"groupID": null,
		"isReadyToSell": false,
		"build": {
			"setup": {},
			"childJobs": {},
			"costs": {
				"extrasCosts": [],
				"linkedJobs": [],
				"inventionEntries": []
			},
			"sale": {
				"marketOrders": [],
				"transactions": [],
				"brokersFee": []
			},
			"materials": []
		},
		"rawData": {"materials": [], "products": [], "time": 0},
		"skills": [],
		"itemsProducedPerRun": 1,
		"layout": {
			"localMarketDisplay": null,
			"localOrderDisplay": null,
			"esiJobTab": null,
			"setupToEdit": null,
			"resourceDisplayType": null
		},
		"_meta": {
			"lastModified": "1970-01-01T00:00:01Z",
			"accountID": "",
			"createdAt": "1970-01-01T00:00:01Z",
			"lastUpdatedBy": "",
			"archiveProcessed": false,
			"archivedBy": "user-1",
			"archivedAt": "2020-01-01T00:00:00Z"
		}
	}`

	var job Job
	if err := json.Unmarshal([]byte(firestoreLike), &job); err != nil {
		t.Fatalf("unmarshal: %v", err)
	}
	if job.MetaLevel == nil || *job.MetaLevel != 2 {
		t.Fatalf("metaLevel: got %#v", job.MetaLevel)
	}
	if job.JobID != "job-test-1" {
		t.Fatalf("jobID: got %q", job.JobID)
	}
	if job.MetaData.ArchivedBy != "user-1" {
		t.Fatalf("expected _meta.archivedBy from mongo-shaped JSON: %#v", job.MetaData.ArchivedBy)
	}
	if job.GroupID != "" {
		t.Fatalf("JSON null groupID should decode as empty string, got %#v", job.GroupID)
	}
	if job.IncludedInGroup {
		t.Fatal("includedInGroup should be false when absent and groupID empty")
	}
}

func TestJob_JSON_ExtrasCostsShapeMismatch(t *testing.T) {
	const withFrontendExtras = `{
		"jobType": 1,
		"name": "x",
		"jobID": "j1",
		"jobStatus": 0,
		"volume": 0,
		"itemID": 1,
		"maxProductionLimit": 1,
		"parentJobs": [],
		"isReadyToSell": false,
		"build": {
			"setup": {},
			"childJobs": {},
			"costs": {
				"extrasCosts": [
					{
						"id": "uuid",
						"category": "1",
						"extraText": "note",
						"extraValue": 123.45
					}
				],
				"extrasTotal": 123.45,
				"linkedJobs": [],
				"inventionEntries": []
			},
			"sale": {
				"marketOrders": [],
				"transactions": [],
				"brokersFee": []
			},
			"materials": []
		},
		"rawData": {"materials": [], "products": [], "time": 0},
		"skills": [],
		"itemsProducedPerRun": 1,
		"layout": {},
		"deleted": false,
		"archived": false,
		"archiveProcessed": false
	}`

	var job Job
	if err := json.Unmarshal([]byte(withFrontendExtras), &job); err != nil {
		t.Fatalf("unmarshal: %v", err)
	}
	if len(job.Build.Costs.ExtrasCosts) != 1 {
		t.Fatalf("expected one extras element")
	}
	ex := job.Build.Costs.ExtrasCosts[0]
	if ex.ID != "uuid" || ex.Category != "1" || ex.ExtraText != "note" || ex.ExtraValue != 123.45 {
		t.Fatalf("extrasCosts decode: %+v", ex)
	}
}

func TestJob_JSON_MongoLike_ShapeRoundTripMeta(t *testing.T) {
	orig := Job{
		JobID:   "job-1",
		Name:    "n",
		JobType: 1,
		ItemID:  34,
		MetaData: JobMetaData{
			MetaData: MetaData{
				LastModified: time.Unix(1000, 0).UTC(),
				AccountID:    "acc-1",
			},
			CreatedAt:        time.Unix(500, 0).UTC(),
			LastUpdatedBy:    "acc-1",
			ArchiveProcessed: true,
		},
	}
	b, err := json.Marshal(&orig)
	if err != nil {
		t.Fatal(err)
	}
	var decoded Job
	if err := json.Unmarshal(b, &decoded); err != nil {
		t.Fatal(err)
	}
	if decoded.MetaData.AccountID != orig.MetaData.AccountID {
		t.Fatalf("round-trip meta mismatch: %+v", decoded.MetaData)
	}
}

func TestExtraCost_JSON_frontendExtrasPanelShape(t *testing.T) {
	const raw = `{"id":"550e8400-e29b-41d4-a716-446655440000","category":"3","extraText":"Fuel","extraValue":125000.5}`
	var e ExtraCost
	if err := json.Unmarshal([]byte(raw), &e); err != nil {
		t.Fatal(err)
	}
	if e.Category != "3" {
		t.Fatalf("Category: got %q want \"3\"", e.Category)
	}
	if e.ExtraText != "Fuel" || e.ExtraValue != 125000.5 {
		t.Fatalf("ExtraText/ExtraValue: got %q %v", e.ExtraText, e.ExtraValue)
	}
	if e.ID != "550e8400-e29b-41d4-a716-446655440000" {
		t.Fatalf("ID: got %q", e.ID)
	}
}

func TestExtraCost_JSON_numericCategory_and_stringExtraValue(t *testing.T) {
	const raw = `{"id":"row-1","category":2,"extraText":"Fuel","extraValue":"125000.5"}`
	var e ExtraCost
	if err := json.Unmarshal([]byte(raw), &e); err != nil {
		t.Fatal(err)
	}
	if e.Category != "2" || e.ExtraText != "Fuel" || e.ExtraValue != 125000.5 || e.ID != "row-1" {
		t.Fatalf("got %+v", e)
	}
}

func TestExtraCost_JSON_legacyTypeLabelCost(t *testing.T) {
	const raw = `{"id":"x","type":4,"label":"Note","cost":99.25}`
	var e ExtraCost
	if err := json.Unmarshal([]byte(raw), &e); err != nil {
		t.Fatal(err)
	}
	if e.Category != "4" || e.ExtraText != "Note" || e.ExtraValue != 99.25 {
		t.Fatalf("got %+v", e)
	}
}

func TestExtraCost_BSON_numericCategory(t *testing.T) {
	type row struct {
		ID         string  `bson:"id"`
		Category   int32   `bson:"category"`
		ExtraText  string  `bson:"extraText"`
		ExtraValue float64 `bson:"extraValue"`
	}
	b, err := bson.Marshal(row{ID: "r1", Category: 3, ExtraText: "t", ExtraValue: 10.5})
	if err != nil {
		t.Fatal(err)
	}
	var e ExtraCost
	if err := bson.Unmarshal(b, &e); err != nil {
		t.Fatal(err)
	}
	if e.ID != "r1" || e.Category != "3" || e.ExtraText != "t" || e.ExtraValue != 10.5 {
		t.Fatalf("got %+v", e)
	}
}

func TestJob_JSON_DisallowUnknownFields_acceptsFrontendExtrasCosts(t *testing.T) {
	const jobJSON = `{
		"jobID": "job-1",
		"name": "n",
		"jobType": 1,
		"jobStatus": 0,
		"volume": 1,
		"itemID": 34,
		"maxProductionLimit": 1,
		"parentJobs": [],
		"displayOnPlanner": true,
		"isReadyToSell": false,
		"build": {
			"setup": {},
			"childJobs": {},
			"costs": {
				"extrasCosts": [
					{"id": "row-1", "category": "2", "extraText": "Label", "extraValue": 99.5}
				],
				"linkedJobs": [],
				"inventionEntries": []
			},
			"sale": {
				"marketOrders": [],
				"transactions": [],
				"brokersFee": []
			},
			"materials": []
		},
		"rawData": {"materials": [], "products": [], "time": 0},
		"skills": [],
		"itemsProducedPerRun": 1,
		"layout": {
			"localMarketDisplay": null,
			"localOrderDisplay": null,
			"esiJobTab": null,
			"setupToEdit": null,
			"resourceDisplayType": null
		},
		"_meta": {
			"lastModified": "1970-01-01T00:00:00Z",
			"accountID": "",
			"createdAt": "1970-01-01T00:00:00Z",
			"lastUpdatedBy": ""
		}
	}`

	dec := json.NewDecoder(bytes.NewReader([]byte(jobJSON)))
	dec.DisallowUnknownFields()
	var job Job
	if err := dec.Decode(&job); err != nil {
		t.Fatal(err)
	}
	if len(job.Build.Costs.ExtrasCosts) != 1 {
		t.Fatalf("extrasCosts len: %d", len(job.Build.Costs.ExtrasCosts))
	}
	x := job.Build.Costs.ExtrasCosts[0]
	if x.Category != "2" || x.ExtraText != "Label" || x.ExtraValue != 99.5 {
		t.Fatalf("decoded extra: %+v", x)
	}
	if x.ID != "row-1" {
		t.Fatalf("extra id: got %q", x.ID)
	}
}

func TestJob_JSON_DisallowUnknownFields_acceptsPurchaseTypeID(t *testing.T) {
	const jobJSON = `{
		"jobID": "job-1",
		"name": "n",
		"jobType": 1,
		"jobStatus": 0,
		"volume": 1,
		"itemID": 57478,
		"maxProductionLimit": 1,
		"parentJobs": [],
		"displayOnPlanner": true,
		"isReadyToSell": false,
		"build": {
			"setup": {},
			"childJobs": {},
			"costs": {
				"extrasCosts": [],
				"linkedJobs": [],
				"inventionEntries": []
			},
			"sale": {
				"marketOrders": [],
				"transactions": [],
				"brokersFee": []
			},
			"materials": [
				{
					"typeID": 57478,
					"name": "x",
					"jobType": 1,
					"volume": 16,
					"purchasing": [
						{
							"id": "3b777158-8644-22e1-461c-45987b7e07e2",
							"typeID": 57478,
							"itemCost": 47780,
							"itemCount": 360,
							"childJobImport": false
						}
					]
				}
			]
		},
		"rawData": {"materials": [], "products": [], "time": 0},
		"skills": [],
		"itemsProducedPerRun": 1,
		"layout": {},
		"_meta": {
			"lastModified": "1970-01-01T00:00:00Z",
			"accountID": "",
			"createdAt": "1970-01-01T00:00:00Z",
			"lastUpdatedBy": ""
		}
	}`

	dec := json.NewDecoder(bytes.NewReader([]byte(jobJSON)))
	dec.DisallowUnknownFields()
	var job Job
	if err := dec.Decode(&job); err != nil {
		t.Fatal(err)
	}
	if len(job.Build.Materials) != 1 {
		t.Fatalf("materials len: %d", len(job.Build.Materials))
	}
	if len(job.Build.Materials[0].Purchasing) != 1 {
		t.Fatalf("purchasing len: %d", len(job.Build.Materials[0].Purchasing))
	}
	p := job.Build.Materials[0].Purchasing[0]
	if p.TypeID != 57478 || p.ItemCount != 360 || p.ItemCost != 47780 {
		t.Fatalf("purchase decode: %+v", p)
	}
}

// Exercises the same JSON paths as a planner / toDocument() job (Bowhead-shaped):
// metaLevel null, linked ESI job without job_type (JS LinkedESIJob), layout nulls, childJobs map, setup materialCount.
func TestJob_JSON_DisallowUnknownFields_representativePlannerDocument(t *testing.T) {
	const jobJSON = `{
		"metaLevel": null,
		"jobType": 1,
		"name": "Bowhead",
		"jobID": "job-28f63e7a-8930-c539-72b9-38e63bc65d0c",
		"jobStatus": 3,
		"volume": 17550000,
		"itemID": 34328,
		"maxProductionLimit": 1,
		"parentJobs": [],
		"blueprintTypeID": 34329,
		"isReadyToSell": false,
		"includedInGroup": false,
		"displayOnPlanner": true,
		"build": {
			"setup": {
				"a21b4ade-8312-0ebf-eccb-4146e2cec909": {
					"id": "a21b4ade-8312-0ebf-eccb-4146e2cec909",
					"runCount": 1,
					"jobCount": 1,
					"ME": 10,
					"TE": 9,
					"structureID": 0,
					"rigID": 0,
					"systemTypeID": 0,
					"systemID": 30000142,
					"taxValue": 0.25,
					"estimatedInstallCost": 225877995.92,
					"customStructureID": "manStruct-26e6a2d9-4778-8a1b-bdb4-c61e857bc3b5",
					"selectedCharacter": "8XGnAtq8QEEQ76LfinJaI8MA6T4=",
					"materialCount": {
						"57478": {"quantity": 360, "rawQuantity": 400, "typeID": 57478}
					},
					"estimatedTime": 836400,
					"rawTime": 1500000,
					"jobType": 1,
					"appliedRequirementID": -1,
					"alternativeSystemIndexValue": 0,
					"useAlternativeSystemIndexValue": false
				}
			},
			"childJobs": {"57478": []},
			"costs": {
				"extrasCosts": [
					{
						"id": "ee3c139f-7cce-8613-6f92-4bd7bebbfe92",
						"category": "1",
						"extraText": "fdsfs",
						"extraValue": 33
					}
				],
				"linkedJobs": [
					{
						"status": "active",
						"job_id": 649071222,
						"station_id": 1044913537143,
						"start_date": "2026-04-04T13:00:14Z",
						"runs": 1,
						"duration": 710940,
						"blueprint_id": 1051894846797,
						"is_corporation": true,
						"product_type_id": 34328,
						"end_date": "2026-04-12T18:29:14Z",
						"activity_id": 1,
						"CharacterHash": "8XGnAtq8QEEQ76LfinJaI8MA6T4=",
						"completed_date": null,
						"blueprint_type_id": 34329,
						"cost": 93039957,
						"corporation_id": 98699553
					}
				],
				"inventionEntries": []
			},
			"sale": {
				"marketOrders": [],
				"transactions": [],
				"brokersFee": []
			},
			"materials": [
				{
					"purchasing": [
						{
							"id": "3b777158-8644-22e1-461c-45987b7e07e2",
							"typeID": 57478,
							"itemCost": 47780,
							"itemCount": 360,
							"childJobImport": false,
							"childID": null
						}
					],
					"volume": 16,
					"jobType": 1,
					"typeID": 57478,
					"name": "Auto-Integrity Preservation Seal"
				}
			]
		},
		"rawData": {
			"time": 1500000,
			"materials": [{"jobType": 1, "quantity": 400, "typeID": 57478, "name": "x", "volume": 16}],
			"products": [{"typeID": 34328, "quantity": 1}]
		},
		"skills": [{"level": 1, "typeID": 22242}],
		"itemsProducedPerRun": 1,
		"layout": {
			"localMarketDisplay": null,
			"localOrderDisplay": null,
			"esiJobTab": null,
			"setupToEdit": "a21b4ade-8312-0ebf-eccb-4146e2cec909",
			"resourceDisplayType": null
		},
		"_meta": {
			"lastModified": "2026-04-05T08:26:44.017Z",
			"createdAt": "2026-04-05T08:26:44.017Z",
			"accountID": "8XGnAtq8QEEQ76LfinJaI8MA6T4",
			"lastUpdatedBy": "8XGnAtq8QEEQ76LfinJaI8MA6T4"
		}
	}`

	dec := json.NewDecoder(bytes.NewReader([]byte(jobJSON)))
	dec.DisallowUnknownFields()
	var job Job
	if err := dec.Decode(&job); err != nil {
		t.Fatal(err)
	}
	if job.MetaLevel != nil {
		t.Fatalf("metaLevel: want nil got %v", *job.MetaLevel)
	}
	if job.BlueprintTypeID == nil || *job.BlueprintTypeID != 34329 {
		t.Fatalf("blueprintTypeID: %#v", job.BlueprintTypeID)
	}
	if len(job.Build.Costs.LinkedJobs) != 1 || job.Build.Costs.LinkedJobs[0].JobID != 649071222 || job.Build.Costs.LinkedJobs[0].JobType != 0 {
		t.Fatalf("linked job decode: %#v", job.Build.Costs.LinkedJobs[0])
	}
	if job.Build.Costs.LinkedJobs[0].CompletedDate != "" {
		t.Fatalf("completed_date null: got %q", job.Build.Costs.LinkedJobs[0].CompletedDate)
	}
	if len(job.Build.Materials) != 1 || job.Build.Materials[0].Purchasing[0].TypeID != 57478 {
		t.Fatalf("material/purchase decode failed")
	}
}

func TestJob_JSON_DisallowUnknownFields_marketOrderRangeESIString(t *testing.T) {
	const jobJSON = `{
		"jobID": "job-x",
		"name": "n",
		"jobType": 2,
		"jobStatus": 0,
		"volume": 0.1,
		"itemID": 57457,
		"maxProductionLimit": 1000,
		"parentJobs": [],
		"groupID": "",
		"includedInGroup": false,
		"displayOnPlanner": true,
		"isReadyToSell": false,
		"build": {
			"setup": {},
			"childJobs": {},
			"costs": {
				"extrasCosts": [],
				"linkedJobs": [],
				"inventionEntries": []
			},
			"sale": {
				"marketOrders": [
					{
						"duration": 90,
						"is_corporation": true,
						"issued": "2026-04-03T15:27:19Z",
						"location_id": 60003760,
						"order_id": 7300255528,
						"item_price": 3969,
						"range": "region",
						"region_id": 10000002,
						"type_id": 57457,
						"volume_remain": 0,
						"volume_total": 200000,
						"timeStamps": ["2026-04-03T15:27:19Z"],
						"CharacterHash": "x",
						"complete": true,
						"state": "expired"
					}
				],
				"transactions": [],
				"brokersFee": []
			},
			"materials": []
		},
		"rawData": {"materials": [], "products": [], "time": 0},
		"skills": [],
		"itemsProducedPerRun": 200,
		"layout": {},
		"_meta": {
			"lastModified": "1970-01-01T00:00:00Z",
			"accountID": "",
			"createdAt": "1970-01-01T00:00:00Z",
			"lastUpdatedBy": ""
		}
	}`

	dec := json.NewDecoder(bytes.NewReader([]byte(jobJSON)))
	dec.DisallowUnknownFields()
	var job Job
	if err := dec.Decode(&job); err != nil {
		t.Fatal(err)
	}
	if len(job.Build.Sale.MarketOrders) != 1 || job.Build.Sale.MarketOrders[0].Range != "region" {
		t.Fatalf("market order range: %+v", job.Build.Sale.MarketOrders)
	}
}
