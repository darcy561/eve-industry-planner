package mongo

import (
	"context"
	"fmt"
	"time"

	"eve-industry-planner/shared/logs"
	"eve-industry-planner/shared/models"
)

// MarketLocationsForAccount is every market one account may price against: its own, plus the ones
// each planner it holds a membership for has shared.
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
