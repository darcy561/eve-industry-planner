package groups

import (
	"eve-industry-planner/api/apideps"
	"eve-industry-planner/shared/core/documentlock"
)

type Handlers struct {
	*apideps.Deps
	locks documentlock.Deps
}

func New(deps *apideps.Deps) *Handlers {
	if deps == nil {
		deps = &apideps.Deps{}
	}
	return &Handlers{Deps: deps, locks: deps.LockDeps()}
}
