package soaklib

import (
	"fmt"
	"sort"
	"strings"
	"sync"
	"sync/atomic"
	"time"
)

const (
	defaultDeliveryRecvBuf = 8192
	maxWrongSamples        = 20
	maxPendingDumpLines    = 50
	// Keep completed pubs briefly so late/dup still classify, then drop to bound memory/CPU.
	completedPendGrace = 3 * time.Second
)

// pendingGap is one incomplete expect for dump diagnostics.
type pendingGap struct {
	DocID   string
	Kind    fanoutMsgKind
	Missing []string
	Got     []string
	Expect  []string
}

// deliveryRecv is one doc.update observation from a WS client.
type deliveryRecv struct {
	DocID     string
	AccountID string
}

// wrongSample is a bounded diagnostic for unexpected recipients.
type wrongSample struct {
	DocID     string
	Kind      fanoutMsgKind
	Got       string
	Expect    []string
}

type kindDeliveryCounters struct {
	Pubs   atomic.Uint64
	Expect atomic.Uint64
	Recv   atomic.Uint64
	Wrong  atomic.Uint64
	Dup    atomic.Uint64
	Late   atomic.Uint64
}

// deliveryTracker correlates stamped pubs to exact account recipients.
type deliveryTracker struct {
	Pubs       atomic.Uint64
	Expect     atomic.Uint64
	Recv       atomic.Uint64
	Wrong      atomic.Uint64
	Dup        atomic.Uint64
	Late       atomic.Uint64
	OfflineHit atomic.Uint64
	RecvDrop   atomic.Uint64

	latencySumUs atomic.Uint64
	latencyMaxUs atomic.Uint64
	latencyN     atomic.Uint64

	pending sync.Map // docID → *deliveryPend
	openPend atomic.Int64

	// acctOpen counts open (incomplete) expects still naming an account — leave waits use this.
	acctMu   sync.Mutex
	acctOpen map[string]int

	kindMu sync.Mutex
	byKind map[fanoutMsgKind]*kindDeliveryCounters

	sampleMu sync.Mutex
	samples  []wrongSample

	recvCh chan deliveryRecv
	stop   chan struct{}
	wg     sync.WaitGroup
	once   sync.Once
}

type deliveryPend struct {
	mu       sync.Mutex
	kind     fanoutMsgKind
	expect   map[string]struct{}
	got      map[string]struct{}
	sentNs   int64
	latched  bool
	complete bool // keep around so post-complete dup/wrong classify (not late)
}

func newDeliveryTracker(buf int) *deliveryTracker {
	if buf < 64 {
		buf = defaultDeliveryRecvBuf
	}
	t := &deliveryTracker{
		byKind:   map[fanoutMsgKind]*kindDeliveryCounters{},
		acctOpen: map[string]int{},
		recvCh:   make(chan deliveryRecv, buf),
		stop:     make(chan struct{}),
	}
	for _, k := range []fanoutMsgKind{
		fanoutMsgAccount, fanoutMsgCorpFull, fanoutMsgCorpDownAccount,
		fanoutMsgAllianceFull, fanoutMsgAllianceDownCorp, fanoutMsgAllianceDownAccount,
	} {
		t.byKind[k] = &kindDeliveryCounters{}
	}
	return t
}

func (t *deliveryTracker) addAcctOpen(accounts map[string]struct{}) {
	if t == nil || len(accounts) == 0 {
		return
	}
	t.acctMu.Lock()
	for a := range accounts {
		t.acctOpen[a]++
	}
	t.acctMu.Unlock()
}

func (t *deliveryTracker) decAcctOpen(accountID string) {
	if t == nil || accountID == "" {
		return
	}
	t.acctMu.Lock()
	n := t.acctOpen[accountID] - 1
	if n <= 0 {
		delete(t.acctOpen, accountID)
	} else {
		t.acctOpen[accountID] = n
	}
	t.acctMu.Unlock()
}

// Start runs the recv ingress goroutine.
func (t *deliveryTracker) Start() {
	if t == nil {
		return
	}
	t.wg.Add(1)
	go func() {
		defer t.wg.Done()
		for {
			select {
			case <-t.stop:
				for {
					select {
					case ev := <-t.recvCh:
						t.trackRecv(ev.DocID, ev.AccountID)
					default:
						return
					}
				}
			case ev, ok := <-t.recvCh:
				if !ok {
					return
				}
				t.trackRecv(ev.DocID, ev.AccountID)
			}
		}
	}()
}

