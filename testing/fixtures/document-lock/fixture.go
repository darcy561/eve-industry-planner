// Package documentlockfixture carries the lock participant fixture both languages derive against.
package documentlockfixture

import _ "embed"

//go:embed participant.json
var Participant []byte
