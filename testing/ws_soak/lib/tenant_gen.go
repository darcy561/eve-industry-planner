package soaklib

import (
	"context"
	"fmt"
	"math/rand/v2"
	"sync/atomic"
	"time"

	"eve-industry-planner/shared/wsplacement"

	"github.com/redis/go-redis/v9"
)

// TenantEventKind classifies a streamed tenant/client generation step.
type TenantEventKind string

const (
	TenantSolo           TenantEventKind = "solo"
	TenantStandaloneCorp TenantEventKind = "standalone_corp"
	TenantAlliance       TenantEventKind = "alliance"
	TenantGrowCorp       TenantEventKind = "grow_corp"
	TenantOrphan         TenantEventKind = "orphan"
)

const (
	defaultTenantGenBuf             = 16
	defaultTenantGenInterval        = 2 * time.Millisecond
	defaultTenantGenContinuousEvery = 250 * time.Millisecond
	defaultFanoutAffinityMix        = 0.25
	defaultTenantSeedChunk          = 32
	defaultTenantSoloWeight         = 3
	defaultTenantStandWeight        = 3
	defaultTenantAllWeight          = 2
	defaultTenantGrowWeight         = 2
	defaultTenantOrphanWeight       = 1
)

// TenantEvent is one generation step with newly created clients (already Redis-seeded when seeding is on).
type TenantEvent struct {
	Kind       TenantEventKind
	Clients    []clientIdentity
	CorpID     int64 // set for corp / grow / alliance corps
	AllianceID int64 // set for alliance-affiliated members
	// Corps lists corps created or grown in this event (Members = new members only for grow).
	Corps []fanoutCorp
	// Alliance is set for TenantAlliance (new alliance + its corps).
	Alliance *fanoutAlliance
}

// TenantGenOptions controls the streaming tenantGen producer.
type TenantGenOptions struct {
	Clients int   // bootstrap target (and hard cap when Continuous is false)
	Seed    int64 // RNG seed; 0 = time-based
	// AffinityMix is the fraction of org members that get corp/alliance affinity cookies (0 = default 0.25).
	AffinityMix float64
	EmitEvery   time.Duration // pace during bootstrap (0 = default)
	// Continuous keeps inventing tenants after Clients until ctx ends (soft ongoing storm).
	Continuous bool
	// ContinuousEvery paces emits after bootstrap (0 = default 250ms).
	ContinuousEvery time.Duration
	// MaxClients caps total invented clients when Continuous (0 = unbounded). Fanout sets this to Clients.
	MaxClients int
	BufSize    int // genCh buffer (0 = default)

	AllianceBase   int64
	CorpBase       int64
	StandaloneBase int64

	SoloWeight           int
	StandaloneCorpWeight int
	AllianceWeight       int
	GrowCorpWeight       int
	OrphanWeight         int

	Redis  *redis.Client
	NoSeed bool
	// SeedFunc overrides Redis seeding (tests). Receives the event's new clients as one batch.
	SeedFunc func(ctx context.Context, ids []clientIdentity) error
	// SeedChunk is max identities per seedSessions call inside a batch (0 = default).
	SeedChunk int
}

// TenantGenStats is progress for tenantGen (safe for concurrent reporters).
type TenantGenStats struct {
	Emitted    atomic.Uint64
	Clients    atomic.Uint64
	GenBlocked atomic.Uint64
	SeedCalls  atomic.Uint64
}

func (o TenantGenOptions) withDefaults() TenantGenOptions {
	out := o
	if out.Clients < 1 {
		out.Clients = 500
	}
	if out.AffinityMix <= 0 {
		out.AffinityMix = defaultFanoutAffinityMix
	}
	if out.AffinityMix > 1 {
		out.AffinityMix = 1
	}
	if out.EmitEvery <= 0 {
		out.EmitEvery = defaultTenantGenInterval
	}
	if out.ContinuousEvery <= 0 {
		out.ContinuousEvery = defaultTenantGenContinuousEvery
	}
	if out.BufSize <= 0 {
		out.BufSize = defaultTenantGenBuf
	}
	if out.AllianceBase == 0 {
		out.AllianceBase = defaultFanoutAllianceBase
	}
	if out.CorpBase == 0 {
		out.CorpBase = defaultFanoutAffiliatedCorp
	}
	if out.StandaloneBase == 0 {
		out.StandaloneBase = defaultFanoutStandaloneCorp
	}
	if out.SoloWeight <= 0 {
		out.SoloWeight = defaultTenantSoloWeight
	}
	if out.StandaloneCorpWeight <= 0 {
		out.StandaloneCorpWeight = defaultTenantStandWeight
	}
	if out.AllianceWeight <= 0 {
		out.AllianceWeight = defaultTenantAllWeight
	}
	if out.GrowCorpWeight <= 0 {
		out.GrowCorpWeight = defaultTenantGrowWeight
	}
	if out.OrphanWeight <= 0 {
		out.OrphanWeight = defaultTenantOrphanWeight
	}
	if out.SeedChunk <= 0 {
		out.SeedChunk = defaultTenantSeedChunk
	}
	return out
}

