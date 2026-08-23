package soaklib

import (
	"context"
	"strings"
	"sync/atomic"
	"testing"
	"time"

	"eve-industry-planner/shared/wsplacement"
)

func TestTenantGenEventShapesAndCap(t *testing.T) {
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()

	var seedBatches atomic.Int64
	topo, stats, err := CollectTenantGen(ctx, TenantGenOptions{
		Clients:     80,
		Seed:        42,
		EmitEvery:   time.Microsecond,
		BufSize:     8,
		AffinityMix: 0.25,
		NoSeed:      false,
		SeedFunc: func(_ context.Context, ids []clientIdentity) error {
			seedBatches.Add(1)
			if len(ids) == 0 {
				t.Fatal("empty seed batch")
			}
			return nil
		},
		SeedChunk: 10,
	})
	if err != nil {
		t.Fatal(err)
	}
	if len(topo.All) < 80 {
		t.Fatalf("clients=%d want >= 80", len(topo.All))
	}
	if len(topo.All) > 80+20 {
		// Events may slightly overshoot only if a single event is large; generator caps per event to remain.
		t.Fatalf("clients=%d overshot cap badly", len(topo.All))
	}
	if len(topo.Solo) == 0 {
		t.Fatal("expected solos")
	}
	if len(topo.standaloneCorps()) == 0 {
		t.Fatal("expected standalone corps")
	}
	if len(topo.Alliances) == 0 {
		t.Fatal("expected alliances")
	}
	if stats.Emitted.Load() == 0 {
		t.Fatal("expected emits")
	}
	if seedBatches.Load() == 0 {
		t.Fatal("expected seed batches")
	}
	if stats.SeedCalls.Load() == 0 {
		t.Fatal("expected seed calls")
	}

	kinds := map[TenantEventKind]bool{}
	genCh, _, errCh := StartTenantGen(context.Background(), TenantGenOptions{
		Clients:   60,
		Seed:      7,
		EmitEvery: time.Microsecond,
		NoSeed:    true,
	})
	for ev := range genCh {
		kinds[ev.Kind] = true
		if len(ev.Clients) == 0 {
			t.Fatalf("event %s has no clients", ev.Kind)
		}
		switch ev.Kind {
		case TenantStandaloneCorp:
			if ev.CorpID == 0 || len(ev.Corps) != 1 {
				t.Fatalf("standalone shape: %#v", ev)
			}
		case TenantAlliance:
			if ev.Alliance == nil || ev.AllianceID == 0 || len(ev.Corps) < 1 {
				t.Fatalf("alliance shape: %#v", ev)
			}
		case TenantGrowCorp:
			if ev.CorpID == 0 {
				t.Fatalf("grow shape: %#v", ev)
			}
		case TenantSolo, TenantOrphan:
			for _, id := range ev.Clients {
				if id.CorpID != 0 || id.AllianceID != 0 {
					t.Fatalf("solo/orphan must be orgless: %#v", id)
				}
			}
		}
	}
	if err := <-errCh; err != nil {
		t.Fatal(err)
	}
	for _, k := range []TenantEventKind{TenantSolo, TenantStandaloneCorp, TenantAlliance} {
		if !kinds[k] {
			t.Fatalf("missing kind %s in kinds=%v", k, kinds)
		}
	}
}

func TestTenantGenContinuousPastBootstrap(t *testing.T) {
	ctx, cancel := context.WithTimeout(context.Background(), 800*time.Millisecond)
	defer cancel()

	genCh, stats, errCh := StartTenantGen(ctx, TenantGenOptions{
		Clients:         20,
		Seed:            11,
		EmitEvery:       time.Millisecond,
		Continuous:      true,
		ContinuousEvery: 5 * time.Millisecond,
		NoSeed:          true, // MaxClients 0 = unbounded
	})
	var n int
	for ev := range genCh {
		n += len(ev.Clients)
	}
	if err := <-errCh; err != nil {
		t.Fatal(err)
	}
	if n <= 20 {
		t.Fatalf("continuous should grow past bootstrap: clients=%d stats=%d", n, stats.Clients.Load())
	}
}

