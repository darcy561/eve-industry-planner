package soaklib

import "fmt"

// Mongo publisher: scratch writes for core changestream → NATS → WS (version B).
func newMongoPublisher() (Publisher, error) {
	return nil, fmt.Errorf("publish=mongo: not implemented yet (fan-out-core soak slice)")
}
