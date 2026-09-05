package mongo

import (
	"context"
	"errors"
	"fmt"
	"strings"
	"testing"
)

func TestIndexSpecsCoverExpected(t *testing.T) {
	t.Parallel()
	specs := IndexSpecs()
	want := map[string]bool{
		"accounts.meta_accountID_1":                                                true,
		"accounts.accounts_meta_lastLoginAt_1":                                     true,
		"account_settings.meta_accountID_1":                                        true,
		"account_job_groups.ajg_meta_accountID_1":                                  true,
		"account_watchlist_deprecated.awd_meta_accountID_1":                        true,
		"account_job_documents.ajd_meta_accountID_displayOnPlanner_1":              true,
		"account_job_documents.ajd_meta_accountID_groupID_1":                       true,
		"account_job_documents.ajd_linkedJobs_corporation_id_1":                    true,
		"account_job_documents.ajd_protected_spec_1":                               true,
		"account_job_documents.ajd_meta_accountID_marketOrders_order_id_1":         true,
		"account_job_documents.ajd_meta_accountID_linkedJobs_job_id_1":             true,
		"account_job_documents.ajd_meta_accountID_transactions_transaction_id_1":   true,
		"account_archived_jobs.aj_linkedJobs_corporation_id_1":                     true,
		"account_archived_jobs.aj_protected_spec_1":                                true,
		"account_archived_jobs.aj_meta_accountID_archivedAt_1":                     true,
		"account_archived_jobs.aj_meta_accountID_itemID_1":                         true,
		"account_archived_jobs.aj_meta_accountID_groupID_1":                        true,
		"account_archived_job_stats.aajs_owner_typeID_isProductionChain_revoked_1": true,
		"account_archived_job_stats.aajs_owner_archivedAt_revoked_1":               true,
		"account_timeline_months.atm_owner_year_month_typeID_1":                    true,
		"account_timeline_months.atm_owner_typeID_year_month_1":                    true,
		"account_production_totals.apt_owner_typeID_1":                             true,
	}
	if len(specs) != len(want) {
		t.Fatalf("len=%d want %d", len(specs), len(want))
	}
	seen := map[string]bool{}
	for _, s := range specs {
		key := s.Collection + "." + s.Name
		if !want[key] {
			t.Fatalf("unexpected spec %s", key)
		}
		if seen[key] {
			t.Fatalf("duplicate spec %s", key)
		}
		seen[key] = true
		delete(want, key)
		if err := validateIndexSpec(s); err != nil {
			t.Fatal(err)
		}
	}
	if len(want) != 0 {
		t.Fatalf("missing specs: %v", want)
	}
}

func TestIndexSpecsRenderAll(t *testing.T) {
	t.Parallel()
	for _, spec := range IndexSpecs() {
		js, err := renderCreateIndexJS(spec)
		if err != nil {
			t.Fatalf("%s.%s: %v", spec.Collection, spec.Name, err)
		}
		need := []string{
			fmt.Sprintf(`getSiblingDB(%q)`, appDatabase),
			fmt.Sprintf(`getCollection(%q)`, spec.Collection),
			fmt.Sprintf(`name: %q`, spec.Name),
			`createIndex`,
			`code === 85`,
			`code === 86`,
			`already exists`,
			renderIndexKeysObj(spec.Keys),
		}
		for _, frag := range need {
			if !strings.Contains(js, frag) {
				t.Fatalf("%s.%s missing %q in:\n%s", spec.Collection, spec.Name, frag, js)
			}
		}
		if strings.TrimSpace(spec.PartialFilterJSON) != "" {
			if !strings.Contains(js, "partialFilterExpression") {
				t.Fatalf("%s.%s missing partialFilterExpression", spec.Collection, spec.Name)
			}
		} else if strings.Contains(js, "partialFilterExpression") {
			t.Fatalf("%s.%s unexpected partialFilterExpression", spec.Collection, spec.Name)
		}
	}
}

// No IndexSpec declares a partial filter today, but renderCreateIndexJS still
// supports one. The rendering is covered with a synthetic spec so the mechanism
// does not rot before the next index that needs it — a partial filter that fails
// to reach mongosh produces a full index silently, which is a correctness
// problem rather than a visible error.
func TestRenderCreateIndexJSEmitsPartialFilter(t *testing.T) {
	t.Parallel()
	spec := IndexSpec{
		Collection:        "account_archived_jobs",
		Name:              "test_partial_1",
		Keys:              []IndexKey{{Field: "_meta.accountID", Order: 1}},
		PartialFilterJSON: `{"revoked": false}`,
	}
	js, err := renderCreateIndexJS(spec)
	if err != nil {
		t.Fatal(err)
	}
	for _, frag := range []string{
		"partialFilterExpression",
		`"revoked": false`,
		`"account_archived_jobs"`,
		`"_meta.accountID": 1`,
	} {
		if !strings.Contains(js, frag) {
			t.Fatalf("missing %q in:\n%s", frag, js)
		}
	}
}

