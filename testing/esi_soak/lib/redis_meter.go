package esisoak

import (
	"context"
	"maps"
	"sort"
	"strings"
	"sync"
	"sync/atomic"

	"github.com/redis/go-redis/v9"
)

// RedisMeter counts commands actually sent to Redis. Coordination is the cost
// the shared clock buys, so it is worth knowing what a call costs in round
// trips as well as in tokens.
type RedisMeter struct {
	commands atomic.Int64

	mu    sync.Mutex
	names map[string]int64
}

// NewRedisMeter returns a meter ready to attach to a client.
func NewRedisMeter() *RedisMeter {
	return &RedisMeter{names: map[string]int64{}}
}

// Attach starts counting on a client. Attach once per client: a second call
// counts every command twice.
func (m *RedisMeter) Attach(client *redis.Client) *redis.Client {
	client.AddHook(m)
	return client
}

func (m *RedisMeter) DialHook(next redis.DialHook) redis.DialHook { return next }

func (m *RedisMeter) ProcessHook(next redis.ProcessHook) redis.ProcessHook {
	return func(ctx context.Context, cmd redis.Cmder) error {
		m.record(cmd.Name())
		return next(ctx, cmd)
	}
}

func (m *RedisMeter) ProcessPipelineHook(next redis.ProcessPipelineHook) redis.ProcessPipelineHook {
	return func(ctx context.Context, cmds []redis.Cmder) error {
		for _, cmd := range cmds {
			m.record(cmd.Name())
		}
		return next(ctx, cmds)
	}
}

func (m *RedisMeter) record(name string) {
	m.commands.Add(1)
	m.mu.Lock()
	m.names[strings.ToLower(name)]++
	m.mu.Unlock()
}

// Total is how many commands have been sent.
func (m *RedisMeter) Total() int64 { return m.commands.Load() }

// Breakdown is the count per command name.
func (m *RedisMeter) Breakdown() map[string]int64 {
	m.mu.Lock()
	defer m.mu.Unlock()
	out := make(map[string]int64, len(m.names))
	maps.Copy(out, m.names)
	return out
}

// Summary renders the breakdown busiest first, for a log line.
func (m *RedisMeter) Summary() string {
	counts := m.Breakdown()
	names := make([]string, 0, len(counts))
	for name := range counts {
		names = append(names, name)
	}
	sort.Slice(names, func(i, j int) bool { return counts[names[i]] > counts[names[j]] })

	var b strings.Builder
	for i, name := range names {
		if i > 0 {
			b.WriteString(" ")
		}
		b.WriteString(name)
		b.WriteString("=")
		b.WriteString(itoa64(counts[name]))
	}
	return b.String()
}

func itoa64(n int64) string {
	if n == 0 {
		return "0"
	}
	var digits []byte
	for n > 0 {
		digits = append([]byte{byte('0' + n%10)}, digits...)
		n /= 10
	}
	return string(digits)
}
