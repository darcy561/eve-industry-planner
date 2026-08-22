package models

import (
	"fmt"
	"testing"
)

func TestValidateGroupTemplatePayload_ok(t *testing.T) {
	p := &GroupTemplatePayload{
		AccountID:  "acc-1",
		TemplateID: "tpl-1",
		Jobs: []TemplateJobNode{
			{
				TemplateJobID:        "tj-1",
				ItemID:               34,
				DesiredTotalQuantity: 100,
				PresetSetups: []TemplatePresetSetup{
					{RunCount: 10, JobCount: 1, ME: 0, TE: 0},
				},
			},
		},
	}
	if err := ValidateGroupTemplatePayload(p); err != nil {
		t.Fatal(err)
	}
}

func TestValidateGroupTemplatePayload_unknownParent(t *testing.T) {
	p := &GroupTemplatePayload{
		AccountID:  "acc-1",
		TemplateID: "tpl-1",
		Jobs: []TemplateJobNode{
			{
				TemplateJobID:        "tj-1",
				ItemID:               34,
				DesiredTotalQuantity: 100,
				ParentTemplateJobIDs: []string{"missing"},
				PresetSetups:         []TemplatePresetSetup{{RunCount: 10, JobCount: 1, ME: 0, TE: 0}},
			},
		},
	}
	if err := ValidateGroupTemplatePayload(p); err == nil {
		t.Fatal("expected error")
	}
}

func TestValidateGroupTemplatePayload_tooManyJobs(t *testing.T) {
	jobs := make([]TemplateJobNode, MaxJobsPerTemplate+1)
	for i := range jobs {
		jobs[i] = TemplateJobNode{
			TemplateJobID:        fmt.Sprintf("tj-%d", i),
			ItemID:               34,
			DesiredTotalQuantity: 1,
			PresetSetups:         []TemplatePresetSetup{{RunCount: 1, JobCount: 1, ME: 0, TE: 0}},
		}
	}
	p := &GroupTemplatePayload{AccountID: "a", TemplateID: "t", Jobs: jobs}
	if err := ValidateGroupTemplatePayload(p); err == nil {
		t.Fatal("expected error")
	}
}
