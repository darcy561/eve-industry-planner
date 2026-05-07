package archivedjobs

const (
	buildStatsBatchSize          = 500
	corpBuildStatsRebuildLockKey = "worker:archivedjobs:corp_build_stats_rebuild"
	defaultDirtyCorpRefBatchSize = 500
	defaultDirtyAccountBatchSize = 300
)
