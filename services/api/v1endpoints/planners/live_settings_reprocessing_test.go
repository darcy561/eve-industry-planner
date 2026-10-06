package planners

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"slices"
	"testing"
	"time"

	"eve-industry-planner/shared/models/planner"
	"eve-industry-planner/testing/mongolive"

	"go.mongodb.org/mongo-driver/v2/bson"
)

func TestLive_putPlannerSettings_savesTheReprocessingSettingsTheSPASends(t *testing.T) {
	mongo := mongolive.Require(t)
	ctx, cancel := context.WithTimeout(context.Background(), time.Minute)
	defer cancel()

	handlers, _, _ := settingsHandlers(t, mongo)
	owner := seedMarketPlanner(t, mongo, "eip-parity-settings-reprocessing")

	body := `{"reprocessingSettings":{"compressedOre":"avoid","countLeftoversAsSold":true,
		"buyOutright":false,"shipping":{"mode":"perVolume","amount":0},"neverChoose":[1230,62516]}}`

	rec := httptest.NewRecorder()
	handlers.PutPlannerSettingsHandler(rec,
		asAccountJSON(t, marketSettingsAccount, http.MethodPut,
			"/api/v1/planners/"+owner.Key()+"/settings", json.RawMessage(body)),
		owner.Key())
	if rec.Code != http.StatusOK {
		t.Fatalf("code = %d, want 200 (body %s)", rec.Code, rec.Body.String())
	}

	stored, _, err := mongo.LoadPlannerSettings(ctx, owner)
	if err != nil {
		t.Fatalf("read the settings back: %v", err)
	}
	got := stored.ReprocessingSettings
	if got.CompressedOre != planner.CompressedOreAvoid || !got.CountLeftoversAsSold || got.BuyOutright ||
		got.Shipping.Mode != planner.ShippingPerVolume || !slices.Equal(got.NeverChoose, []int{1230, 62516}) {
		t.Fatalf("stored %+v, want what was sent", got)
	}

	var raw bson.M
	if err := mongo.PlannerSettings.Collection().FindOne(ctx, bson.M{"_id": owner.Key()}).Decode(&raw); err != nil {
		t.Fatalf("read the raw document: %v", err)
	}
	reprocessing, _ := raw["reprocessingSettings"].(bson.M)
	if _, present := reprocessing["buyOutright"]; present {
		t.Errorf("stored %v, want buyOutright left out while off", reprocessing)
	}
	if shipping, _ := reprocessing["shipping"].(bson.M); shipping["amount"] != nil {
		t.Errorf("stored shipping %v, want the amount left out at zero", shipping)
	}
}
