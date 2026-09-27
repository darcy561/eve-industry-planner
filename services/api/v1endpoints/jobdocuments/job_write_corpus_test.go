package jobdocuments

import (
	"maps"
	"slices"
	"testing"

	"encoding/json/jsontext"

	"eve-industry-planner/shared/jsoncodec"
	"eve-industry-planner/shared/models"
	jobwritecorpus "eve-industry-planner/testing/fixtures/job-write"
)

type jobWriteCorpus struct {
	Revision    int64               `json:"revision"`
	Job         jsontext.Value      `json:"job"`
	Write       models.JobWriteBody `json:"write"`
	StoredPaths struct {
		Set   []string `json:"set"`
		Unset []string `json:"unset"`
	} `json:"storedPaths"`
}

func loadJobWriteCorpus(t *testing.T) jobWriteCorpus {
	t.Helper()
	var corpus jobWriteCorpus
	if err := jsoncodec.Unmarshal(jobwritecorpus.Raw, &corpus); err != nil {
		t.Fatalf("decode corpus: %v", err)
	}
	return corpus
}

func TestTheCorpusWriteIsOneThisEndpointAccepts(t *testing.T) {
	t.Parallel()
	corpus := loadJobWriteCorpus(t)

	if err := corpus.Write.Validate(); err != nil {
		t.Fatalf("the corpus write is refused before it is read: %v", err)
	}
	if corpus.Write.IsWholeDocument() {
		t.Fatal("the corpus write carries a revision, so it must be field-scoped")
	}
	if corpus.Write.Revision != corpus.Revision {
		t.Fatalf("write revision = %d, corpus says the job stood at %d",
			corpus.Write.Revision, corpus.Revision)
	}
	if _, err := decodeJobWrite(corpus.Write); err != nil {
		t.Fatalf("the partial document is one this model cannot read: %v", err)
	}
}

func TestTheCorpusWriteReachesThePathsItStates(t *testing.T) {
	t.Parallel()
	corpus := loadJobWriteCorpus(t)

	job, err := decodeJobWrite(corpus.Write)
	if err != nil {
		t.Fatalf("decode the write: %v", err)
	}
	write, err := fieldWriteFor(corpus.Write, job)
	if err != nil {
		t.Fatalf("plan the write: %v", err)
	}

	for _, path := range corpus.StoredPaths.Set {
		if _, ok := write.Fields[path]; !ok {
			t.Fatalf("the write sets %v, corpus says it must set %q",
				slices.Sorted(maps.Keys(write.Fields)), path)
		}
	}
	if len(write.Fields) != len(corpus.StoredPaths.Set)+1 {
		t.Fatalf("the write sets %v, corpus says only %v plus the schema version",
			slices.Sorted(maps.Keys(write.Fields)), corpus.StoredPaths.Set)
	}
	if _, ok := write.Fields[models.JobSchemaVersionPath]; !ok {
		t.Fatalf("the write does not restate the schema version: %v",
			slices.Sorted(maps.Keys(write.Fields)))
	}
	if !slices.Equal(write.Cleared, corpus.StoredPaths.Unset) {
		t.Fatalf("the write clears %v, corpus says %v",
			write.Cleared, corpus.StoredPaths.Unset)
	}
	if write.Expected != corpus.Revision {
		t.Fatalf("the write is checked against %d, corpus says %d",
			write.Expected, corpus.Revision)
	}
}
