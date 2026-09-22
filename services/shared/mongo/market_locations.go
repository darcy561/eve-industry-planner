package mongo

import (
	"context"
	"fmt"
	"time"

	"eve-industry-planner/shared/logs"
	"eve-industry-planner/shared/models"
)

// MarketLocationsForAccount is every market one account may price against: its
// own, plus the ones each planner it holds a membership for has shared.
//
// The union is composed here rather than by the client. The rule for collapsing
// two rows that name one place, and for which owner wins when they disagree, is
// `models.ComposeMarketLocations` — and it exists once, on the side that already
// reads every document it needs.
//
// A planner with no settings document is left out rather than failing the whole
// answer: a reader whose corporation has never been configured still prices
// against their own markets, which is what they could do before any of this.
// That is the ordinary case and says nothing.
//
// A planner whose settings could not be *read* is left out too, and says
// something: an organisation's markets going quietly missing from every answer
// is the failure this project exists to stop happening to one citadel, so it is
// reported rather than folded in with the planners nobody has set up.
func (m *Mongo) MarketLocationsForAccount(ctx context.Context, accountID string, now time.Time) (models.MarketLocations, error) {
	if m == nil {
		return nil, fmt.Errorf("MarketLocationsForAccount: mongo handle is required")
	}
	if accountID == "" {
		return nil, fmt.Errorf("MarketLocationsForAccount: account id is required")
	}

	settings, err := m.LoadApplicationSettings(ctx, accountID, now)
	if err != nil {
		return nil, fmt.Errorf("read application settings for %s: %w", accountID, err)
	}

	listings, err := m.PlannersForAccount(ctx, accountID)
	if err != nil {
		return nil, fmt.Errorf("list planners for %s: %w", accountID, err)
	}

	shared := make([]models.SharedMarketLocations, 0, len(listings))
	for _, listing := range listings {
		plannerSettings, seeded, err := m.LoadPlannerSettings(ctx, listing.Owner)
		if err != nil {
			logs.WarnCtx(ctx, "market locations: planner settings unreadable",
				"account_id", accountID, "owner", listing.Owner.Key(), "error", err)
			continue
		}
		if !seeded {
			continue
		}
		if len(plannerSettings.MarketLocations) == 0 {
			continue
		}
		shared = append(shared, models.SharedMarketLocations{
			Owner:     listing.Owner,
			Locations: plannerSettings.MarketLocations,
		})
	}

	return models.ComposeMarketLocations(settings.MarketLocations, shared), nil
}