func newTenantRNG(seed int64) *rand.Rand {
	if seed == 0 {
		seed = time.Now().UnixNano()
	}
	return rand.New(rand.NewPCG(uint64(seed), uint64(seed)^0x9e3779b97f4a7c15))
}

// StartTenantGen invents solos/corps/alliances on genCh until Clients is reached (bootstrap),
// then optionally keeps emitting until ctx ends when Continuous is set.
// Each event is Redis-seeded (batched) before enqueue. Full genCh increments GenBlocked and waits.
// genCh is closed when the generator exits; errCh receives at most one terminal error (then closes).
func StartTenantGen(ctx context.Context, opts TenantGenOptions) (<-chan TenantEvent, *TenantGenStats, <-chan error) {
	opts = opts.withDefaults()
	genCh := make(chan TenantEvent, opts.BufSize)
	errCh := make(chan error, 1)
	stats := &TenantGenStats{}

	go func() {
		defer close(genCh)
		defer close(errCh)
		if err := runTenantGen(ctx, opts, genCh, stats); err != nil && ctx.Err() == nil {
			errCh <- err
		}
	}()
	return genCh, stats, errCh
}

func runTenantGen(ctx context.Context, opts TenantGenOptions, genCh chan<- TenantEvent, stats *TenantGenStats) error {
	if opts.CorpBase == opts.StandaloneBase {
		return fmt.Errorf("tenantGen: affiliated and standalone corp id bases must differ")
	}
	rng := newTenantRNG(opts.Seed)
	w := newTenantWorld(opts)

	ticker := time.NewTicker(opts.EmitEvery)
	defer ticker.Stop()

	emit := func(ev TenantEvent) error {
		if err := seedTenantBatch(ctx, opts, ev.Clients, stats); err != nil {
			return err
		}
		if err := sendTenantEvent(ctx, genCh, ev, stats); err != nil {
			return err
		}
		stats.Emitted.Add(1)
		stats.Clients.Store(uint64(w.clientCount()))
		return nil
	}

	waitTick := func() error {
		select {
		case <-ctx.Done():
			return ctx.Err()
		case <-ticker.C:
			return nil
		}
	}

	// Bootstrap a job-capable graph before weighted random growth.
	for _, kind := range []TenantEventKind{TenantSolo, TenantStandaloneCorp, TenantAlliance} {
		if w.clientCount() >= opts.Clients {
			break
		}
		if err := waitTick(); err != nil {
			return err
		}
		ev, ok := w.forceKind(rng, opts, kind)
		if !ok {
			continue
		}
		if err := emit(ev); err != nil {
			return err
		}
	}

	for w.clientCount() < opts.Clients {
		if err := waitTick(); err != nil {
			return err
		}
		ev, ok := w.nextEvent(rng, opts)
		if !ok {
			break
		}
		if err := emit(ev); err != nil {
			return err
		}
	}

	if !opts.Continuous {
		return nil
	}

	// Soft ongoing growth until MaxClients (0 = unbounded) or ctx ends.
	ticker.Reset(opts.ContinuousEvery)
	for {
		if opts.MaxClients > 0 && w.clientCount() >= opts.MaxClients {
			return nil
		}
		if err := waitTick(); err != nil {
			if ctx.Err() != nil {
				return nil // duration / cancel — normal end
			}
			return err
		}
		if opts.MaxClients > 0 && w.clientCount() >= opts.MaxClients {
			return nil
		}
		ev, ok := w.nextEventUnbounded(rng, opts)
		if !ok {
			continue
		}
		if opts.MaxClients > 0 && w.clientCount()+len(ev.Clients) > opts.MaxClients {
			continue
		}
		if err := emit(ev); err != nil {
			if ctx.Err() != nil {
				return nil
			}
			return err
		}
	}
}

