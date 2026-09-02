package models_test

import (
	"encoding/json"
	"os"
	"path/filepath"
	"testing"

	"eve-industry-planner/shared/models"
)

// corpusPath is the shared case file, read from the repo root rather than copied
// here: the SPA reads the same file, and what a job cost may not change on one
// side alone.
const corpusPath = "../../../testing/fixtures/job-cost/cases.json"

type costCase struct {
	Name     string      `json:"name"`
	Why      string      `json:"why"`
	Job      models.Job  `json:"job"`
	Expected costExpects `json:"expected"`
}

type costExpects struct {
	Produced       int     `json:"produced"`
	Materials      float64 `json:"materials"`
	Install        float64 `json:"install"`
	Invention      float64 `json:"invention"`
	Extras         float64 `json:"extras"`
	BrokersFee     float64 `json:"brokersFee"`
	TransactionFee float64 `json:"transactionFee"`
	Build          float64 `json:"build"`
	Total          float64 `json:"total"`
}

func TestJobCostMatchesTheCorpus(t *testing.T) {
	t.Parallel()

	raw, err := os.ReadFile(filepath.FromSlash(corpusPath))
	if err != nil {
		t.Fatalf("read corpus: %v", err)
	}
	var doc struct {
		Cases []costCase `json:"cases"`
	}
	if err := json.Unmarshal(raw, &doc); err != nil {
		t.Fatalf("decode corpus: %v", err)
	}
	if len(doc.Cases) == 0 {
		t.Fatal("corpus is empty")
	}

	for _, tc := range doc.Cases {
		t.Run(tc.Name, func(t *testing.T) {
			parts := tc.Job.CostParts()

			if got := tc.Job.TotalQuantityProduced(); got != tc.Expected.Produced {
				t.Errorf("produced = %v, want %v\n%s", got, tc.Expected.Produced, tc.Why)
			}

			for _, check := range []struct {
				field string
				got   float64
				want  float64
			}{
				{"materials", parts.Materials, tc.Expected.Materials},
				{"install", parts.Install, tc.Expected.Install},
				{"invention", parts.Invention, tc.Expected.Invention},
				{"extras", parts.Extras, tc.Expected.Extras},
				{"brokersFee", parts.BrokersFee, tc.Expected.BrokersFee},
				{"transactionFee", parts.TransactionFee, tc.Expected.TransactionFee},
				{"build", parts.Build(), tc.Expected.Build},
				{"total", parts.Total(), tc.Expected.Total},
			} {
				if check.got != check.want {
					t.Errorf("%s = %v, want %v\n%s", check.field, check.got, check.want, tc.Why)
				}
			}
		})
	}
}
