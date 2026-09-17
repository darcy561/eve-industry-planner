// Package entitynames reads what EVE calls a corporation or an alliance.
//
// Both routes are public — no token, no scope — so this needs nothing an
// authenticated caller would have to supply, and a server can name an entity it
// has only an id for. They are unmetered too: neither discloses a rate-limit
// group, so the client learns none and the call is charged to nothing, which is
// what makes it reasonable on a request path.
package entitynames

import (
	"context"
	"eve-industry-planner/shared/jsoncodec"
	"fmt"
	"net/http"

	"eve-industry-planner/shared/esiclient"
	"eve-industry-planner/shared/httpclient"
	"eve-industry-planner/shared/models"
)

// Corporation is what the public corporation route says about one.
type Corporation struct {
	Name string
	// NPC reports one of EVE's own corporations. Read from the id rather than
	// the response, because the id answers it without a call and the two cannot
	// then disagree; the field is here so a caller has one answer to consult.
	NPC bool
}

// Alliance is what the public alliance route says about one. EVE has no NPC
// alliances, so there is nothing to report beyond the name.
type Alliance struct {
	Name string
}

type corporationBody struct {
	Name string `json:"name"`
}

type allianceBody struct {
	Name string `json:"name"`
}

// LookupCorporation reads a corporation's name.
//
// The NPC answer comes from the id and is returned whether or not the call
// succeeds for a caller that only needs to refuse: an id in EVE's reserved range
// is one of its own corporations regardless of what the route says.
func LookupCorporation(ctx context.Context, client esiclient.API, corporationID int64) (Corporation, error) {
	out := Corporation{NPC: models.IsNPCCorporation(corporationID)}
	if client == nil {
		return out, fmt.Errorf("entitynames: no ESI client")
	}
	if corporationID <= 0 {
		return out, fmt.Errorf("entitynames: corporation id %d is not an id", corporationID)
	}

	var body corporationBody
	if err := readPublic(ctx, client, fmt.Sprintf("/corporations/%d/", corporationID), &body); err != nil {
		return out, err
	}
	out.Name = body.Name
	return out, nil
}

// LookupAlliance reads an alliance's name.
func LookupAlliance(ctx context.Context, client esiclient.API, allianceID int64) (Alliance, error) {
	if client == nil {
		return Alliance{}, fmt.Errorf("entitynames: no ESI client")
	}
	if allianceID <= 0 {
		return Alliance{}, fmt.Errorf("entitynames: alliance id %d is not an id", allianceID)
	}

	var body allianceBody
	if err := readPublic(ctx, client, fmt.Sprintf("/alliances/%d/", allianceID), &body); err != nil {
		return Alliance{}, err
	}
	return Alliance{Name: body.Name}, nil
}

// readPublic makes an unauthenticated GET and decodes the body.
//
// ClassUserRequested because somebody is waiting on the answer: this runs when a
// planner is opened for the first time, not on a schedule.
func readPublic(ctx context.Context, client esiclient.API, path string, into any) error {
	resp, err := client.Do(ctx, esiclient.Request{
		Method: http.MethodGet,
		Path:   path,
		Class:  esiclient.ClassUserRequested,
		Retry:  httpclient.DefaultRetry(),
	})
	if err != nil {
		return fmt.Errorf("entitynames: read %s: %w", path, err)
	}
	if resp.Status != http.StatusOK {
		return fmt.Errorf("entitynames: read %s: status %d", path, resp.Status)
	}
	if err := jsoncodec.Unmarshal(resp.Body, into); err != nil {
		return fmt.Errorf("entitynames: decode %s: %w", path, err)
	}
	return nil
}
