package nats

import "testing"

func TestSubjectsAsSetEqual(t *testing.T) {
	t.Parallel()
	if !subjectsAsSetEqual([]string{"a", "b"}, []string{"b", "a"}) {
		t.Fatal("order should not matter")
	}
	if subjectsAsSetEqual([]string{"a"}, []string{"a", "a"}) {
		t.Fatal("multiplicity should matter")
	}
	if !subjectsAsSetEqual([]string{"doc.update.>"}, []string{"doc.update.>"}) {
		t.Fatal("identical single")
	}
	if subjectsAsSetEqual([]string{"doc.update.>"}, []string{"doc.update.>", "doc.lock.>"}) {
		t.Fatal("different sets")
	}
}