func seedTenantBatch(ctx context.Context, opts TenantGenOptions, ids []clientIdentity, stats *TenantGenStats) error {
	if opts.NoSeed || len(ids) == 0 {
		return nil
	}
	chunk := opts.SeedChunk
	for start := 0; start < len(ids); start += chunk {
		end := start + chunk
		if end > len(ids) {
			end = len(ids)
		}
		batch := ids[start:end]
		stats.SeedCalls.Add(1)
		if opts.SeedFunc != nil {
			if err := opts.SeedFunc(ctx, batch); err != nil {
				return fmt.Errorf("tenantGen seed: %w", err)
			}
			continue
		}
		if opts.Redis == nil {
			return fmt.Errorf("tenantGen: redis required for seed (or set SeedFunc / NoSeed)")
		}
		if err := seedSessions(ctx, opts.Redis, batch); err != nil {
			return fmt.Errorf("tenantGen seed: %w", err)
		}
	}
	return nil
}

func sendTenantEvent(ctx context.Context, genCh chan<- TenantEvent, ev TenantEvent, stats *TenantGenStats) error {
	select {
	case <-ctx.Done():
		return ctx.Err()
	case genCh <- ev:
		return nil
	default:
		stats.GenBlocked.Add(1)
		select {
		case <-ctx.Done():
			return ctx.Err()
		case genCh <- ev:
			return nil
		}
	}
}

type tenantWorld struct {
	opts          TenantGenOptions
	next          int
	solo          []clientIdentity
	corps         []*fanoutCorp // pointers so grow survives appends
	alliances     []fanoutAlliance
	corpByID      map[int64]*fanoutCorp
	all           []clientIdentity
	standCorpIdx  int
	affCorpIdx    int
	allianceIdx   int
	growableCorps []int64
}

func newTenantWorld(opts TenantGenOptions) *tenantWorld {
	return &tenantWorld{
		opts:     opts,
		corpByID: map[int64]*fanoutCorp{},
	}
}

func (w *tenantWorld) clientCount() int { return len(w.all) }

func (w *tenantWorld) forceKind(rng *rand.Rand, opts TenantGenOptions, kind TenantEventKind) (TenantEvent, bool) {
	remain := opts.Clients - w.clientCount()
	if remain <= 0 {
		return TenantEvent{}, false
	}
	switch kind {
	case TenantSolo, TenantOrphan:
		return w.emitSolo(rng, opts, kind)
	case TenantStandaloneCorp:
		return w.emitStandalone(rng, opts)
	case TenantAlliance:
		return w.emitAlliance(rng, opts)
	case TenantGrowCorp:
		return w.emitGrow(rng, opts)
	default:
		return TenantEvent{}, false
	}
}

func (w *tenantWorld) nextEvent(rng *rand.Rand, opts TenantGenOptions) (TenantEvent, bool) {
	remain := opts.Clients - w.clientCount()
	if remain <= 0 {
		return TenantEvent{}, false
	}

	kind := w.pickKind(rng, remain)
	switch kind {
	case TenantSolo, TenantOrphan:
		return w.emitSolo(rng, opts, kind)

	case TenantStandaloneCorp:
		return w.emitStandalone(rng, opts)

	case TenantAlliance:
		return w.emitAlliance(rng, opts)

	case TenantGrowCorp:
		return w.emitGrow(rng, opts)
	}
	return TenantEvent{}, false
}

// nextEventUnbounded grows past the bootstrap Clients cap (continuous soak phase).
// Each call allows a small batch so corp/alliance events stay modest.
func (w *tenantWorld) nextEventUnbounded(rng *rand.Rand, opts TenantGenOptions) (TenantEvent, bool) {
	o := opts
	o.Clients = w.clientCount() + 32
	return w.nextEvent(rng, o)
}

func (w *tenantWorld) emitSolo(rng *rand.Rand, opts TenantGenOptions, kind TenantEventKind) (TenantEvent, bool) {
	if w.clientCount() >= opts.Clients {
		return TenantEvent{}, false
	}
	ids := w.addMembers(1, 0, 0, rng, opts)
	w.solo = append(w.solo, ids...)
	return TenantEvent{Kind: kind, Clients: ids}, true
}

