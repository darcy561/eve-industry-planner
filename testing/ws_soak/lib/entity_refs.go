package soaklib

import (
	"fmt"
	"sync"

	"eve-industry-planner/shared/crypto/entityid"
)

// The soak harness works in numeric organisation ids because that is what a
// browser sends, but tenant keys and realtime indexes are expressed in refs.
// These convert at the same boundary the services do, so the harness exercises
// the real routing rather than a parallel scheme.
var (
	soakRefsOnce sync.Once
	soakRefs     *entityid.Cipher
	soakRefsErr  error
)

func entityRefHelper() (*entityid.Cipher, error) {
	soakRefsOnce.Do(func() {
		soakRefs, soakRefsErr = entityid.NewFromEnv()
	})
	return soakRefs, soakRefsErr
}

// CorporationRef converts a soak corporation id. It panics on failure because the
// harness cannot produce meaningful load without matching the services' routing.
func CorporationRef(id int64) string {
	h, err := entityRefHelper()
	if err != nil {
		panic(fmt.Sprintf("ws_soak: ENTITY_ID_KEY required to derive corporation refs: %v", err))
	}
	r, err := h.Corporation(id)
	if err != nil {
		panic(fmt.Sprintf("ws_soak: corporation ref for %d: %v", id, err))
	}
	return r
}

// AllianceRef converts a soak alliance id.
func AllianceRef(id int64) string {
	h, err := entityRefHelper()
	if err != nil {
		panic(fmt.Sprintf("ws_soak: ENTITY_ID_KEY required to derive alliance refs: %v", err))
	}
	r, err := h.Alliance(id)
	if err != nil {
		panic(fmt.Sprintf("ws_soak: alliance ref for %d: %v", id, err))
	}
	return r
}
