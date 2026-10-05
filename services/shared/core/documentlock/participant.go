package documentlock

import (
	"crypto/sha256"
	"encoding/hex"
)

// participantDomain separates a participant id from any other hash a session id might feed.
const participantDomain = "eip-lock-participant\x00"

// ParticipantID is how a lock names a session to everyone who can see it: a one-way digest of the
// session id, which is a credential and never leaves the server.
func ParticipantID(sessionID string) string {
	if sessionID == "" {
		return ""
	}
	sum := sha256.Sum256([]byte(participantDomain + sessionID))
	return hex.EncodeToString(sum[:16])
}