func TestTenantGenContinuousRespectsMaxClients(t *testing.T) {
	ctx, cancel := context.WithTimeout(context.Background(), 800*time.Millisecond)
	defer cancel()

	genCh, stats, errCh := StartTenantGen(ctx, TenantGenOptions{
		Clients:         20,
		MaxClients:      20,
		Seed:            12,
		EmitEvery:       time.Millisecond,
		Continuous:      true,
		ContinuousEvery: 5 * time.Millisecond,
		NoSeed:          true,
	})
	var n int
	for ev := range genCh {
		n += len(ev.Clients)
	}
	if err := <-errCh; err != nil {
		t.Fatal(err)
	}
	if n != 20 || stats.Clients.Load() != 20 {
		t.Fatalf("max cap: clients=%d stats=%d", n, stats.Clients.Load())
	}
}

func TestTenantGenSeedDeterministic(t *testing.T) {
	opts := TenantGenOptions{
		Clients:     40,
		Seed:        99,
		EmitEvery:   time.Microsecond,
		AffinityMix: 0.5,
		NoSeed:      true,
	}
	a, _, err := CollectTenantGen(context.Background(), opts)
	if err != nil {
		t.Fatal(err)
	}
	b, _, err := CollectTenantGen(context.Background(), opts)
	if err != nil {
		t.Fatal(err)
	}
	if len(a.All) != len(b.All) {
		t.Fatalf("len a=%d b=%d", len(a.All), len(b.All))
	}
	for i := range a.All {
		if a.All[i] != b.All[i] {
			t.Fatalf("mismatch at %d: %#v vs %#v", i, a.All[i], b.All[i])
		}
	}
}

func TestTenantGenAffinityMix(t *testing.T) {
	topo, _, err := CollectTenantGen(context.Background(), TenantGenOptions{
		Clients:     120,
		Seed:        3,
		EmitEvery:   time.Microsecond,
		AffinityMix: 1.0, // all org members get shared corp/alliance keys
		NoSeed:      true,
	})
	if err != nil {
		t.Fatal(err)
	}
	var org, shared int
	for _, id := range topo.All {
		if id.CorpID == 0 && id.AllianceID == 0 {
			if id.Affinity != wsplacement.TenantKeyAccount(id.AccountID) {
				t.Fatalf("solo affinity: %q", id.Affinity)
			}
			continue
		}
		org++
		if strings.HasPrefix(id.Affinity, "corporation:") || strings.HasPrefix(id.Affinity, "alliance:") {
			shared++
		}
	}
	if org == 0 || shared != org {
		t.Fatalf("org=%d sharedAffinity=%d", org, shared)
	}
}

func TestTenantGenBackpressure(t *testing.T) {
	ctx, cancel := context.WithTimeout(context.Background(), 3*time.Second)
	defer cancel()

	genCh, stats, errCh := StartTenantGen(ctx, TenantGenOptions{
		Clients:   40,
		Seed:      1,
		EmitEvery: time.Microsecond,
		BufSize:   1, // force blocking sends
		NoSeed:    true,
	})

	// Slow consumer.
	var n int
	for ev := range genCh {
		n += len(ev.Clients)
		time.Sleep(2 * time.Millisecond)
	}
	if err := <-errCh; err != nil {
		t.Fatal(err)
	}
	if n < 40 {
		t.Fatalf("clients=%d", n)
	}
	if stats.GenBlocked.Load() == 0 {
		t.Fatal("expected gen_blocked > 0 with BufSize=1 and slow consumer")
	}
}

func TestTopologyFromEventsGrowMerges(t *testing.T) {
	events := []TenantEvent{
		{
			Kind:    TenantStandaloneCorp,
			Clients: []clientIdentity{{AccountID: "a1", CorpID: 5}, {AccountID: "a2", CorpID: 5}},
			CorpID:  5,
			Corps:   []fanoutCorp{{ID: 5, Members: []clientIdentity{{AccountID: "a1", CorpID: 5}, {AccountID: "a2", CorpID: 5}}}},
		},
		{
			Kind:    TenantGrowCorp,
			Clients: []clientIdentity{{AccountID: "a3", CorpID: 5}},
			CorpID:  5,
			Corps:   []fanoutCorp{{ID: 5, Members: []clientIdentity{{AccountID: "a3", CorpID: 5}}}},
		},
		{
			Kind:    TenantSolo,
			Clients: []clientIdentity{{AccountID: "s1"}},
		},
	}
	topo, err := TopologyFromEvents(events)
	if err != nil {
		t.Fatal(err)
	}
	if len(topo.corpMembers(5)) != 3 {
		t.Fatalf("members=%d", len(topo.corpMembers(5)))
	}
	if len(topo.Solo) != 1 || len(topo.All) != 4 {
		t.Fatalf("solo=%d all=%d", len(topo.Solo), len(topo.All))
	}
}
