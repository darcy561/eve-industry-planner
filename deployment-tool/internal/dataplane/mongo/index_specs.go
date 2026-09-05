package mongo

// IndexKey is one field in an index key pattern (order 1 or -1).
type IndexKey struct {
	Field string
	Order int
}

// IndexSpec is one application MongoDB index (SoT for dataplane.EnsureMongo).
// Older conflicting index names are not dropped — create by name only.
type IndexSpec struct {
	Collection string
	Name       string
	Keys       []IndexKey
	// PartialFilterJSON is optional mongosh/JSON object for partialFilterExpression.
	// A partial filter must match the query filter it serves, or the index stops
	// covering that query. services/ is a separate module, so filters mirrored from
	// there are pinned by tests on both sides rather than shared as code.
	PartialFilterJSON string
}

// IndexSpecs is the declarative list of indexes Ensure creates (after preimages).
func IndexSpecs() []IndexSpec {
	return []IndexSpec{
		{
			Collection: "accounts",
			Name:       "meta_accountID_1",
			Keys:       []IndexKey{{Field: "_meta.accountID", Order: 1}},
		},
		{
			Collection: "accounts",
			Name:       "accounts_meta_lastLoginAt_1",
			Keys:       []IndexKey{{Field: "_meta.lastLoginAt", Order: 1}},
		},
		{
			Collection: "account_settings",
			Name:       "meta_accountID_1",
			Keys:       []IndexKey{{Field: "_meta.accountID", Order: 1}},
		},
		{
			Collection: "account_job_groups",
			Name:       "ajg_meta_accountID_1",
			Keys:       []IndexKey{{Field: "_meta.accountID", Order: 1}},
		},
		{
			Collection: "account_watchlist_deprecated",
			Name:       "awd_meta_accountID_1",
			Keys:       []IndexKey{{Field: "_meta.accountID", Order: 1}},
		},
		{
			Collection: "account_job_documents",
			Name:       "ajd_meta_accountID_displayOnPlanner_1",
			Keys: []IndexKey{
				{Field: "_meta.accountID", Order: 1},
				{Field: "displayOnPlanner", Order: 1},
			},
		},
		{
			Collection: "account_job_documents",
			Name:       "ajd_meta_accountID_groupID_1",
			Keys: []IndexKey{
				{Field: "_meta.accountID", Order: 1},
				{Field: "groupID", Order: 1},
			},
		},
		{
			Collection: "account_job_documents",
			Name:       "ajd_linkedJobs_corporation_id_1",
			Keys:       []IndexKey{{Field: "build.costs.linkedJobs.corporation_id", Order: 1}},
		},
		{
			Collection: "account_job_documents",
			Name:       "ajd_protected_spec_1",
			Keys:       []IndexKey{{Field: "protected.spec", Order: 1}},
		},
		{
			// Restore asks which planner job already claims an ESI id before it
			// hands one back. A job holds an id by carrying its row, so each
			// linked series is searched by the id on the row within an account.
			Collection: "account_job_documents",
			Name:       "ajd_meta_accountID_marketOrders_order_id_1",
			Keys: []IndexKey{
				{Field: "_meta.accountID", Order: 1},
				{Field: "build.sale.marketOrders.order_id", Order: 1},
			},
		},
		{
			Collection: "account_job_documents",
			Name:       "ajd_meta_accountID_linkedJobs_job_id_1",
			Keys: []IndexKey{
				{Field: "_meta.accountID", Order: 1},
				{Field: "build.costs.linkedJobs.job_id", Order: 1},
			},
		},
		{
			Collection: "account_job_documents",
			Name:       "ajd_meta_accountID_transactions_transaction_id_1",
			Keys: []IndexKey{
				{Field: "_meta.accountID", Order: 1},
				{Field: "build.sale.transactions.transaction_id", Order: 1},
			},
		},
		{
			Collection: "account_archived_jobs",
			Name:       "aj_linkedJobs_corporation_id_1",
			Keys:       []IndexKey{{Field: "build.costs.linkedJobs.corporation_id", Order: 1}},
		},
		{
			Collection: "account_archived_jobs",
			Name:       "aj_protected_spec_1",
			Keys:       []IndexKey{{Field: "protected.spec", Order: 1}},
		},
		{
			// The archived-jobs list orders by archive date within an account,
			// which is both its default sort and the field its range filter
			// narrows on.
			Collection: "account_archived_jobs",
			Name:       "aj_meta_accountID_archivedAt_1",
			Keys: []IndexKey{
				{Field: "_meta.accountID", Order: 1},
				{Field: "_meta.archivedAt", Order: -1},
			},
		},
		{
			// Serves the list filtered to one item type, and the group filter
			// that restores a whole group reads the same account scope.
			Collection: "account_archived_jobs",
			Name:       "aj_meta_accountID_itemID_1",
			Keys: []IndexKey{
				{Field: "_meta.accountID", Order: 1},
				{Field: "itemID", Order: 1},
			},
		},
		{
			Collection: "account_archived_jobs",
			Name:       "aj_meta_accountID_groupID_1",
			Keys: []IndexKey{
				{Field: "_meta.accountID", Order: 1},
				{Field: "groupID", Order: 1},
			},
		},
		// The three statistics collections are keyed by owner, so every filter
		// leads with the owner's kind and id. An owner kind added later needs no
		// new index: it is another value in the same leading fields.
		{
			Collection: "account_archived_job_stats",
			Name:       "aajs_owner_typeID_isProductionChain_revoked_1",
			Keys: []IndexKey{
				{Field: "owner.kind", Order: 1},
				{Field: "owner.id", Order: 1},
				{Field: "typeID", Order: 1},
				{Field: "isProductionChain", Order: 1},
				{Field: "revoked", Order: 1},
			},
		},
		{
			Collection: "account_archived_job_stats",
			Name:       "aajs_owner_archivedAt_revoked_1",
			Keys: []IndexKey{
				{Field: "owner.kind", Order: 1},
				{Field: "owner.id", Order: 1},
				{Field: "archivedAt", Order: 1},
				{Field: "revoked", Order: 1},
			},
		},
		{
			Collection: "account_timeline_months",
			Name:       "atm_owner_year_month_typeID_1",
			Keys: []IndexKey{
				{Field: "owner.kind", Order: 1},
				{Field: "owner.id", Order: 1},
				{Field: "year", Order: 1},
				{Field: "month", Order: 1},
				{Field: "typeID", Order: 1},
			},
		},
		{
			// Serves the timeline views narrowed to one item type. The index
			// above leads with year and month, so a query naming a type but a
			// range of months can only use its owner prefix; this one puts
			// typeID next so both are used.
			Collection: "account_timeline_months",
			Name:       "atm_owner_typeID_year_month_1",
			Keys: []IndexKey{
				{Field: "owner.kind", Order: 1},
				{Field: "owner.id", Order: 1},
				{Field: "typeID", Order: 1},
				{Field: "year", Order: 1},
				{Field: "month", Order: 1},
			},
		},
		{
			// Serves the lifetime totals read, whole-owner and single-type.
			Collection: "account_production_totals",
			Name:       "apt_owner_typeID_1",
			Keys: []IndexKey{
				{Field: "owner.kind", Order: 1},
				{Field: "owner.id", Order: 1},
				{Field: "typeID", Order: 1},
			},
		},
	}
}
