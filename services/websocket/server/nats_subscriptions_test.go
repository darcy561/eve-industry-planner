package server

import "testing"

func TestCollectionScopedDocIDFromDocUpdatePrefersPayload(t *testing.T) {
	t.Parallel()
	payload := []byte(`{"collection":"jobs","docID":"d1","accountID":"a1"}`)
	subject := "doc.update.account:a1.jobs.d1"
	got, err := collectionScopedDocIDFromDocUpdate(payload, subject)
	if err != nil {
		t.Fatal(err)
	}
	if got != "jobs.d1" {
		t.Fatalf("got %q", got)
	}
}

func TestCollectionScopedDocIDFromDocUpdateLegacySubjectFallback(t *testing.T) {
	t.Parallel()
	got, err := collectionScopedDocIDFromDocUpdate([]byte(`{}`), "doc.update.jobs.legacy")
	if err != nil {
		t.Fatal(err)
	}
	if got != "jobs.legacy" {
		t.Fatalf("got %q", got)
	}
}
