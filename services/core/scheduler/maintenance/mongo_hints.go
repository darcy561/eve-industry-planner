package maintenance

// Query-planner hint names only (not index ensure). Index SoT: deployment-tool IndexSpecs.
//
// A hint naming an index that does not exist fails the query outright, so this
// name is spelled exactly as the spec creates it.
const accountsMetaLastLoginAtIndexName = "accounts_meta_lastLoginAt_1"
