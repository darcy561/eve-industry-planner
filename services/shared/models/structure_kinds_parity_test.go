package models

import (
	"encoding/json"
	"os"
	"path/filepath"
	"testing"
)

// kindsPath is the committed fixture, relative to this package.
const kindsPath = "../../../testing/fixtures/structure-kinds/kinds.json"

const regenerateKinds = "EIP_UPDATE_STRUCTURE_KINDS=1 go test ./shared/models/ -run TestTheStructureKindListIsCurrent"

const kindsWhy = "What a saved structure's jobType field can be. Both languages " +
	"read that field to decide which optional fields a row carries, and each " +
	"writes its own copy of the values, so nothing but this file connects the " +
	"two. A value that disagrees misfiles a row rather than failing. " +
	"Regenerate with: " + regenerateKinds

// structureKinds is keyed by the name the SPA uses, because the fixture exists
// to be read by the SPA. The four job types are named for the job because that
// is what a build structure's kind has always been; the market kinds are named
// for the place.
type structureKindList struct {
	Why   string         `json:"why"`
	Kinds map[string]int `json:"kinds"`
}

func currentStructureKinds() structureKindList {
	return structureKindList{
		Why: kindsWhy,
		Kinds: map[string]int{
			"manufacturing": JobTypeManufacturing,
			"reaction":      JobTypeReaction,
			"invention":     JobTypeInvention,
			"reprocessing":  JobTypeReprocessing,
			"npcStation":    StructureKindNPCStation,
			"citadelMarket": StructureKindCitadelMarket,
		},
	}
}

// Adding a kind changes what the SPA must offer and what it stores against, so
// the committed list has to move with it in the same commit.
func TestTheStructureKindListIsCurrent(t *testing.T) {
	encoded, err := json.MarshalIndent(currentStructureKinds(), "", "  ")
	if err != nil {
		t.Fatalf("encode the kinds: %v", err)
	}
	encoded = append(encoded, '\n')

	if os.Getenv("EIP_UPDATE_STRUCTURE_KINDS") == "1" {
		if err := os.MkdirAll(filepath.Dir(kindsPath), 0o755); err != nil {
			t.Fatalf("create the fixture directory: %v", err)
		}
		if err := os.WriteFile(kindsPath, encoded, 0o644); err != nil {
			t.Fatalf("write the kinds: %v", err)
		}
		t.Logf("wrote %s", kindsPath)
		return
	}

	committed, err := os.ReadFile(kindsPath)
	if err != nil {
		t.Fatalf("read the committed kinds: %v\nregenerate with: %s", err, regenerateKinds)
	}
	if string(committed) != string(encoded) {
		t.Fatalf("the committed structure kind list is stale.\n"+
			"A kind changed without %s moving with it, so the SPA is storing "+
			"rows against values this server no longer means.\n"+
			"Regenerate with: %s", kindsPath, regenerateKinds)
	}
}

// A kind's value is what a stored row carries, so two kinds sharing one would
// make a row of either indistinguishable from the other.
func TestEveryStructureKindHasItsOwnValue(t *testing.T) {
	t.Parallel()

	seen := map[int]string{}
	for name, value := range currentStructureKinds().Kinds {
		if other, held := seen[value]; held {
			t.Errorf("%q and %q are both %d", name, other, value)
		}
		seen[value] = name
	}
}
