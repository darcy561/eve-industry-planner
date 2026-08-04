package statistics

import "eve-industry-planner/api/apideps"

type Handlers struct {
	*apideps.Deps
}

func New(deps *apideps.Deps) *Handlers {
	if deps == nil {
		deps = &apideps.Deps{}
	}
	return &Handlers{Deps: deps}
}
