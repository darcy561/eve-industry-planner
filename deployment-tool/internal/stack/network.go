package stack

import (
	"fmt"
	"strings"
)

// Deploy labels for runtime network ensure (SoT = fragment YAML).
// Values of attach/detach are Docker network names (prefer x-net-* anchors).
// Go never invents network name strings — only these label keys.
const (
	LabelNetworkAttach     = "eip.network.attach"      // network name(s), CSV ok
	LabelNetworkAttachWhen = "eip.network.attach.when" // optional config gate (see config.evalAttachWhen)
	LabelNetworkDetach     = "eip.network.detach"      // always ensure detached; CSV ok
)

// NetworkName returns the Docker/Swarm network name for networks.<key> in doc.
func NetworkName(doc Doc, key string) (string, error) {
	key = strings.TrimSpace(key)
	if key == "" {
		return "", fmt.Errorf("stack: empty network key")
	}
	net, ok := doc.Networks[key]
	if !ok {
		return "", fmt.Errorf("stack: networks.%s not defined", key)
	}
	return ResourceName(key, net.Name), nil
}

// ResolveNetworkRef finds a network in docs by compose key or Docker name.
// ref comes from fragment labels / YAML anchors (e.g. eip-obs), not from Go consts.
func ResolveNetworkRef(ref string, docs ...Doc) (string, error) {
	ref = strings.TrimSpace(ref)
	if ref == "" {
		return "", fmt.Errorf("stack: empty network ref")
	}
	for _, doc := range docs {
		if _, ok := doc.Networks[ref]; ok {
			return NetworkName(doc, ref)
		}
		for key, net := range doc.Networks {
			if ResourceName(key, net.Name) == ref {
				return ResourceName(key, net.Name), nil
			}
		}
	}
	return "", fmt.Errorf("stack: network %q not defined in any fragment", ref)
}

// ServiceDeployLabel returns services.<short> deploy label value.
func ServiceDeployLabel(doc Doc, short, labelKey string) (string, bool) {
	svc, ok := doc.Services[strings.TrimSpace(short)]
	if !ok || svc.Deploy.Labels == nil {
		return "", false
	}
	v := strings.TrimSpace(svc.Deploy.Labels[strings.TrimSpace(labelKey)])
	if v == "" {
		return "", false
	}
	return v, true
}

// HasService reports whether services.<short> exists in doc.
func HasService(doc Doc, short string) bool {
	_, ok := doc.Services[strings.TrimSpace(short)]
	return ok
}
