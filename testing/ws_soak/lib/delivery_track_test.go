package soaklib

import (
	"strings"
	"testing"
	"time"
)

func TestDeliveryTrackerExactMulti(t *testing.T) {
	tr := newDeliveryTracker(64)
	tr.Start()
	defer tr.Close()

	tr.TrackPub("d1", fanoutMsgCorpFull, []string{"a", "b", "c"})
	if tr.Pubs.Load() != 1 || tr.Expect.Load() != 3 {
		t.Fatalf("pubs/expect=%d/%d", tr.Pubs.Load(), tr.Expect.Load())
	}
	tr.OfferRecv("d1", "a")
	tr.OfferRecv("d1", "b")
	waitRecv(t, tr, 2)
	if tr.PendingCount() != 1 {
		t.Fatalf("pending=%d", tr.PendingCount())
	}
	tr.OfferRecv("d1", "c")
	waitRecv(t, tr, 3)
	if tr.PendingCount() != 0 || tr.Wrong.Load() != 0 || tr.Dup.Load() != 0 {
		t.Fatalf("pending/wrong/dup=%d/%d/%d", tr.PendingCount(), tr.Wrong.Load(), tr.Dup.Load())
	}
}

func TestDeliveryTrackerWrongDupLate(t *testing.T) {
	tr := newDeliveryTracker(64)
	tr.Start()
	defer tr.Close()

	tr.TrackPub("d1", fanoutMsgAccount, []string{"a"})
	tr.OfferRecv("d1", "a")
	waitRecv(t, tr, 1)
	tr.OfferRecv("d1", "a") // dup
	tr.OfferRecv("d1", "z") // wrong / offline
	tr.OfferRecv("missing", "a")
	deadline := time.Now().Add(time.Second)
	for time.Now().Before(deadline) {
		if tr.Dup.Load() >= 1 && tr.Wrong.Load() >= 1 && tr.Late.Load() >= 1 && tr.OfflineHit.Load() >= 1 {
			break
		}
		time.Sleep(5 * time.Millisecond)
	}
	if tr.Dup.Load() != 1 || tr.Wrong.Load() != 1 || tr.OfflineHit.Load() != 1 || tr.Late.Load() != 1 {
		t.Fatalf("dup/wrong/offline/late=%d/%d/%d/%d", tr.Dup.Load(), tr.Wrong.Load(), tr.OfflineHit.Load(), tr.Late.Load())
	}
	samples := tr.WrongSamples()
	if len(samples) != 1 || samples[0].Got != "z" {
		t.Fatalf("samples=%v", samples)
	}
	if err := tr.AssertExact(0); err == nil {
		t.Fatal("expected assert fail")
	}
}

func TestDeliveryTrackerPerKindAndReset(t *testing.T) {
	tr := newDeliveryTracker(64)
	tr.Start()
	defer tr.Close()

	tr.TrackPub("a1", fanoutMsgAccount, []string{"solo"})
	tr.TrackPub("c1", fanoutMsgCorpFull, []string{"m1", "m2"})
	tr.OfferRecv("a1", "solo")
	tr.OfferRecv("c1", "m1")
	tr.OfferRecv("c1", "m2")
	waitRecv(t, tr, 3)
	line := tr.KindReportLine()
	if line == "" || line == "fanout_kinds: (none)" {
		t.Fatalf("kinds=%q", line)
	}
	tr.Reset()
	if tr.Pubs.Load() != 0 || tr.Expect.Load() != 0 || tr.Recv.Load() != 0 || tr.PendingCount() != 0 {
		t.Fatal("reset incomplete")
	}
}

func TestDeliveryTrackerHasPendingAccount(t *testing.T) {
	tr := newDeliveryTracker(64)
	tr.Start()
	defer tr.Close()
	tr.TrackPub("d1", fanoutMsgCorpFull, []string{"a", "b"})
	if !tr.HasPendingAccount("a") || !tr.HasPendingAccount("b") {
		t.Fatal("expected pending accounts")
	}
	tr.OfferRecv("d1", "a")
	waitRecv(t, tr, 1)
	if tr.HasPendingAccount("a") {
		t.Fatal("a should be satisfied")
	}
	if !tr.HasPendingAccount("b") {
		t.Fatal("b still pending")
	}
}

func TestDeliveryTrackerPendingDump(t *testing.T) {
	tr := newDeliveryTracker(64)
	tr.Start()
	defer tr.Close()
	tr.TrackPub("d1", fanoutMsgCorpFull, []string{"a", "b", "c"})
	tr.OfferRecv("d1", "a")
	waitRecv(t, tr, 1)
	gaps := tr.PendingGaps()
	if len(gaps) != 1 || gaps[0].DocID != "d1" {
		t.Fatalf("gaps=%v", gaps)
	}
	if len(gaps[0].Missing) != 2 || gaps[0].Missing[0] != "b" || gaps[0].Missing[1] != "c" {
		t.Fatalf("missing=%v", gaps[0].Missing)
	}
	if len(gaps[0].Got) != 1 || gaps[0].Got[0] != "a" {
		t.Fatalf("got=%v", gaps[0].Got)
	}
	dump := tr.FormatPendingDump()
	if !strings.Contains(dump, "d1") || !strings.Contains(dump, "missing=") {
		t.Fatalf("dump=%q", dump)
	}
	tr.OfferRecv("d1", "b")
	tr.OfferRecv("d1", "c")
	waitRecv(t, tr, 3)
	if tr.FormatPendingDump() != "fanout pending dump: (none)" {
		t.Fatalf("expected empty dump, got %q", tr.FormatPendingDump())
	}
}

func waitRecv(t *testing.T, tr *deliveryTracker, want uint64) {
	t.Helper()
	deadline := time.Now().Add(2 * time.Second)
	for time.Now().Before(deadline) {
		if tr.Recv.Load() >= want {
			return
		}
		time.Sleep(5 * time.Millisecond)
	}
	t.Fatalf("timeout recv want=%d have=%d", want, tr.Recv.Load())
}
