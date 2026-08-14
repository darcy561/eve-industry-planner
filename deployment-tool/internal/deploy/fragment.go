package deploy

import (
	"eve-industry-planner/deployment-tool/internal/catalog"
	"eve-industry-planner/deployment-tool/internal/docker"
)

// FragmentState is live membership for one catalog fragment.
type FragmentState struct {
	ID       string // catalog.Fragment*
	Title    string
	Optional bool
	Expected int // catalog services in this fragment
	OnStack  int // catalog services present on the live stack
}

// Present reports whether any expected service for this fragment is on the stack.
func (f FragmentState) Present() bool {
	return f.OnStack > 0
}

// FragmentStates rolls catalog groups into fragment membership.
func FragmentStates(snap docker.StackSnapshot) []FragmentState {
	type acc struct {
		title    string
		optional bool
		expected int
		onStack  int
	}
	frags := catalog.Fragments()
	by := make(map[string]*acc, len(frags))
	for _, f := range frags {
		by[f.ID] = &acc{title: f.Title, optional: f.Optional}
	}

	for _, g := range catalog.Groups() {
		a := by[g.Fragment]
		if a == nil {
			continue
		}
		for _, svc := range g.Services {
			a.expected++
			if _, ok := snap.Services[svc.Short]; ok {
				a.onStack++
			}
		}
	}

	out := make([]FragmentState, 0, len(frags))
	for _, f := range frags {
		a := by[f.ID]
		out = append(out, FragmentState{
			ID:       f.ID,
			Title:    a.title,
			Optional: a.optional,
			Expected: a.expected,
			OnStack:  a.onStack,
		})
	}
	return out
}
