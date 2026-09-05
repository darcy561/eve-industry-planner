package nats_test

import (
	"encoding/json"
	"os"
	"path/filepath"
	"slices"
	"testing"

	eipnats "eve-industry-planner/shared/nats"
)

// corpusPath is the shared vocabulary, read from the repo root rather than
// copied here: the SPA reads the same file, and a message kind may not be added
// on one side alone.
const corpusPath = "../../../testing/fixtures/realtime-messages/kinds.json"

type kindCorpus struct {
	Families []struct {
		Type     string `json:"type"`
		Subtypes []struct {
			Subtype string `json:"subtype"`
		} `json:"subtypes"`
	} `json:"families"`
}

func TestClientMessageKindsMatchTheCorpus(t *testing.T) {
	t.Parallel()

	raw, err := os.ReadFile(filepath.FromSlash(corpusPath))
	if err != nil {
		t.Fatalf("read corpus: %v", err)
	}
	var corpus kindCorpus
	if err := json.Unmarshal(raw, &corpus); err != nil {
		t.Fatalf("decode corpus: %v", err)
	}
	if len(corpus.Families) == 0 {
		t.Fatal("corpus lists no families")
	}

	for _, family := range corpus.Families {
		kinds, known := eipnats.ClientMessageKinds[family.Type]
		if !known {
			t.Errorf("corpus names family %q that Go does not define", family.Type)
			continue
		}
		for _, sub := range family.Subtypes {
			if !slices.Contains(kinds, sub.Subtype) {
				t.Errorf("corpus names %s/%s that Go does not define", family.Type, sub.Subtype)
			}
		}
		if len(kinds) != len(family.Subtypes) {
			t.Errorf("family %q: Go defines %d kinds, corpus lists %d", family.Type, len(kinds), len(family.Subtypes))
		}
	}
	if len(eipnats.ClientMessageKinds) != len(corpus.Families) {
		t.Errorf("Go defines %d families, corpus lists %d", len(eipnats.ClientMessageKinds), len(corpus.Families))
	}
}
