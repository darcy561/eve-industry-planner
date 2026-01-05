package esi

// MarketLocation represents a market trading hub with its region and station IDs.
type MarketLocation struct {
	ID        string `json:"id"`
	Name      string `json:"name"`
	RegionID  int32  `json:"region_id"`
	StationID int64  `json:"station_id"`
}

// DefaultMarketLocations contains the default market trading hubs to track.
var DefaultMarketLocations = []MarketLocation{
	{ID: "jita", Name: "Jita", RegionID: 10000002, StationID: 60003760},
	{ID: "amarr", Name: "Amarr", RegionID: 10000043, StationID: 60008494},
	{ID: "dodixie", Name: "Dodixie", RegionID: 10000032, StationID: 60011866},
	{ID: "hek", Name: "Hek", RegionID: 10000042, StationID: 60005686},
}
