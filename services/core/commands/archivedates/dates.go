// Package archivedates carries archive dates recovered from the Firestore
// deployment that preceded Mongo.
//
// Some archived jobs reach Mongo with no archive timestamp, no linked industry
// jobs and no sales, so nothing in the document says when they happened. The old
// Firestore build-stats documents recorded a processDate for every job they
// aggregated, which dates those jobs to within a few weeks.
//
// The map is embedded rather than read from Firestore at run time. It is a fixed
// historical record — Firestore stopped receiving writes at the migration, so no
// job archived since appears here and none ever will. Embedding keeps the
// backfill from depending on a system being retired, and makes the dates
// reviewable in a diff rather than fetched from somewhere nobody can inspect.
package archivedates

import (
	_ "embed"
	"encoding/json"
	"fmt"
	"sync"
	"time"
)

//go:embed archive_dates.json
var archiveDatesJSON []byte

var (
	once   sync.Once
	parsed map[string]time.Time
	parseE error
)

func load() (map[string]time.Time, error) {
	once.Do(func() {
		raw := map[string]string{}
		if err := json.Unmarshal(archiveDatesJSON, &raw); err != nil {
			parseE = fmt.Errorf("archivedates: parse embedded dates: %w", err)
			return
		}
		parsed = make(map[string]time.Time, len(raw))
		for jobID, s := range raw {
			t, err := time.Parse(time.RFC3339, s)
			if err != nil {
				parseE = fmt.Errorf("archivedates: job %s has an unparseable date %q: %w", jobID, s, err)
				return
			}
			parsed[jobID] = t.UTC()
		}
	})
	return parsed, parseE
}

// Lookup returns the recovered archive date for a job, if one was recorded.
//
// The date is when the previous pipeline processed the job rather than when a
// user archived it. Processing followed archiving by a median of seven days
// across the jobs where both are known, so a small share of these land one month
// later than the truth. That is a better answer than the alternatives available
// to a job with no dates of its own, but it is a proxy and should not override a
// date the job document itself carries.
func Lookup(jobID string) (time.Time, bool, error) {
	dates, err := load()
	if err != nil {
		return time.Time{}, false, err
	}
	t, ok := dates[jobID]
	return t, ok, nil
}

// Count reports how many jobs the recovered set covers, for operator output.
func Count() (int, error) {
	dates, err := load()
	if err != nil {
		return 0, err
	}
	return len(dates), nil
}
