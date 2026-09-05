package status

import (
	"strings"

	"eve-industry-planner/deployment-tool/internal/catalogue"
	"eve-industry-planner/deployment-tool/internal/deploy"
	"eve-industry-planner/deployment-tool/internal/docker"
	"eve-industry-planner/deployment-tool/internal/kit"
)

// Report is a structured status result (CLI: FormatPlain; TUI: msg.EmitStatus).
type Report struct {
	StackName     string                 `json:"stackName"`
	StackPresent  bool                   `json:"stackPresent"`
	Home          string                 `json:"home,omitempty"`
	Source        string                 `json:"source"`
	SourceDetail  string                 `json:"sourceDetail,omitempty"`
	Fragments     []deploy.FragmentState `json:"fragments,omitempty"`
	Groups        []GroupSection         `json:"groups"`
	Overall       Signal                 `json:"overall"`
	OverallDetail string                 `json:"overallDetail"`
	CriticalBad   int                    `json:"criticalBad"`
	OpsBad        int                    `json:"opsBad"`
	ObsEnabled    bool                   `json:"obsEnabled"`
}

// GroupSection is one titled block of service rows.
type GroupSection struct {
	Title string       `json:"title"`
	Rows  []ServiceRow `json:"rows"`
}

// Build evaluates the expected catalogue against a deploy.View (Inspect output).
func Build(v deploy.View) Report {
	snap := v.Snapshot
	r := Report{
		StackName:    v.StackName,
		StackPresent: snap.Present,
		Home:         v.Home,
		Source:       string(v.Source),
		SourceDetail: deploy.SourceDetail(v.Source),
		Fragments:    v.Fragments,
		ObsEnabled:   v.ObsEnabled,
	}
	if r.StackName == "" {
		r.StackName = kit.StackName
	}

	for _, g := range catalogue.Groups() {
		if g.Fragment == catalogue.FragmentObs && !v.ObsEnabled && !groupOnStack(snap, g) {
			continue
		}
		sec := GroupSection{Title: g.Title}
		for _, svc := range g.Services {
			row := evalService(snap, svc.Short, svc.Label, g.Critical)
			sec.Rows = append(sec.Rows, row)
			if row.Signal != OK {
				if g.Critical {
					r.CriticalBad++
				} else {
					r.OpsBad++
				}
			}
		}
		r.Groups = append(r.Groups, sec)
	}

	r.Overall, r.OverallDetail = OverallSignal(snap.Present, r.CriticalBad, r.OpsBad)
	return r
}

func groupOnStack(snap docker.StackSnapshot, g catalogue.Group) bool {
	for _, svc := range g.Services {
		if _, ok := snap.Services[svc.Short]; ok {
			return true
		}
	}
	return false
}

func evalService(snap docker.StackSnapshot, short, label string, critical bool) ServiceRow {
	row := ServiceRow{Short: short, Label: label, Critical: critical}
	info, exists := snap.Services[short]
	var desired, running, starting uint64
	if exists {
		desired, running, starting = info.Desired, info.Running, info.Starting
		row.Ports = info.Ports
	}
	row.Signal, row.Detail = ServiceSignal(snap.Present, exists, desired, running, starting)
	row.Tasks = taskLines(info, row.Signal)
	return row
}

func taskLines(info docker.ServiceInfo, signal Signal) []string {
	if info.Short == "" {
		return nil
	}
	var lines []string
	shown := 0
	for _, t := range info.Tasks {
		if signal == OK {
			// Match bash: desired Running + current Running* (display may be "Running 2h ago").
			if !strings.EqualFold(t.DesiredState, "running") {
				continue
			}
			if !strings.HasPrefix(strings.ToLower(t.CurrentState), "running") {
				continue
			}
		} else if shown >= 3 {
			break
		}
		line := t.Name + "  " + t.CurrentState
		if t.Error != "" {
			line += "  (" + t.Error + ")"
		}
		lines = append(lines, line)
		shown++
	}
	return lines
}
