package tasks

import (
	"encoding/json"
	"errors"
	"fmt"
	"net/http"
	"net/http/httptest"
	"slices"
	"strings"
	"sync/atomic"
	"testing"
	"time"

	"eve-industry-planner/shared/esiclient"
	eipnats "eve-industry-planner/shared/nats"
	"eve-industry-planner/testing/redisfake"

	"github.com/hibiken/asynq"
)

type affiliationOrigin struct {
	server   *httptest.Server
	requests atomic.Int64
	// batches records the size of each batch the caller sent.
	batches []int
	// failBatch always fails the nth batch, whatever it is retried.
	failBatch int
	// failOnce fails the nth batch only the first time it is seen.
	failOnce  int
	seenBatch map[int]int
	status    int
}

func newAffiliationOrigin(t *testing.T) *affiliationOrigin {
	t.Helper()

	o := &affiliationOrigin{status: http.StatusOK, seenBatch: map[int]int{}}
	o.server = httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if strings.HasPrefix(r.URL.Path, "/status") {
			w.Header().Set("X-Ratelimit-Group", "status")
			w.Header().Set("X-Ratelimit-Limit", "600/15m")
			_, _ = w.Write([]byte(`{"players":1,"server_version":"1","start_time":"2026-09-04T11:02:00Z"}`))
			return
		}

		var ids []int
		_ = json.NewDecoder(r.Body).Decode(&ids)

		o.requests.Add(1)
		o.batches = append(o.batches, len(ids))

		// Identify the batch by its contents, not by request order, so a retry
		// is recognised as the same batch rather than counted as a new one.
		batch := 0
		if len(ids) > 0 {
			batch = (ids[0] - 91000000) / maxCharacterAffiliationBatch
		}
		o.seenBatch[batch]++

		w.Header().Set("X-Ratelimit-Group", "characters")
		w.Header().Set("X-Ratelimit-Limit", "600/15m")
		w.Header().Set("X-Ratelimit-Remaining", "590")

		if o.failBatch > 0 && batch == o.failBatch {
			w.WriteHeader(http.StatusInternalServerError)
			return
		}
		if o.failOnce > 0 && batch == o.failOnce && o.seenBatch[batch] == 1 {
			w.WriteHeader(http.StatusInternalServerError)
			return
		}
		if o.status != http.StatusOK {
			w.WriteHeader(o.status)
			return
		}

		var b strings.Builder
		b.WriteByte('[')
		for i, id := range ids {
			if i > 0 {
				b.WriteByte(',')
			}
			// Every third character has no alliance, so the alliance handling is
			// exercised rather than assumed.
			alliance := 99000000 + id%5
			if id%3 == 0 {
				alliance = 0
			}
			fmt.Fprintf(&b, `{"character_id":%d,"corporation_id":%d,"alliance_id":%d}`,
				id, 98000000+id%7, alliance)
		}
		b.WriteByte(']')
		_, _ = w.Write([]byte(b.String()))
	}))
	t.Cleanup(o.server.Close)
	return o
}

func characterIDs(n int) []int {
	ids := make([]int, n)
	for i := range n {
		ids[i] = 91000000 + i
	}
	return ids
}

// resolved renders affiliations as comparable strings.
func resolved(rows []esiclient.CharacterAffiliation) []string {
	out := make([]string, 0, len(rows))
	for _, row := range rows {
		out = append(out, fmt.Sprintf("%d:%d:%d", row.CharacterID, row.CorporationID, row.AllianceID))
	}
	slices.Sort(out)
	return out
}

// affiliationClient builds the ESI client the lookup uses, pointed at a test origin.
func affiliationClient(t *testing.T, baseURL string) esiclient.API {
	t.Helper()
	fake := redisfake.New(t)
	cfg := esiclient.DefaultConfig()
	cfg.BaseURL = baseURL
	api, stop, err := esiclient.New(fake.Client, cfg)
	if err != nil {
		t.Fatalf("esiclient: %v", err)
	}
	t.Cleanup(stop)
	return api
}

