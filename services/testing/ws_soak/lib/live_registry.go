package soaklib

import (
	"fmt"
	"strings"
	"sync"
	"time"
)

// DefaultReadySettle matches websocket FilterSubjects debounce headroom.
const DefaultReadySettle = 150 * time.Millisecond

// liveRegistry tracks which soak accounts are connected and filter-ready.
type liveRegistry struct {
	mu     sync.RWMutex
	byAcct map[string]*liveEntry
	gens   map[string]uint64 // monotonic per account across reconnects
	settle time.Duration
}

type liveEntry struct {
	id      clientIdentity
	live    bool
	ready   bool
	gen     uint64        // bumps on each MarkLive so stale settle timers cannot early-ready
	readyCh chan struct{} // closed when ready (or dead)
}

// liveSnapshot is a read-only view for publishers.
type liveSnapshot struct {
	ReadyAccounts []string
	ReadySolos    []string
	ReadyByCorp   map[int64][]string
	ReadyByAll    map[int64][]string
	CorpAlliance  map[int64]int64 // ready corpID → allianceID (0 = standalone)
	ReadySet      map[string]struct{}
	LiveCount     int
	ReadyCount    int
}

func newLiveRegistry(settle time.Duration) *liveRegistry {
	if settle <= 0 {
		settle = DefaultReadySettle
	}
	return &liveRegistry{
		byAcct: map[string]*liveEntry{},
		gens:   map[string]uint64{},
		settle: settle,
	}
}

// MarkLive records a connected (+ scoped when org) identity. Caller schedules Ready later.
func (r *liveRegistry) MarkLive(id clientIdentity) {
	if r == nil {
		return
	}
	acct := strings.TrimSpace(id.AccountID)
	if acct == "" {
		return
	}
	r.mu.Lock()
	defer r.mu.Unlock()
	if prev := r.byAcct[acct]; prev != nil {
		if prev.readyCh != nil {
			select {
			case <-prev.readyCh:
			default:
				close(prev.readyCh)
			}
		}
	}
	r.gens[acct]++
	gen := r.gens[acct]
	r.byAcct[acct] = &liveEntry{
		id:      id,
		live:    true,
		ready:   false,
		gen:     gen,
		readyCh: make(chan struct{}),
	}
}

// ScheduleReady marks the account ready after settle, unless Unregister/MarkLive wins first.
func (r *liveRegistry) ScheduleReady(accountID string) {
	if r == nil {
		return
	}
	accountID = strings.TrimSpace(accountID)
	if accountID == "" {
		return
	}
	r.mu.Lock()
	e := r.byAcct[accountID]
	if e == nil || !e.live {
		r.mu.Unlock()
		return
	}
	gen := e.gen
	settle := r.settle
	r.mu.Unlock()

	go func() {
		timer := time.NewTimer(settle)
		defer timer.Stop()
		<-timer.C
		r.mu.Lock()
		defer r.mu.Unlock()
		e := r.byAcct[accountID]
		if e == nil || !e.live || e.ready || e.gen != gen {
			return
		}
		e.ready = true
		if e.readyCh != nil {
			select {
			case <-e.readyCh:
			default:
				close(e.readyCh)
			}
		}
	}()
}

// Unregister removes an account (disconnect).
func (r *liveRegistry) Unregister(accountID string) {
	if r == nil {
		return
	}
	accountID = strings.TrimSpace(accountID)
	if accountID == "" {
		return
	}
	r.mu.Lock()
	defer r.mu.Unlock()
	e := r.byAcct[accountID]
	if e == nil {
		return
	}
	if e.readyCh != nil {
		select {
		case <-e.readyCh:
		default:
			close(e.readyCh)
		}
	}
	delete(r.byAcct, accountID)
}

func (r *liveRegistry) IsReady(accountID string) bool {
	if r == nil {
		return false
	}
	r.mu.RLock()
	defer r.mu.RUnlock()
	e := r.byAcct[strings.TrimSpace(accountID)]
	return e != nil && e.live && e.ready
}

func (r *liveRegistry) IsLive(accountID string) bool {
	if r == nil {
		return false
	}
	r.mu.RLock()
	defer r.mu.RUnlock()
	e := r.byAcct[strings.TrimSpace(accountID)]
	return e != nil && e.live
}

func (r *liveRegistry) ReadyCount() int {
	if r == nil {
		return 0
	}
	r.mu.RLock()
	defer r.mu.RUnlock()
	n := 0
	for _, e := range r.byAcct {
		if e.live && e.ready {
			n++
		}
	}
	return n
}

func (r *liveRegistry) LiveCount() int {
	if r == nil {
		return 0
	}
	r.mu.RLock()
	defer r.mu.RUnlock()
	n := 0
	for _, e := range r.byAcct {
		if e.live {
			n++
		}
	}
	return n
}

// FilterReady returns the subset of accounts that are currently live+ready.
func (r *liveRegistry) FilterReady(accounts []string) []string {
	return r.filterAccounts(accounts, true)
}

// FilterLive returns the subset of accounts that are currently live (may still be settling).
func (r *liveRegistry) FilterLive(accounts []string) []string {
	return r.filterAccounts(accounts, false)
}

func (r *liveRegistry) filterAccounts(accounts []string, requireReady bool) []string {
	if r == nil || len(accounts) == 0 {
		return nil
	}
	r.mu.RLock()
	defer r.mu.RUnlock()
	out := make([]string, 0, len(accounts))
	for _, a := range accounts {
		a = strings.TrimSpace(a)
		e := r.byAcct[a]
		if e == nil || !e.live {
			continue
		}
		if requireReady && !e.ready {
			continue
		}
		out = append(out, a)
	}
	return out
}

