package v1endpoints

import (
	"bytes"
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strconv"
	"testing"

	"eve-industry-planner/api/apideps"
	esitypes "eve-industry-planner/shared/core/esi/types"
	eipredis "eve-industry-planner/shared/redis"
	"eve-industry-planner/testing/redisfake"
)

const (
	heldSystem  = 30045352
	quietSystem = 30000142
	caldari     = 500001
)

func systemIndexHandler(t *testing.T) (*Handlers, *eipredis.Redis) {
	t.Helper()
	redis := eipredis.NewRedis(redisfake.New(t).Client)
	return New(&apideps.Deps{Redis: redis}), redis
}

func seedSystemIndex(t *testing.T, redis *eipredis.Redis, systemID int32, manufacturing float64) {
	t.Helper()
	err := redis.Cache(eipredis.DatasetIndustrySystems).PutEntry(context.Background(), systemID,
		esitypes.SystemIndexes{SolarSystemID: systemID, Manufacturing: manufacturing})
	if err != nil {
		t.Fatalf("seed the system index: %v", err)
	}
}

func seedMilitiaHolding(t *testing.T, redis *eipredis.Redis, systemID, factionID int32) {
	t.Helper()
	err := redis.Cache(eipredis.DatasetMilitiaSystems).PutEntry(context.Background(), systemID,
		esitypes.MilitiaSystem{SolarSystemID: systemID, OwnerFactionID: factionID})
	if err != nil {
		t.Fatalf("seed the militia holding: %v", err)
	}
}

func askForSystems(t *testing.T, h *Handlers, systemIDs ...int32) map[string]esitypes.SystemIndexes {
	t.Helper()
	ids := make([]string, 0, len(systemIDs))
	for _, id := range systemIDs {
		ids = append(ids, strconv.Itoa(int(id)))
	}
	encoded, err := json.Marshal(SystemIndexesBody{RequestedIDs: ids})
	if err != nil {
		t.Fatalf("encode the request: %v", err)
	}

	rec := httptest.NewRecorder()
	h.SystemIndexesHandler(rec, httptest.NewRequest(
		http.MethodPost, "/api/v1/systemindexes/query", bytes.NewReader(encoded)))

	if rec.Code != http.StatusOK {
		t.Fatalf("the handler answered %d: %s", rec.Code, rec.Body.String())
	}
	var got map[string]esitypes.SystemIndexes
	if err := json.Unmarshal(rec.Body.Bytes(), &got); err != nil {
		t.Fatalf("decode the response: %v (body %s)", err, rec.Body.String())
	}
	return got
}

func TestASystemCarriesTheMilitiaHoldingItBesideItsIndex(t *testing.T) {
	h, redis := systemIndexHandler(t)
	seedSystemIndex(t, redis, heldSystem, 0.05)
	seedMilitiaHolding(t, redis, heldSystem, caldari)

	got := askForSystems(t, h, heldSystem)

	row := got[strconv.Itoa(heldSystem)]
	if row.MilitiaFactionID != caldari {
		t.Errorf("the system reports militia %d, want %d", row.MilitiaFactionID, caldari)
	}
	if row.Manufacturing != 0.05 {
		t.Errorf("the militia merge lost the cost index: %v", row)
	}
}

func TestASystemNoMilitiaHoldsReportsNone(t *testing.T) {
	h, redis := systemIndexHandler(t)
	seedSystemIndex(t, redis, quietSystem, 0.01)

	got := askForSystems(t, h, quietSystem)

	if row := got[strconv.Itoa(quietSystem)]; row.MilitiaFactionID != 0 {
		t.Errorf("a system nobody holds reports militia %d", row.MilitiaFactionID)
	}
}

func TestOnlyTheHeldSystemsOfAnAskCarryAMilitia(t *testing.T) {
	h, redis := systemIndexHandler(t)
	seedSystemIndex(t, redis, heldSystem, 0.05)
	seedSystemIndex(t, redis, quietSystem, 0.01)
	seedMilitiaHolding(t, redis, heldSystem, caldari)

	got := askForSystems(t, h, heldSystem, quietSystem)

	if got[strconv.Itoa(heldSystem)].MilitiaFactionID != caldari {
		t.Error("the held system lost its militia when asked for beside another")
	}
	if got[strconv.Itoa(quietSystem)].MilitiaFactionID != 0 {
		t.Error("a militia reached a system nobody holds")
	}
}