func (w *tenantWorld) emitStandalone(rng *rand.Rand, opts TenantGenOptions) (TenantEvent, bool) {
	remain := opts.Clients - w.clientCount()
	if remain <= 0 {
		return TenantEvent{}, false
	}
	sz := min(pickSize(rng, []int{1, 2, 3, 5, 8, 4, 6}), remain)
	if sz < 1 {
		return TenantEvent{}, false
	}
	w.standCorpIdx++
	corpID := opts.StandaloneBase + int64(w.standCorpIdx)
	ids := w.addMembers(sz, corpID, 0, rng, opts)
	corp := &fanoutCorp{ID: corpID, AllianceID: 0, Members: append([]clientIdentity{}, ids...)}
	w.corps = append(w.corps, corp)
	w.corpByID[corpID] = corp
	w.growableCorps = append(w.growableCorps, corpID)
	return TenantEvent{
		Kind:    TenantStandaloneCorp,
		Clients: ids,
		CorpID:  corpID,
		Corps:   []fanoutCorp{{ID: corp.ID, AllianceID: 0, Members: append([]clientIdentity{}, ids...)}},
	}, true
}

func (w *tenantWorld) emitAlliance(rng *rand.Rand, opts TenantGenOptions) (TenantEvent, bool) {
	remain := opts.Clients - w.clientCount()
	if remain < 2 {
		return w.emitSolo(rng, opts, TenantSolo)
	}
	w.allianceIdx++
	allID := opts.AllianceBase + int64(w.allianceIdx)
	corpCount := 2 + rng.IntN(2) // 2–3
	budget := remain
	var newCorps []fanoutCorp
	var allClients []clientIdentity
	a := fanoutAlliance{ID: allID}
	for ci := 0; ci < corpCount && budget > 0; ci++ {
		sz := min(pickSize(rng, []int{2, 3, 4, 6, 5}), budget)
		if sz < 1 {
			break
		}
		if ci < corpCount-1 && budget-sz < 1 {
			sz = budget - 1
			if sz < 1 {
				sz = budget
			}
		}
		w.affCorpIdx++
		corpID := opts.CorpBase + int64(w.affCorpIdx)
		ids := w.addMembers(sz, corpID, allID, rng, opts)
		corp := &fanoutCorp{ID: corpID, AllianceID: allID, Members: append([]clientIdentity{}, ids...)}
		w.corps = append(w.corps, corp)
		w.corpByID[corpID] = corp
		w.growableCorps = append(w.growableCorps, corpID)
		a.Corps = append(a.Corps, corpID)
		newCorps = append(newCorps, fanoutCorp{ID: corp.ID, AllianceID: allID, Members: append([]clientIdentity{}, ids...)})
		allClients = append(allClients, ids...)
		budget -= sz
	}
	if len(a.Corps) == 0 {
		return w.emitSolo(rng, opts, TenantSolo)
	}
	w.alliances = append(w.alliances, a)
	return TenantEvent{
		Kind:       TenantAlliance,
		Clients:    allClients,
		AllianceID: allID,
		Corps:      newCorps,
		Alliance:   &a,
	}, true
}

func (w *tenantWorld) emitGrow(rng *rand.Rand, opts TenantGenOptions) (TenantEvent, bool) {
	remain := opts.Clients - w.clientCount()
	if remain <= 0 {
		return TenantEvent{}, false
	}
	if len(w.growableCorps) == 0 {
		return w.emitSolo(rng, opts, TenantSolo)
	}
	corpID := w.growableCorps[rng.IntN(len(w.growableCorps))]
	c := w.corpByID[corpID]
	if c == nil {
		return w.emitSolo(rng, opts, TenantSolo)
	}
	sz := min(1+rng.IntN(3), remain)
	ids := w.addMembers(sz, c.ID, c.AllianceID, rng, opts)
	c.Members = append(c.Members, ids...)
	return TenantEvent{
		Kind:       TenantGrowCorp,
		Clients:    ids,
		CorpID:     c.ID,
		AllianceID: c.AllianceID,
		Corps:      []fanoutCorp{{ID: c.ID, AllianceID: c.AllianceID, Members: append([]clientIdentity{}, ids...)}},
	}, true
}

func (w *tenantWorld) pickKind(rng *rand.Rand, remain int) TenantEventKind {
	type choice struct {
		kind   TenantEventKind
		weight int
	}
	choices := []choice{
		{TenantSolo, w.opts.SoloWeight},
		{TenantOrphan, w.opts.OrphanWeight},
		{TenantStandaloneCorp, w.opts.StandaloneCorpWeight},
		{TenantGrowCorp, w.opts.GrowCorpWeight},
		{TenantAlliance, w.opts.AllianceWeight},
	}
	// Early graph needs structure before grow is useful.
	if len(w.growableCorps) == 0 {
		for i := range choices {
			if choices[i].kind == TenantGrowCorp {
				choices[i].weight = 0
			}
		}
	}
	if remain < 2 {
		return TenantSolo
	}
	total := 0
	for _, c := range choices {
		total += c.weight
	}
	if total <= 0 {
		return TenantSolo
	}
	pick := rng.IntN(total)
	for _, c := range choices {
		if c.weight <= 0 {
			continue
		}
		if pick < c.weight {
			return c.kind
		}
		pick -= c.weight
	}
	return TenantSolo
}