// Close stops ingress and drains the recv channel.
func (t *deliveryTracker) Close() {
	if t == nil {
		return
	}
	t.once.Do(func() {
		close(t.stop)
		t.wg.Wait()
	})
}

// OfferRecv enqueues a client observation without blocking the WS read loop.
func (t *deliveryTracker) OfferRecv(docID, accountID string) {
	if t == nil {
		return
	}
	docID = strings.TrimSpace(docID)
	accountID = strings.TrimSpace(accountID)
	if docID == "" || accountID == "" {
		return
	}
	select {
	case t.recvCh <- deliveryRecv{DocID: docID, AccountID: accountID}:
	default:
		t.RecvDrop.Add(1)
	}
}

// TrackPub registers expected account recipients for a stamped doc.
func (t *deliveryTracker) TrackPub(docID string, kind fanoutMsgKind, expectAccounts []string) {
	if t == nil {
		return
	}
	docID = strings.TrimSpace(docID)
	if docID == "" {
		return
	}
	expect := map[string]struct{}{}
	for _, a := range expectAccounts {
		a = strings.TrimSpace(a)
		if a != "" {
			expect[a] = struct{}{}
		}
	}
	if len(expect) == 0 {
		return
	}
	t.pending.Store(docID, &deliveryPend{
		kind:   kind,
		expect: expect,
		got:    map[string]struct{}{},
		sentNs: time.Now().UnixNano(),
	})
	t.openPend.Add(1)
	t.addAcctOpen(expect)
	n := uint64(len(expect))
	t.Pubs.Add(1)
	t.Expect.Add(n)
	kc := t.kindCounters(kind)
	kc.Pubs.Add(1)
	kc.Expect.Add(n)
}

func (t *deliveryTracker) trackRecv(docID, accountID string) {
	raw, ok := t.pending.Load(docID)
	if !ok {
		t.Late.Add(1)
		return
	}
	p, _ := raw.(*deliveryPend)
	if p == nil {
		t.Late.Add(1)
		return
	}
	p.mu.Lock()
	defer p.mu.Unlock()
	kc := t.kindCounters(p.kind)

	if _, want := p.expect[accountID]; !want {
		t.Wrong.Add(1)
		t.OfflineHit.Add(1)
		kc.Wrong.Add(1)
		t.addWrongSample(docID, p.kind, accountID, p.expect)
		return
	}
	if _, already := p.got[accountID]; already {
		t.Dup.Add(1)
		kc.Dup.Add(1)
		return
	}
	if p.complete {
		// Expect set already satisfied; further expected accounts shouldn't happen,
		// but treat as dup-ish over-delivery on a closed set.
		t.Dup.Add(1)
		kc.Dup.Add(1)
		return
	}
	p.got[accountID] = struct{}{}
	t.Recv.Add(1)
	kc.Recv.Add(1)
	t.decAcctOpen(accountID)

	if !p.latched {
		p.latched = true
		if p.sentNs > 0 {
			lat := uint64(time.Now().UnixNano() - p.sentNs)
			if lat <= uint64(time.Hour) {
				us := lat / uint64(time.Microsecond)
				t.latencySumUs.Add(us)
				t.latencyN.Add(1)
				for {
					cur := t.latencyMaxUs.Load()
					if us <= cur || t.latencyMaxUs.CompareAndSwap(cur, us) {
						break
					}
				}
			}
		}
	}
	if len(p.got) >= len(p.expect) {
		p.complete = true
		t.openPend.Add(-1)
		go t.pruneCompleted(docID, completedPendGrace)
	}
}

func (t *deliveryTracker) pruneCompleted(docID string, grace time.Duration) {
	if t == nil || docID == "" {
		return
	}
	timer := time.NewTimer(grace)
	defer timer.Stop()
	select {
	case <-t.stop:
		return
	case <-timer.C:
	}
	raw, ok := t.pending.Load(docID)
	if !ok {
		return
	}
	p, _ := raw.(*deliveryPend)
	if p == nil {
		return
	}
	p.mu.Lock()
	done := p.complete
	p.mu.Unlock()
	if done {
		t.pending.Delete(docID)
	}
}

func (t *deliveryTracker) kindCounters(kind fanoutMsgKind) *kindDeliveryCounters {
	t.kindMu.Lock()
	defer t.kindMu.Unlock()
	if t.byKind == nil {
		t.byKind = map[fanoutMsgKind]*kindDeliveryCounters{}
	}
	kc := t.byKind[kind]
	if kc == nil {
		kc = &kindDeliveryCounters{}
		t.byKind[kind] = kc
	}
	return kc
}

