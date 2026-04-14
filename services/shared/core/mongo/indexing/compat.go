package indexing

import (
	"errors"
	"strings"

	"go.mongodb.org/mongo-driver/mongo"
)

// isMongoIndexAlreadyCompatible reports whether CreateIndex failed only because an equivalent
// index already exists (safe to ignore on EnsureIndexes-style idempotent setup).
func isMongoIndexAlreadyCompatible(err error) bool {
	if err == nil {
		return false
	}
	var cmdErr mongo.CommandError
	if errors.As(err, &cmdErr) {
		if cmdErr.Code == 85 || cmdErr.Code == 86 {
			return true
		}
	}
	msg := strings.ToLower(err.Error())
	return strings.Contains(msg, "already exists") || strings.Contains(msg, "duplicate key")
}