func (w *tenantWorld) addMembers(n int, corpID, allID int64, rng *rand.Rand, opts TenantGenOptions) []clientIdentity {
	out := make([]clientIdentity, 0, n)
	for i := 0; i < n; i++ {
		w.next++
		acct := fmt.Sprintf("soak-fanout-acct-%d", w.next)
		id := clientIdentity{
			Index:      w.next - 1,
			AccountID:  acct,
			SessionID:  fmt.Sprintf("soak-fanout-sess-%d", w.next),
			CorpID:     corpID,
			AllianceID: allID,
			Affinity:   wsplacement.TenantKeyAccount(acct),
			Cohort:     cohortGroup,
		}
		if corpID != 0 || allID != 0 {
			id.Affinity = pickOrgAffinity(rng, opts.AffinityMix, acct, corpID, allID)
		}
		out = append(out, id)
		w.all = append(w.all, id)
	}
	return out
}

func pickOrgAffinity(rng *rand.Rand, mix float64, accountID string, corpID, allID int64) string {
	if mix <= 0 || rng.Float64() >= mix {
		return wsplacement.TenantKeyAccount(accountID)
	}
	if allID != 0 && rng.IntN(2) == 0 {
		return wsplacement.TenantKeyAlliance(AllianceRef(allID))
	}
	if corpID != 0 {
		return wsplacement.TenantKeyCorporation(CorporationRef(corpID))
	}
	if allID != 0 {
		return wsplacement.TenantKeyAlliance(AllianceRef(allID))
	}
	return wsplacement.TenantKeyAccount(accountID)
}

func pickSize(rng *rand.Rand, sizes []int) int {
	if len(sizes) == 0 {
		return 1
	}
	return sizes[rng.IntN(len(sizes))]
}

// TopologyFromEvents merges streamed events into a fanoutTopology for job builders / static connect.
func TopologyFromEvents(events []TenantEvent) (fanoutTopology, error) {
	corpByID := map[int64]*fanoutCorp{}
	var corpOrder []int64
	var alliances []fanoutAlliance
	seenAlliance := map[int64]bool{}
	var all, solo []clientIdentity

	for _, ev := range events {
		for _, id := range ev.Clients {
			all = append(all, id)
			if id.CorpID == 0 && id.AllianceID == 0 {
				solo = append(solo, id)
			}
		}
		for _, c := range ev.Corps {
			if existing := corpByID[c.ID]; existing != nil {
				existing.Members = append(existing.Members, c.Members...)
				continue
			}
			cp := &fanoutCorp{ID: c.ID, AllianceID: c.AllianceID, Members: append([]clientIdentity{}, c.Members...)}
			corpByID[c.ID] = cp
			corpOrder = append(corpOrder, c.ID)
		}
		if ev.Alliance != nil && !seenAlliance[ev.Alliance.ID] {
			seenAlliance[ev.Alliance.ID] = true
			alliances = append(alliances, *ev.Alliance)
		}
	}

	topo := fanoutTopology{
		Solo:      solo,
		Alliances: alliances,
		All:       all,
		corpByID:  map[int64]*fanoutCorp{},
	}
	for _, id := range corpOrder {
		c := corpByID[id]
		topo.Corps = append(topo.Corps, *c)
	}
	topo.reindexCorps()
	if len(topo.All) == 0 {
		return fanoutTopology{}, fmt.Errorf("tenantGen: empty topology")
	}
	return topo, nil
}

// CollectTenantGen drains genCh and builds a topology (for tests / Phase-3 static fanout wiring).
func CollectTenantGen(ctx context.Context, opts TenantGenOptions) (fanoutTopology, *TenantGenStats, error) {
	genCh, stats, errCh := StartTenantGen(ctx, opts)
	var events []TenantEvent
	for ev := range genCh {
		events = append(events, ev)
	}
	if err := <-errCh; err != nil {
		return fanoutTopology{}, stats, err
	}
	if err := ctx.Err(); err != nil && len(events) == 0 {
		return fanoutTopology{}, stats, err
	}
	topo, err := TopologyFromEvents(events)
	return topo, stats, err
}
