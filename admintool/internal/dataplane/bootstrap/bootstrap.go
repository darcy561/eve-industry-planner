// Package bootstrap holds embedded data-plane setup scripts (eip init).
package bootstrap

import _ "embed"

//go:embed mongo-setup.sh
var mongoSetupScript []byte

// MongoSetup returns a copy of the embedded mongo-setup.sh bytes.
func MongoSetup() []byte {
	return append([]byte(nil), mongoSetupScript...)
}