func TestValidateIndexSpecRejects(t *testing.T) {
	t.Parallel()
	cases := []struct {
		name string
		spec IndexSpec
	}{
		{"bad collection", IndexSpec{Collection: "bad;drop", Name: "x", Keys: []IndexKey{{Field: "a", Order: 1}}}},
		{"bad name", IndexSpec{Collection: "users", Name: "a.b", Keys: []IndexKey{{Field: "a", Order: 1}}}},
		{"empty keys", IndexSpec{Collection: "users", Name: "ok", Keys: nil}},
		{"bad order", IndexSpec{Collection: "users", Name: "ok", Keys: []IndexKey{{Field: "a", Order: 2}}}},
		{"empty field", IndexSpec{Collection: "users", Name: "ok", Keys: []IndexKey{{Field: "", Order: 1}}}},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			t.Parallel()
			if err := validateIndexSpec(tc.spec); err == nil {
				t.Fatal("want error")
			}
			if _, err := renderCreateIndexJS(tc.spec); err == nil {
				t.Fatal("render want error")
			}
		})
	}
}

func TestEnsureIndexesWithSuccess(t *testing.T) {
	t.Parallel()
	var evals []string
	err := ensureIndexesWith(context.Background(), "cid", creds{}, func(_ context.Context, cid string, _ creds, eval string, env []string) (string, error) {
		if cid != "cid" {
			t.Fatalf("cid=%q", cid)
		}
		if env != nil {
			t.Fatalf("env=%v", env)
		}
		evals = append(evals, eval)
		return "true", nil
	})
	if err != nil {
		t.Fatal(err)
	}
	specs := IndexSpecs()
	if len(evals) != len(specs) {
		t.Fatalf("calls=%d want %d", len(evals), len(specs))
	}
	for i, spec := range specs {
		if !strings.Contains(evals[i], spec.Name) || !strings.Contains(evals[i], spec.Collection) {
			t.Fatalf("[%d] eval missing %s.%s", i, spec.Collection, spec.Name)
		}
	}
}

func TestEnsureIndexesWithStopsOnError(t *testing.T) {
	t.Parallel()
	calls := 0
	boom := errors.New("mongosh failed")
	err := ensureIndexesWith(context.Background(), "cid", creds{}, func(_ context.Context, _ string, _ creds, _ string, _ []string) (string, error) {
		calls++
		return "stderr detail", boom
	})
	if err == nil || !errors.Is(err, boom) {
		t.Fatalf("got %v", err)
	}
	if !strings.Contains(err.Error(), "stderr detail") {
		t.Fatalf("missing out: %v", err)
	}
	if calls != 1 {
		t.Fatalf("calls=%d want 1", calls)
	}
}

func TestEnsureIndexesWithHonorsCancel(t *testing.T) {
	t.Parallel()
	ctx, cancel := context.WithCancel(context.Background())
	cancel()
	calls := 0
	err := ensureIndexesWith(ctx, "cid", creds{}, func(_ context.Context, _ string, _ creds, _ string, _ []string) (string, error) {
		calls++
		return "", nil
	})
	if !errors.Is(err, context.Canceled) {
		t.Fatalf("got %v", err)
	}
	if calls != 0 {
		t.Fatalf("calls=%d want 0", calls)
	}
}

func TestIndexSpecsPreimageCollectionsOverlap(t *testing.T) {
	t.Parallel()
	// Collections that need delete fullDocumentBeforeChange must stay in PreimageCollections.
	needPreimage := map[string]bool{
		"account_job_groups":           true,
		"account_job_documents":        true,
		"accounts":                     true,
		"account_settings":             true,
		"account_watchlist_deprecated": true,
	}
	pre := map[string]bool{}
	for _, name := range PreimageCollections {
		pre[name] = true
	}
	for name := range needPreimage {
		if !pre[name] {
			t.Fatalf("preimage list missing %s", name)
		}
	}
	for _, spec := range IndexSpecs() {
		if needPreimage[spec.Collection] && !pre[spec.Collection] {
			t.Fatalf("indexed collection %s not in PreimageCollections", spec.Collection)
		}
	}
}
