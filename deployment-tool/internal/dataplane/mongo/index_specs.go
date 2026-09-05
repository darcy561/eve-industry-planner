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
			Name:       "meta_owner_1",
			Keys: []IndexKey{
				{Field: "_meta.owner.kind", Order: 1},
				{Field: "_meta.owner.id", Order: 1},
			},
		},
		{
			Collection: "accounts",
			Name:       "accounts_meta_lastLoginAt_1",
			Keys:       []IndexKey{{Field: "_meta.lastLoginAt", Order: 1}},
		},
		{
			Collection: "account_settings",
			Name:       "meta_owner_1",
			Keys: []IndexKey{
				{Field: "_meta.owner.kind", Order: 1},
				{Field: "_meta.owner.id", Order: 1},
			},
		},
		{
			Collection: "job_groups",
			Name:       "ajg_meta_owner_1",
			Keys: []IndexKey{
				{Field: "_meta.owner.kind", Order: 1},
				{Field: "_meta.owner.id", Order: 1},
			},
		},
		{
			Collection: "watchlist_deprecated",
			Name:       "awd_meta_owner_1",
			Keys: []IndexKey{
				{Field: "_meta.owner.kind", Order: 1},
				{Field: "_meta.owner.id", Order: 1},
			},
		},
		{
			Collection: "job_documents",
			Name:       "ajd_meta_owner_displayOnPlanner_1",
			Keys: []IndexKey{
				{Field: "_meta.owner.kind", Order: 1},
				{Field: "_meta.owner.id", Order: 1},
				{Field: "displayOnPlanner", Order: 1},
			},
		},
		{
			Collection: "job_documents",
			Name:       "ajd_meta_owner_groupID_1",
			Keys: []IndexKey{
				{Field: "_meta.owner.kind", Order: 1},
				{Field: "_meta.owner.id", Order: 1},
				{Field: "groupID", Order: 1},
			},
		},
		{
			Collection: "job_documents",
			Name:       "ajd_linkedJobs_corporation_id_1",
			Keys:       []IndexKey{{Field: "build.costs.linkedJobs.corporation_id", Order: 1}},
		},
		{
			Collection: "job_documents",
			Name:       "ajd_protected_spec_1",
			Keys:       []IndexKey{{Field: "protected.spec", Order: 1}},
		},
		{
			// Restore asks which planner job already claims an ESI id before it
			// hands one back. A job holds an id by carrying its row, so each
			// linked series is searched by the id on the row within an account.
			Collection: "job_documents",
			Name:       "ajd_meta_owner_marketOrders_order_id_1",
			Keys: []IndexKey{
				{Field: "_meta.owner.kind", Order: 1},
				{Field: "_meta.owner.id", Order: 1},
				{Field: "build.sale.marketOrders.order_id", Order: 1},
			},
		},
		{
			Collection: "job_documents",
			Name:       "ajd_meta_owner_linkedJobs_job_id_1",
			Keys: []IndexKey{
				{Field: "_meta.owner.kind", Order: 1},
				{Field: "_meta.owner.id", Order: 1},
				{Field: "build.costs.linkedJobs.job_id", Order: 1},
			},
		},
		{
			Collection: "job_documents",
			Name:       "ajd_meta_owner_transactions_transaction_id_1",
			Keys: []IndexKey{
				{Field: "_meta.owner.kind", Order: 1},
				{Field: "_meta.owner.id", Order: 1},
				{Field: "build.sale.transactions.transaction_id", Order: 1},
			},
		},
		{
			Collection: "archived_jobs",
			Name:       "aj_linkedJobs_corporation_id_1",
			Keys:       []IndexKey{{Field: "build.costs.linkedJobs.corporation_id", Order: 1}},
		},
		{
			Collection: "archived_jobs",
			Name:       "aj_protected_spec_1",
			Keys:       []IndexKey{{Field: "protected.spec", Order: 1}},
		},
		// The archived-jobs list sorts by one of four fields and breaks ties on
		// jobID so paging is stable. The tiebreaker belongs in the index: without
		// it Mongo sorts the whole account in memory on every page, and with it a
		// page reads exactly as many documents as it returns.
		{
			Collection: "archived_jobs",
			Name:       "aj_meta_owner_archivedAt_jobID_1",
			Keys: []IndexKey{
				{Field: "_meta.owner.kind", Order: 1},
				{Field: "_meta.owner.id", Order: 1},
				{Field: "_meta.archivedAt", Order: -1},
				{Field: "jobID", Order: 1},
			},
		},
		{
			Collection: "archived_jobs",
			Name:       "aj_meta_owner_name_jobID_1",
			Keys: []IndexKey{
				{Field: "_meta.owner.kind", Order: 1},
				{Field: "_meta.owner.id", Order: 1},
				{Field: "name", Order: 1},
				{Field: "jobID", Order: 1},
			},
		},
		{
			// Also serves the list filtered to one item type.
			Collection: "archived_jobs",
			Name:       "aj_meta_owner_itemID_jobID_1",
			Keys: []IndexKey{
				{Field: "_meta.owner.kind", Order: 1},
				{Field: "_meta.owner.id", Order: 1},
				{Field: "itemID", Order: 1},
				{Field: "jobID", Order: 1},
			},
		},
		{
			Collection: "archived_jobs",
			Name:       "aj_meta_owner_jobType_jobID_1",
			Keys: []IndexKey{
				{Field: "_meta.owner.kind", Order: 1},
				{Field: "_meta.owner.id", Order: 1},
				{Field: "jobType", Order: 1},
				{Field: "jobID", Order: 1},
			},
		},
		{
			// The group filter that restores a whole group.
			Collection: "archived_jobs",
			Name:       "aj_meta_owner_groupID_1",
			Keys: []IndexKey{
				{Field: "_meta.owner.kind", Order: 1},
				{Field: "_meta.owner.id", Order: 1},
				{Field: "groupID", Order: 1},
			},
		},
		// The statistics collections are keyed by owner, so every filter leads with
		// the owner's kind and id. An owner kind added later needs no new index: it
		// is another value in the same leading fields.
		{
			// The delta fold reads the rows whose figures are not yet counted and
			// the revoked rows whose figures still are — both are the owner's rows
			// narrowed by revoked and by whether contributedAt is stamped.
			Collection: "statistics_rows",
			Name:       "aajs_owner_revoked_contributedAt_1",
			Keys: []IndexKey{
				{Field: "_meta.owner.kind", Order: 1},
				{Field: "_meta.owner.id", Order: 1},
				{Field: "revoked", Order: 1},
				{Field: "contributedAt", Order: 1},
			},
		},
		{
			// Rebuilding one item type reads that type's live rows.
			Collection: "statistics_rows",
			Name:       "aajs_owner_typeID_revoked_1",
			Keys: []IndexKey{
				{Field: "_meta.owner.kind", Order: 1},
				{Field: "_meta.owner.id", Order: 1},
				{Field: "typeID", Order: 1},
				{Field: "revoked", Order: 1},
			},
		},
		{
			// The timeline excludes production-chain buckets unless asked for them.
			// Year and month are deliberately absent: the range is bound on a
			// computed month ordinal, which no index can serve.
			Collection: "statistics_timeline",
			Name:       "atm_owner_isProductionChain_typeID_1",
			Keys: []IndexKey{
				{Field: "_meta.owner.kind", Order: 1},
				{Field: "_meta.owner.id", Order: 1},
				{Field: "isProductionChain", Order: 1},
				{Field: "typeID", Order: 1},
			},
		},
		{
			// The same views with production chain included.
			Collection: "statistics_timeline",
			Name:       "atm_owner_typeID_1",
			Keys: []IndexKey{
				{Field: "_meta.owner.kind", Order: 1},
				{Field: "_meta.owner.id", Order: 1},
				{Field: "typeID", Order: 1},
			},
		},
		{
			// Serves the lifetime totals read, whole-owner and single-type, and the
			// typeID ordering it returns in.
			Collection: "statistics_totals",
			Name:       "apt_owner_typeID_1",
			Keys: []IndexKey{
				{Field: "_meta.owner.kind", Order: 1},
				{Field: "_meta.owner.id", Order: 1},
				{Field: "typeID", Order: 1},
			},
		},
	}
}
