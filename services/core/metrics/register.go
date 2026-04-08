package metrics

import (
	"context"
	"encoding/json"

	"eve-industry-planner/core/metrics/esi"
	"eve-industry-planner/core/metrics/sde"
	"eve-industry-planner/core/metrics/users"
	natscore "eve-industry-planner/shared/core/nats"
	"eve-industry-planner/shared/logs"

	natslib "github.com/nats-io/nats.go"
	"github.com/redis/go-redis/v9"
	gomongo "go.mongodb.org/mongo-driver/mongo"
)

// RegisterAll wires core service metric groups.
func RegisterAll(rdb *redis.Client, mongoClient *gomongo.Client, natsConn *natslib.Conn) []func(context.Context) {
	cleanups := make([]func(context.Context), 0, 1)
	esi.Register(rdb)
	users.Register(mongoClient)
	sde.Register()
	if natsConn != nil {
		sub, err := natsConn.Subscribe(natscore.SubjectCoreSDEBuildUpdated, func(msg *natslib.Msg) {
			var u natscore.SDECurrentBuildUpdate
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
