// Package swarm names content-hashed Swarm configs/secrets (eip_<key>_<12-hex>)
// and syncs them through the Moby Engine API (Secret*/Config*/ServiceUpdate via
// internal/docker.NewAPIClient). Attach lists come from stack YAML.
// Integration coverage: go test -tags=integration ./internal/swarm/
package swarm

import (
	"crypto/sha256"
	"encoding/hex"
	"fmt"
)

// Name returns eip_<key>_<12-hex> for content-addressed Swarm objects.
func Name(key string, data []byte) string {
	sum := sha256.Sum256(data)
	return fmt.Sprintf("eip_%s_%s", key, hex.EncodeToString(sum[:])[:12])
}