func (t *deliveryTracker) addWrongSample(docID string, kind fanoutMsgKind, got string, expect map[string]struct{}) {
	t.sampleMu.Lock()
	defer t.sampleMu.Unlock()
	if len(t.samples) >= maxWrongSamples {
		return
	}
	ids := make([]string, 0, len(expect))
	for a := range expect {
		ids = append(ids, a)
	}
	sort.Strings(ids)
	t.samples = append(t.samples, wrongSample{DocID: docID, Kind: kind, Got: got, Expect: ids})
}

// Reset clears pubs/expects/pending (e.g. after warmup) but keeps the ingress goroutine.
func (t *deliveryTracker) Reset() {
	if t == nil {
		return
	}
	t.Pubs.Store(0)
	t.Expect.Store(0)
	t.Recv.Store(0)
	t.Wrong.Store(0)
	t.Dup.Store(0)
	t.Late.Store(0)
	t.OfflineHit.Store(0)
	t.RecvDrop.Store(0)
	t.latencySumUs.Store(0)
	t.latencyMaxUs.Store(0)
	t.latencyN.Store(0)
	t.pending.Range(func(k, _ any) bool {
		t.pending.Delete(k)
		return true
	})
	t.openPend.Store(0)
	t.acctMu.Lock()
	t.acctOpen = map[string]int{}
	t.acctMu.Unlock()
	t.kindMu.Lock()
	t.byKind = map[fanoutMsgKind]*kindDeliveryCounters{}
	for _, k := range []fanoutMsgKind{
		fanoutMsgAccount, fanoutMsgCorpFull, fanoutMsgCorpDownAccount,
		fanoutMsgAllianceFull, fanoutMsgAllianceDownCorp, fanoutMsgAllianceDownAccount,
	} {
		t.byKind[k] = &kindDeliveryCounters{}
	}
	t.kindMu.Unlock()
	t.sampleMu.Lock()
	t.samples = nil
	t.sampleMu.Unlock()
}

func (t *deliveryTracker) PendingCount() int {
	if t == nil {
		return 0
	}
	n := t.openPend.Load()
	if n < 0 {
		return 0
	}
	return int(n)
}

// PendingGaps returns incomplete expects with missing/got/expect account sets (sorted).
func (t *deliveryTracker) PendingGaps() []pendingGap {
	if t == nil {
		return nil
	}
	var out []pendingGap
	t.pending.Range(func(k, v any) bool {
		docID, _ := k.(string)
		p, _ := v.(*deliveryPend)
		if p == nil || docID == "" {
			return true
		}
		p.mu.Lock()
		done := p.complete
		kind := p.kind
		expect := make([]string, 0, len(p.expect))
		got := make([]string, 0, len(p.got))
		missing := make([]string, 0)
		if !done {
			for a := range p.expect {
				expect = append(expect, a)
				if _, ok := p.got[a]; ok {
					got = append(got, a)
				} else {
					missing = append(missing, a)
				}
			}
			for a := range p.got {
				if _, ok := p.expect[a]; !ok {
					got = append(got, a)
				}
			}
		}
		p.mu.Unlock()
		if done || len(missing) == 0 {
			return true
		}
		sort.Strings(expect)
		sort.Strings(got)
		sort.Strings(missing)
		out = append(out, pendingGap{
			DocID:   docID,
			Kind:    kind,
			Missing: missing,
			Got:     got,
			Expect:  expect,
		})
		return true
	})
	sort.Slice(out, func(i, j int) bool {
		if out[i].Kind != out[j].Kind {
			return out[i].Kind < out[j].Kind
		}
		return out[i].DocID < out[j].DocID
	})
	return out
}

// FormatPendingDump prints incomplete expects for log diffing (capped).
func (t *deliveryTracker) FormatPendingDump() string {
	gaps := t.PendingGaps()
	if len(gaps) == 0 {
		return "fanout pending dump: (none)"
	}
	var b strings.Builder
	fmt.Fprintf(&b, "fanout pending dump (%d):", len(gaps))
	limit := len(gaps)
	if limit > maxPendingDumpLines {
		limit = maxPendingDumpLines
	}
	for i := 0; i < limit; i++ {
		g := gaps[i]
		fmt.Fprintf(&b, "\n  doc=%s kind=%s missing=%v got=%v expect=%v",
			g.DocID, g.Kind, g.Missing, g.Got, g.Expect)
	}
	if len(gaps) > limit {
		fmt.Fprintf(&b, "\n  … %d more", len(gaps)-limit)
	}
	return b.String()
}

