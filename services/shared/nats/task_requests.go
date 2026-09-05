package nats

import (
	"go.opentelemetry.io/otel/attribute"
)

// Task payloads. Each is the type its task is defined with, so a subject and the
// struct it carries cannot drift apart.

// RegionMarketOrdersRequest represents the JSON data payload for a region market orders refresh task.
// One request covers every order in the region, so no type filter is carried.
type RegionMarketOrdersRequest struct {
	RegionID  int32 `json:"region_id"`  // Region ID for the market endpoint
	StationID int64 `json:"station_id"` // Station ID to filter orders (matches order.LocationID)
}

// SDEApplyVersionRequest represents a request to apply a specific SDE build.
// The worker will build/persist this version and then lock to it.
type SDEApplyVersionRequest struct {
	BuildNumber int `json:"build_number"`
}

// AccountSessionGrantsRequest is the worker payload for resolving corporation and alliance IDs
// from ESI character affiliation using the supplied EVE SSO access tokens.
type AccountSessionGrantsRequest struct {
	AccountID string   `json:"account_id"`
	Tokens    []string `json:"tokens"` // EVE SSO JWT access tokens (one per character)
}

// RotateRefreshTokenKeysRequest is the per-account maintenance task payload for key rotation.
type RotateRefreshTokenKeysRequest struct {
	AccountID   string `json:"account_id"`
	FromVersion string `json:"from_version,omitempty"`
	DryRun      bool   `json:"dry_run,omitempty"`
}

// EncodeJobIdentityRequest is the per-account payload for the entity-ref
// conversion sweep.
type EncodeJobIdentityRequest struct {
	AccountID  string `json:"account_id"`
	Collection string `json:"collection"`
	DryRun     bool   `json:"dry_run,omitempty"`
}

// SchemaVersionMaintenanceBatchRequest scopes one schema-maintenance batch run.
type SchemaVersionMaintenanceBatchRequest struct {
	Collection string `json:"collection"`
	BatchSize  int    `json:"batch_size,omitempty"`
}

// InactiveAccountPlannerCleanupRequest removes planner jobs/groups for one account (worker task).
type InactiveAccountPlannerCleanupRequest struct {
	AccountID     string `json:"account_id"`
	StaleAgeYears int    `json:"stale_age_years,omitempty"` // default 2 when 0 or unset; worker recomputes cutoff from this
}

// CloudStoredEsiRefreshMaintenanceRequest rotates encrypted cloud ESI refresh tokens for one account.
type CloudStoredEsiRefreshMaintenanceRequest struct {
	AccountID               string `json:"account_id"`
	RotateAfterLoginDays    int    `json:"rotate_after_login_days,omitempty"`    // default 25
	AbandonAfterLoginMonths int    `json:"abandon_after_login_months,omitempty"` // default 6
}

// RebuildOwnerStatisticsRequest names one owner's statistics to recompute, and
// the claim its queue entry carried when the work was dispatched.
//
// The claim travels with the task so the rebuild clears only an entry unchanged
// since it was read: an owner changed while the rebuild ran keeps its place and
// is rebuilt again.
type RebuildOwnerStatisticsRequest struct {
	OwnerKind string `json:"owner_kind"`
	OwnerID   string `json:"owner_id"`
	Claim     int64  `json:"claim"`
}

// ReconcileOwnerStatisticsRequest names one owner whose aggregates are to be
// rewritten from its stored rows.
//
// No claim: reconciliation is not queued work anything requested, so there is no
// entry for it to clear and nothing for a claim to protect. It runs on a rota,
// and the rows it reads are the only input it has.
type ReconcileOwnerStatisticsRequest struct {
	OwnerKind string `json:"owner_kind"`
	OwnerID   string `json:"owner_id"`
}

// SpanAttributes records which owner a reconcile covers.
func (r ReconcileOwnerStatisticsRequest) SpanAttributes() []attribute.KeyValue {
	return []attribute.KeyValue{
		attribute.String("statistics.owner_kind", r.OwnerKind),
	}
}

// SpanAttributes records which owner a rebuild covers.
func (r RebuildOwnerStatisticsRequest) SpanAttributes() []attribute.KeyValue {
	return []attribute.KeyValue{
		attribute.String("statistics.owner_kind", r.OwnerKind),
	}
}

// SpanAttributes records the region and station a market-orders refresh covers.
func (r RegionMarketOrdersRequest) SpanAttributes() []attribute.KeyValue {
	return []attribute.KeyValue{
		attribute.Int64("task.data.region_id", int64(r.RegionID)),
		attribute.Int64("task.data.station_id", r.StationID),
	}
}

// SpanAttributes records the SDE build a task applies.
func (r SDEApplyVersionRequest) SpanAttributes() []attribute.KeyValue {
	return []attribute.KeyValue{attribute.Int("task.data.build_number", r.BuildNumber)}
}

// SpanAttributes records how many characters a grants refresh resolves for.
func (r AccountSessionGrantsRequest) SpanAttributes() []attribute.KeyValue {
	attrs := []attribute.KeyValue{attribute.Int("task.data.token_count", len(r.Tokens))}
	if r.AccountID != "" {
		attrs = append(attrs, attribute.String("task.data.account_id", r.AccountID))
	}
	return attrs
}

func accountAttrs(accountID string) []attribute.KeyValue {
	if accountID == "" {
		return nil
	}
	return []attribute.KeyValue{attribute.String("task.data.account_id", accountID)}
}

// SpanAttributes records the account a per-account task runs for.
func (r InactiveAccountPlannerCleanupRequest) SpanAttributes() []attribute.KeyValue {
	return accountAttrs(r.AccountID)
}

// SpanAttributes records the account a per-account task runs for.
func (r CloudStoredEsiRefreshMaintenanceRequest) SpanAttributes() []attribute.KeyValue {
	return accountAttrs(r.AccountID)
}

// SpanAttributes records the account a per-account task runs for.
func (r RotateRefreshTokenKeysRequest) SpanAttributes() []attribute.KeyValue {
	return accountAttrs(r.AccountID)
}

// SpanAttributes records the account and collection a conversion sweep covers.
func (r EncodeJobIdentityRequest) SpanAttributes() []attribute.KeyValue {
	attrs := accountAttrs(r.AccountID)
	if r.Collection != "" {
		attrs = append(attrs, attribute.String("task.data.collection", r.Collection))
	}
	return attrs
}

// SpanAttributes records the collection a schema batch upgrades.
func (r SchemaVersionMaintenanceBatchRequest) SpanAttributes() []attribute.KeyValue {
	if r.Collection == "" {
		return nil
	}
	return []attribute.KeyValue{attribute.String("task.data.collection", r.Collection)}
}