// ReadyCorpMembers returns ready accounts with CorpID == corpID.
func (r *liveRegistry) ReadyCorpMembers(corpID int64) []string {
	return r.corpMembers(corpID, true)
}

// LiveCorpMembers returns live accounts with CorpID == corpID (includes settle window).
func (r *liveRegistry) LiveCorpMembers(corpID int64) []string {
	return r.corpMembers(corpID, false)
}

func (r *liveRegistry) corpMembers(corpID int64, requireReady bool) []string {
	if r == nil || corpID == 0 {
		return nil
	}
	r.mu.RLock()
	defer r.mu.RUnlock()
	var out []string
	for _, e := range r.byAcct {
		if !e.live || e.id.CorpID != corpID {
			continue
		}
		if requireReady && !e.ready {
			continue
		}
		out = append(out, e.id.AccountID)
	}
	return out
}

// ReadyAllianceMembers returns ready accounts with AllianceID == allianceID.
func (r *liveRegistry) ReadyAllianceMembers(allianceID int64) []string {
	return r.allianceMembers(allianceID, true)
}

// LiveAllianceMembers returns live accounts with AllianceID == allianceID.
func (r *liveRegistry) LiveAllianceMembers(allianceID int64) []string {
	return r.allianceMembers(allianceID, false)
}

func (r *liveRegistry) allianceMembers(allianceID int64, requireReady bool) []string {
	if r == nil || allianceID == 0 {
		return nil
	}
	r.mu.RLock()
	defer r.mu.RUnlock()
	var out []string
	for _, e := range r.byAcct {
		if !e.live || e.id.AllianceID != allianceID {
			continue
		}
		if requireReady && !e.ready {
			continue
		}
		out = append(out, e.id.AccountID)
	}
	return out
}

// Snapshot builds a publisher-friendly view.
func (r *liveRegistry) Snapshot() liveSnapshot {
	out := liveSnapshot{
		ReadyByCorp:  map[int64][]string{},
		ReadyByAll:   map[int64][]string{},
		CorpAlliance: map[int64]int64{},
		ReadySet:     map[string]struct{}{},
	}
	if r == nil {
		return out
	}
	r.mu.RLock()
	defer r.mu.RUnlock()
	for _, e := range r.byAcct {
		if !e.live {
			continue
		}
		out.LiveCount++
		if !e.ready {
			continue
		}
		out.ReadyCount++
		aid := e.id.AccountID
		out.ReadyAccounts = append(out.ReadyAccounts, aid)
		out.ReadySet[aid] = struct{}{}
		if e.id.CorpID == 0 && e.id.AllianceID == 0 {
			out.ReadySolos = append(out.ReadySolos, aid)
		}
		if e.id.CorpID != 0 {
			out.ReadyByCorp[e.id.CorpID] = append(out.ReadyByCorp[e.id.CorpID], aid)
			out.CorpAlliance[e.id.CorpID] = e.id.AllianceID
		}
		if e.id.AllianceID != 0 {
			out.ReadyByAll[e.id.AllianceID] = append(out.ReadyByAll[e.id.AllianceID], aid)
		}
	}
	return out
}

func (r *liveRegistry) summary() string {
	if r == nil {
		return "live=0 ready=0"
	}
	return fmt.Sprintf("live=%d ready=%d", r.LiveCount(), r.ReadyCount())
}

// resolveJobExpects returns ready recipients for a job (post FilterSubjects settle).
// Live-but-settling joins are excluded: selective fan-out has a known widen gap (~100ms debounce + DeliverNew).
func resolveJobExpects(reg *liveRegistry, job fanoutJob) []string {
	if reg == nil {
		return append([]string{}, job.ExpectAccounts...)
	}
	return resolveJobExpectsFromSnap(reg.Snapshot(), job)
}

// resolveJobExpectsFromSnap uses a publisher snapshot (no second registry walk).
func resolveJobExpectsFromSnap(snap liveSnapshot, job fanoutJob) []string {
	filterReady := func(ids []string) []string {
		if len(ids) == 0 || snap.ReadySet == nil {
			return nil
		}
		var out []string
		for _, a := range ids {
			if _, ok := snap.ReadySet[a]; ok {
				out = append(out, a)
			}
		}
		return out
	}
	switch job.Kind {
	case fanoutMsgAccount:
		if _, ok := snap.ReadySet[job.AccountID]; ok {
			return []string{job.AccountID}
		}
		return nil
	case fanoutMsgCorpFull:
		corp := parseInt64ID(job.CorporationID)
		return append([]string{}, snap.ReadyByCorp[corp]...)
	case fanoutMsgCorpDownAccount:
		return filterReady(job.ScopeAccountIDs)
	case fanoutMsgAllianceFull:
		all := parseInt64ID(job.AllianceID)
		return append([]string{}, snap.ReadyByAll[all]...)
	case fanoutMsgAllianceDownCorp:
		if len(job.ScopeCorporationIDs) == 0 {
			return nil
		}
		corp := parseInt64ID(job.ScopeCorporationIDs[0])
		return append([]string{}, snap.ReadyByCorp[corp]...)
	case fanoutMsgAllianceDownAccount:
		return filterReady(job.ScopeAccountIDs)
	default:
		return filterReady(job.ExpectAccounts)
	}
}

func parseInt64ID(s string) int64 {
	s = strings.TrimSpace(s)
	var n int64
	for _, c := range s {
		if c < '0' || c > '9' {
			return 0
		}
		n = n*10 + int64(c-'0')
	}
	return n
}