func TestAffiliationResolvesEveryCharacter(t *testing.T) {
	for _, count := range []int{1, 250, 2500} {
		t.Run(fmt.Sprintf("%d characters", count), func(t *testing.T) {
			ids := characterIDs(count)
			origin := newAffiliationOrigin(t)

			rows, failed, err := fetchCharacterAffiliations(t.Context(), affiliationClient(t, origin.server.URL), "acct-1", ids)
			if err != nil {
				t.Fatalf("lookup: %v", err)
			}

			if failed != 0 {
				t.Errorf("%d characters went unresolved against a healthy origin", failed)
			}
			if len(rows) != count {
				t.Errorf("resolved %d of %d characters", len(rows), count)
			}

			// The batch size decides how many calls a login costs, which is the
			// figure the rate limiter has to accommodate.
			wantBatches := (count + maxCharacterAffiliationBatch - 1) / maxCharacterAffiliationBatch
			if len(origin.batches) != wantBatches {
				t.Errorf("sent %v batches, want %d of at most %d",
					origin.batches, wantBatches, maxCharacterAffiliationBatch)
			}
			for _, size := range origin.batches {
				if size > maxCharacterAffiliationBatch {
					t.Errorf("a batch of %d exceeds what ESI accepts", size)
				}
			}
		})
	}
}

func TestAffiliationKeepsGoingWhenABatchNeverAnswers(t *testing.T) {
	ids := characterIDs(2500)
	origin := newAffiliationOrigin(t)
	origin.failBatch = 1

	rows, failed, err := fetchCharacterAffiliations(t.Context(), affiliationClient(t, origin.server.URL), "acct-1", ids)
	if err != nil {
		t.Fatalf("a failing batch should not fail the pass: %v", err)
	}

	// A batch that cannot be had costs that batch and no more — the rest of the
	// login's characters still resolve, because a partial answer still narrows
	// what a session may see.
	if failed != maxCharacterAffiliationBatch {
		t.Errorf("one dead batch cost %d characters, want %d", failed, maxCharacterAffiliationBatch)
	}
	if len(rows) == 0 {
		t.Fatal("a failing batch should not abandon the ones that worked")
	}
	if len(rows) != len(ids)-failed {
		t.Errorf("resolved %d characters, want the %d that were not in the dead batch",
			len(rows), len(ids)-failed)
	}
	if got := resolved(rows); len(got) != len(rows) {
		t.Errorf("rendered %d rows from %d", len(got), len(rows))
	}
}

func TestAffiliationRecoversFromABatchThatFailsOnce(t *testing.T) {
	// A 5xx costs no tokens and may well succeed on a second ask, so the batch is
	// retried rather than written off — one blip would otherwise lose a thousand
	// characters.
	ids := characterIDs(2500)
	origin := newAffiliationOrigin(t)
	origin.failOnce = 1

	rows, failed, err := fetchCharacterAffiliations(t.Context(), affiliationClient(t, origin.server.URL), "acct-1", ids)
	if err != nil {
		t.Fatalf("lookup: %v", err)
	}

	if failed != 0 {
		t.Errorf("%d characters were lost to a blip the retry should have covered", failed)
	}
	if len(rows) != len(ids) {
		t.Errorf("resolved %d of %d characters after one transient failure", len(rows), len(ids))
	}
}

// createMockTask builds the asynq payload envelope a handler unwraps.
func createMockTask(taskType string, data any) *asynq.Task {
	var payloadData json.RawMessage
	if data != nil {
		dataBytes, _ := json.Marshal(data)
		taskMsgBytes, _ := json.Marshal(eipnats.TaskMessage{TaskType: taskType, Data: dataBytes})
		payloadData = taskMsgBytes
	}
	payloadBytes, _ := json.Marshal(struct {
		TaskType string          `json:"task_type"`
		Data     json.RawMessage `json:"data"`
	}{TaskType: taskType, Data: payloadData})
	return asynq.NewTask(taskType, payloadBytes)
}

func TestStreamErrorSeparatesTimingFromFaults(t *testing.T) {
	// asynq re-queues on any returned error, but a rate-limit refusal is the
	// limiter saying "later" rather than the task being broken, so it must not
	// be logged as a failure.
	refusal := &esiclient.RateLimitError{
		Kind:       esiclient.KindQueued,
		RetryAfter: time.Now().Add(30 * time.Second),
		Reason:     "queued behind other work",
	}

	if got := HandleStreamError(t.Context(), refusal, "a task"); !errors.Is(got, error(refusal)) {
		t.Errorf("a refusal was not returned unchanged: %v", got)
	}
	if !esiclient.IsRateLimit(HandleStreamError(t.Context(), refusal, "a task")) {
		t.Error("the returned error lost its rate-limit identity, so asynq would count it as a failure")
	}

	fault := errors.New("connection reset")
	if got := HandleStreamError(t.Context(), fault, "a task"); !errors.Is(got, fault) {
		t.Errorf("a real fault was not returned unchanged: %v", got)
	}

	if got := HandleStreamError(t.Context(), nil, "a task"); got != nil {
		t.Errorf("success became an error: %v", got)
	}
}
