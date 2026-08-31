package metrics

import (
	"context"
	"encoding/json"

	"eve-industry-planner/core/metrics/appconfig"
	"eve-industry-planner/core/metrics/esi"
	"eve-industry-planner/core/metrics/sde"
	"eve-industry-planner/core/metrics/users"
	"eve-industry-planner/shared/logs"
	eipnats "eve-industry-planner/shared/nats"

	eipmongo "eve-industry-planner/shared/mongo"
	natslib "github.com/nats-io/nats.go"
	"github.com/redis/go-redis/v9"
)

// RegisterAll wires core service metric groups.
func RegisterAll(rdb *redis.Client, mongoHandle *eipmongo.Mongo, natsConn *natslib.Conn) []func(context.Context) {
	cleanups := make([]func(context.Context), 0, 1)
	esi.Register(rdb)
	users.Register(mongoHandle)
	sde.Register()
	appconfig.Register()
	if natsConn != nil {
		sub, err := natsConn.Subscribe(eipnats.SubjectCoreSDEBuildUpdated, func(msg *natslib.Msg) {
			var u eipnats.SDECurrentBuildUpdate
			if unmarshalErr := json.Unmarshal(msg.Data, &u); unmarshalErr != nil {
				return
			}
			sde.SetCurrentVersion(u.BuildNumber, u.Version)
		})
		if err != nil {
			logs.WarnCtx(context.Background(), "failed to subscribe to SDE build update subject", "error", err)
		} else if sub != nil {
			cleanups = append(cleanups, func(context.Context) { _ = sub.Unsubscribe() })
		}
	}
	return cleanups
}