// HasPendingAccount reports whether any open expect still names accountID (for leave waits).
func (t *deliveryTracker) HasPendingAccount(accountID string) bool {
	accountID = strings.TrimSpace(accountID)
	if t == nil || accountID == "" {
		return false
	}
	t.acctMu.Lock()
	n := t.acctOpen[accountID]
	t.acctMu.Unlock()
	return n > 0
}

func (t *deliveryTracker) AvgLatency() string {
	if t == nil {
		return "(none)"
	}
	n := t.latencyN.Load()
	if n == 0 {
		return "(none)"
	}
	avg := time.Duration(t.latencySumUs.Load()/n) * time.Microsecond
	max := time.Duration(t.latencyMaxUs.Load()) * time.Microsecond
	return fmt.Sprintf("avg=%s max=%s", avg.Truncate(time.Microsecond), max.Truncate(time.Microsecond))
}

func (t *deliveryTracker) ReportLine() string {
	if t == nil {
		return "fanout: (no tracker)"
	}
	return fmt.Sprintf("fanout: pubs=%d expect=%d recv=%d wrong=%d dup=%d late=%d offline_hit=%d drop=%d pending=%d latency=%s",
		t.Pubs.Load(), t.Expect.Load(), t.Recv.Load(), t.Wrong.Load(), t.Dup.Load(), t.Late.Load(),
		t.OfflineHit.Load(), t.RecvDrop.Load(), t.PendingCount(), t.AvgLatency())
}

func (t *deliveryTracker) KindReportLine() string {
	if t == nil {
		return ""
	}
	t.kindMu.Lock()
	kinds := make([]fanoutMsgKind, 0, len(t.byKind))
	for k := range t.byKind {
		kinds = append(kinds, k)
	}
	t.kindMu.Unlock()
	sort.Slice(kinds, func(i, j int) bool { return kinds[i] < kinds[j] })
	parts := make([]string, 0, len(kinds))
	for _, k := range kinds {
		kc := t.kindCounters(k)
		parts = append(parts, fmt.Sprintf("%s(p=%d e=%d r=%d w=%d)",
			k, kc.Pubs.Load(), kc.Expect.Load(), kc.Recv.Load(), kc.Wrong.Load()))
	}
	if len(parts) == 0 {
		return "fanout_kinds: (none)"
	}
	return "fanout_kinds: " + strings.Join(parts, " ")
}

func (t *deliveryTracker) WrongSamples() []wrongSample {
	if t == nil {
		return nil
	}
	t.sampleMu.Lock()
	defer t.sampleMu.Unlock()
	out := make([]wrongSample, len(t.samples))
	copy(out, t.samples)
	return out
}

func (t *deliveryTracker) formatWrongSamples() string {
	samples := t.WrongSamples()
	if len(samples) == 0 {
		return ""
	}
	parts := make([]string, 0, len(samples))
	for _, s := range samples {
		parts = append(parts, fmt.Sprintf("%s kind=%s got=%s expect=%v", s.DocID, s.Kind, s.Got, s.Expect))
	}
	return strings.Join(parts, "; ")
}

// AssertExact returns an error if delivery was not exact (wrong/dup/offline or incomplete).
func (t *deliveryTracker) AssertExact(maxLoss float64) error {
	if t == nil {
		return fmt.Errorf("fanout: no delivery tracker")
	}
	got := t.Recv.Load()
	want := t.Expect.Load()
	if want == 0 {
		return fmt.Errorf("fanout: nothing expected")
	}
	if t.Wrong.Load() > 0 || t.Dup.Load() > 0 || t.OfflineHit.Load() > 0 {
		msg := fmt.Sprintf("fanout exact fail: wrong=%d dup=%d offline_hit=%d late=%d recv=%d/%d pending=%d",
			t.Wrong.Load(), t.Dup.Load(), t.OfflineHit.Load(), t.Late.Load(), got, want, t.PendingCount())
		if s := t.formatWrongSamples(); s != "" {
			msg += " samples=[" + s + "]"
		}
		return fmt.Errorf("%s", msg)
	}
	loss := 1.0 - float64(got)/float64(want)
	if loss < 0 {
		loss = 0
	}
	if loss > maxLoss {
		return fmt.Errorf("fanout loss %.3f exceeds max %.3f (recv=%d expect=%d late=%d pending=%d)",
			loss, maxLoss, got, want, t.Late.Load(), t.PendingCount())
	}
	return nil
}
