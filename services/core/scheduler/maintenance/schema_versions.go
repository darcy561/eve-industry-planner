package maintenance

import (
	"context"
	"encoding/json"
	"fmt"
	"strconv"

	"eve-industry-planner/core/scheduler/contract"
	eipmongo "eve-industry-planner/shared/mongo"
	natscore "eve-industry-planner/shared/core/nats"
	"eve-industry-planner/shared/logs"
	taskscore "eve-industry-planner/shared/tasks"
)

const (
	schedulerLogComponent                = "scheduler.maintenance"
	cronSchemaVersionMaintenanceName     = "cron.schemaVersionMaintenance"
	cronSchemaVersionMaintenanceSchedule = "0 * * * *"
	schemaMaintenanceRedisKey            = "scheduler:maintenance:schema_version_collection_index"
	defaultSchemaMaintenanceBatchSize    = 50
)

var schemaMaintenanceCollections = []string{
	eipmongo.CollectionUsers,
	eipmongo.CollectionApplicationSettings,
	eipmongo.CollectionUserJobDocuments,
	eipmongo.CollectionUserJobGroups,
}

// ScheduleSchemaVersionMaintenance schedules a low-frequency maintenance task that
// upgrades legacy schema versions in small batches. It rotates one collection per run
// to avoid touching all collections on every tick.
func ScheduleSchemaVersionMaintenance(deps contract.Dependencies, sched contract.Scheduler) (func(), error) {
	task := taskscore.SchemaVersionMaintenanceBatch
	sched.RegisterHandler(cronSchemaVersionMaintenanceName, func(ctx context.Context, data json.RawMessage) error {
		_ = data
		collection, err := nextSchemaMaintenanceCollection(ctx, deps)
		if err != nil {
			logs.ErrorCtx(ctx, "schema maintenance: failed to resolve next collection", "component", schedulerLogComponent, "error", err)
			return err
		}
		payload := natscore.SchemaVersionMaintenanceBatchRequest{
			Collection: collection,
			BatchSize:  defaultSchemaMaintenanceBatchSize,
		}
		if err := natscore.PublishTask(
			ctx,
			deps.JSContext,
			task.Subject,
			task.Name,
			payload,
			deps.NATS,
			task.DefaultPriority,
		); err != nil {
			logs.ErrorCtx(ctx, "schema maintenance: failed to publish task", "component", schedulerLogComponent, "subject", task.Subject, "collection", collection, "error", err)
			return err
		}
		logs.InfoCtx(ctx, "schema maintenance task queued",
			"component", schedulerLogComponent,
			"subject", task.Subject,
			"collection", collection,
			"batch_size", payload.BatchSize,
		)
		return nil
	})
	if err := sched.ScheduleCronJob(cronSchemaVersionMaintenanceSchedule, cronSchemaVersionMaintenanceName); err != nil {
		return nil, err
	}
	return func() {}, nil
}

func nextSchemaMaintenanceCollection(ctx context.Context, deps contract.Dependencies) (string, error) {
	if len(schemaMaintenanceCollections) == 0 {
		return "", fmt.Errorf("no schema maintenance collections configured")
	}
	if deps.Redis == nil {
		return schemaMaintenanceCollections[0], nil
	}
	nextIdx, err := deps.Redis.Incr(ctx, schemaMaintenanceRedisKey).Result()
	if err != nil {
		return "", err
	}
	idx := int((nextIdx - 1) % int64(len(schemaMaintenanceCollections)))
	if idx < 0 || idx >= len(schemaMaintenanceCollections) {
		return "", fmt.Errorf("invalid collection index %s", strconv.Itoa(idx))
	}
	return schemaMaintenanceCollections[idx], nil
}
