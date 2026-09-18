package server

import (
	"slices"
	"strings"
	"time"

	"eve-industry-planner/shared/models"
	eipmongo "eve-industry-planner/shared/mongo"
)

const docSubscribeMongoTimeout = 3 * time.Second

// docSubscribeAuthorized returns whether a connection may subscribe or
// unsubscribe to docID (collection.id).
//
// Fail-closed, and it reads nothing: an account-owned collection is authorised
// by id equality, and a planner-held one when the connection's scopes hold an
// owner whose kind delivers that collection. The scopes were derived from the
// grant ceiling at connect and narrowed by the active planner, so they already
// say who the account may read for; a bare id from a client is resolved within
// them rather than looked up, which is why the id never has to carry an owner.
func (s *Server) docSubscribeAuthorized(docID string, client *Client) bool {
	if client == nil || docID == "" || client.AccountID == "" {
		return false
	}
	parts := strings.SplitN(docID, ".", 2)
	if len(parts) != 2 || parts[0] == "" || parts[1] == "" {
		return false
	}
	collection, id := parts[0], parts[1]

	switch {
	case slices.Contains(eipmongo.AccountOwnedCollections(), collection):
		// The account owns these wherever it is working, so the id is the answer.
		return id == client.AccountID

	case slices.Contains(eipmongo.PlannerHeldCollections(), collection):
		authorised := false
		s.clientScopesSnapshot(client).Each(func(key string) {
			owner, err := models.ParseOwnerKey(key)
			if err != nil {
				return
			}
			if slices.Contains(eipmongo.CollectionsForOwnerKind(owner.Kind), collection) {
				authorised = true
			}
		})
		return authorised

	default:
		return false
	}
}
