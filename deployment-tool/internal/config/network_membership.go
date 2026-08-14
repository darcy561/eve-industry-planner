package config

import (
	"context"
	"fmt"
	"os"
	"path/filepath"
	"strings"
	"time"

	"github.com/moby/moby/client"

	"eve-industry-planner/deployment-tool/internal/docker"
	"eve-industry-planner/deployment-tool/internal/kit"
	"eve-industry-planner/deployment-tool/internal/msg"
	"eve-industry-planner/deployment-tool/internal/stack"
)

// ServiceNetworkMembership is one resolved ensure: attach/detach networkName on service short.
type ServiceNetworkMembership struct {
	ServiceShort string
	NetworkName  string
	Attach       bool
	Aliases      []string
}

// ApplyServiceNetworkMemberships applies resolved memberships via EnsureServiceNetwork.
func ApplyServiceNetworkMemberships(ctx context.Context, apiClient *client.Client, stackPrefix string, dryRun bool, items ...ServiceNetworkMembership) error {
	if stackPrefix == "" {
		stackPrefix = kit.StackName
	}
	for _, item := range items {
		short := strings.TrimSpace(item.ServiceShort)
		netName := strings.TrimSpace(item.NetworkName)
		if short == "" || netName == "" {
			return fmt.Errorf("service network membership: empty service or network")
		}
		svc := docker.FullServiceName(stackPrefix, short)
		action := "detach"
		if item.Attach {
			action = "attach"
		}
		msg.Line(fmt.Sprintf("plan %s: %s %s on %s", short, action, svc, netName))
		if dryRun {
			msg.Line("dry-run: would " + action + " " + svc)
			continue
		}
		if apiClient == nil {
			return fmt.Errorf("service network membership: nil API client")
		}
		if err := docker.EnsureServiceNetwork(ctx, apiClient, svc, netName, item.Attach, item.Aliases...); err != nil {
			return fmt.Errorf("%s network membership: %w", short, err)
		}
		msg.Line(action + "ed " + svc + " ↔ " + netName)
	}
	return nil
}

// ApplyLabeledNetworkMemberships is the single runtime network-ensure path.
// Walks fragments for eip.network.attach / detach (and optional attach.when).
//
// attach: on when the network is in the active fragment set AND attach.when (if set) passes.
// detach: always off.
//
// Idempotent. Does not touch capacity, Traefik ports, file-configs, or Grafana path labels.
func ApplyLabeledNetworkMemberships(ctx context.Context, cfg Config, home, stackPrefix string, dryRun bool) error {
	if stackPrefix == "" {
		stackPrefix = kit.StackName
	}
	scanDocs, activeDocs, err := loadNetworkMembershipDocs(home, cfg.Addons.Observability.Enabled)
	if err != nil {
		return err
	}
	items, err := collectLabeledNetworkMemberships(cfg, scanDocs, activeDocs)
	if err != nil {
		return err
	}
	if len(items) == 0 {
		msg.Line("network membership: no eip.network.attach/detach labels")
		return nil
	}

	if dryRun {
		return ApplyServiceNetworkMemberships(ctx, nil, stackPrefix, true, items...)
	}
	apiClient, err := docker.NewAPIClient(client.WithTimeout(2 * time.Minute))
	if err != nil {
		return fmt.Errorf("network membership: engine API client: %w", err)
	}
	defer apiClient.Close()
	return ApplyServiceNetworkMemberships(ctx, apiClient, stackPrefix, false, items...)
}

func loadNetworkMembershipDocs(home string, obsEnabled bool) (scan, active []stack.Doc, err error) {
	dataPath := filepath.Join(home, kit.DataStackFile)
	dataDoc, err := stack.Load(dataPath)
	if err != nil {
		return nil, nil, err
	}
	appPath := filepath.Join(home, kit.AppStackFile)
	appDoc, err := stack.Load(appPath)
	if err != nil {
		return nil, nil, err
	}
	scan = []stack.Doc{dataDoc, appDoc}
	active = []stack.Doc{dataDoc, appDoc}

	obsPath := filepath.Join(home, kit.ObsStackFile)
	if _, statErr := os.Stat(obsPath); statErr != nil {
		if obsEnabled {
			return nil, nil, fmt.Errorf("network membership: missing %s", kit.ObsStackFile)
		}
		return scan, active, nil
	}
	obsDoc, err := stack.Load(obsPath)
	if err != nil {
		return nil, nil, err
	}
	scan = append(scan, obsDoc)
	if obsEnabled {
		active = append(active, obsDoc)
	}
	return scan, active, nil
}

func collectLabeledNetworkMemberships(cfg Config, scanDocs, activeDocs []stack.Doc) ([]ServiceNetworkMembership, error) {
	type seenKey struct{ short, net string }
	seen := map[seenKey]bool{}
	var items []ServiceNetworkMembership
	allDocs := append(append([]stack.Doc{}, activeDocs...), scanDocs...)

	for _, doc := range scanDocs {
		for short := range doc.Services {
			short = strings.TrimSpace(short)
			if detachCSV, ok := stack.ServiceDeployLabel(doc, short, stack.LabelNetworkDetach); ok {
				for _, ref := range splitNetworkRefs(detachCSV) {
					netName, err := stack.ResolveNetworkRef(ref, allDocs...)
					if err != nil {
						netName = ref
					}
					k := seenKey{short, netName}
					if seen[k] {
						continue
					}
					seen[k] = true
					items = append(items, ServiceNetworkMembership{
						ServiceShort: short,
						NetworkName:  netName,
						Attach:       false,
					})
				}
			}
			if attachCSV, ok := stack.ServiceDeployLabel(doc, short, stack.LabelNetworkAttach); ok {
				when, _ := stack.ServiceDeployLabel(doc, short, stack.LabelNetworkAttachWhen)
				whenOK, err := evalAttachWhen(cfg, when)
				if err != nil {
					return nil, fmt.Errorf("services.%s: %w", short, err)
				}
				for _, ref := range splitNetworkRefs(attachCSV) {
					netName, resErr := stack.ResolveNetworkRef(ref, activeDocs...)
					inActive := resErr == nil
					if !inActive {
						netName = ref
					}
					attach := whenOK && inActive
					k := seenKey{short, netName}
					if seen[k] {
						continue
					}
					seen[k] = true
					item := ServiceNetworkMembership{
						ServiceShort: short,
						NetworkName:  netName,
						Attach:       attach,
					}
					if attach {
						item.Aliases = []string{short}
					}
					items = append(items, item)
				}
			}
		}
	}
	return items, nil
}

// evalAttachWhen interprets eip.network.attach.when. Empty = no extra gate.
func evalAttachWhen(cfg Config, when string) (bool, error) {
	when = strings.TrimSpace(when)
	if when == "" {
		return true, nil
	}
	switch strings.ToLower(when) {
	case "observability", "obs", "addons.observability.enabled":
		return cfg.Addons.Observability.Enabled, nil
	case "grafana.public", "addons.observability.grafana.public":
		return cfg.Addons.Observability.Grafana.Public, nil
	default:
		return false, fmt.Errorf("unknown %s %q (want observability|grafana.public)", stack.LabelNetworkAttachWhen, when)
	}
}

func splitNetworkRefs(csv string) []string {
	parts := strings.Split(csv, ",")
	out := make([]string, 0, len(parts))
	for _, p := range parts {
		p = strings.TrimSpace(p)
		if p != "" {
			out = append(out, p)
		}
	}
	return out
}
