package esi

import (
	"context"
	"encoding/json/jsontext"

	"eve-industry-planner/core/scheduler/contract"
	eipnats "eve-industry-planner/shared/nats"
)

// RetireUnaskedMarkets sets up the cron job that forgets the markets nothing has
// asked about.
//
// It asks ESI for nothing, so unlike the sweep beside it there is no downtime
// gate: dropping a market nobody wants is work worth doing while CCP is down.
func RetireUnaskedMarkets(deps contract.Dependencies, _ string) contract.TaskHandler {
	natsHandle := deps.NATS

	return func(ctx context.Context, _ jsontext.Value) error {
		return eipnats.TriggerRetireUnaskedMarkets(ctx, natsHandle)
	}
}
