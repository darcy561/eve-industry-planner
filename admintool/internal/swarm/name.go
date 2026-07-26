// Package swarm names content-hashed Swarm configs/secrets and syncs them
// (eip_<key>_<12-hex>). Secrets/configs attach lists come from stack YAML.
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
