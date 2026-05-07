package corpinference

import (
	"testing"

	"eve-industry-planner/shared/shared/models"
)

func TestInferJobCorp(t *testing.T) {
	tests := []struct {
		name     string
		jobs     []models.LinkedESIJob
		wantID   int
		wantStat string
	}{
		{
			name: "none",
			jobs: []models.LinkedESIJob{
				{IsCorporation: false, CorporationID: 0},
				{IsCorporation: true, CorporationID: 0},
			},
			wantID: 0, wantStat: StatusNone,
		},
		{
			name: "historic corp id without is_corporation flag",
			jobs: []models.LinkedESIJob{
				{IsCorporation: false, CorporationID: 777},
			},
			wantID: 777, wantStat: StatusKnown,
		},
		{
			name: "single distinct",
			jobs: []models.LinkedESIJob{
				{IsCorporation: true, CorporationID: 200},
				{IsCorporation: true, CorporationID: 200},
			},
			wantID: 200, wantStat: StatusKnown,
		},
		{
			name: "ambiguous",
			jobs: []models.LinkedESIJob{
				{IsCorporation: true, CorporationID: 200},
				{IsCorporation: true, CorporationID: 300},
			},
			wantID: 0, wantStat: StatusAmbiguous,
		},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			gotID, gotStat := InferJobCorp(tt.jobs)
			if gotID != tt.wantID || gotStat != tt.wantStat {
				t.Fatalf("InferJobCorp() = (%d,%s), want (%d,%s)", gotID, gotStat, tt.wantID, tt.wantStat)
			}
		})
	}
}

func TestInferSingleDistinctCorpIDFromLinkedJobMap(t *testing.T) {
	id, ok := InferSingleDistinctCorpIDFromLinkedJobMap(map[int]int{1: 100, 2: 100})
	if !ok || id != 100 {
		t.Fatalf("got (%d,%v), want (100,true)", id, ok)
	}
	_, ok = InferSingleDistinctCorpIDFromLinkedJobMap(map[int]int{1: 100, 2: 200})
	if ok {
		t.Fatal("expected ambiguous / not ok")
	}
}
