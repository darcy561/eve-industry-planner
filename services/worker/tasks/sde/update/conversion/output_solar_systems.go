package conversion

import "math"

// Security bands a system can be in, named as both languages name them.
const (
	SecurityBandHigh = "hiSec"
	SecurityBandLow  = "lowSec"
	SecurityBandNull = "nullSec"
)

// Solar system id ranges a structure can be anchored in, from EVE's published id
// ranges. Industry happens in New Eden and in wormhole space; abyssal deadspace,
// void and the internal ranges hold no structures, so a job could never run there.
//
// See https://developers.eveonline.com/docs/guides/id-ranges/
var industrySystemRanges = [][2]int{
	{30000000, 30999999},
	{31000000, 31999999},
}

// systemTakesIndustry answers whether a system is one a job can run in, by the
// range its id falls in. An id outside every range here is left out rather than
// assumed to be a place, so a range the game adds is offered once it is named
// here and not before.
func systemTakesIndustry(id int) bool {
	for _, within := range industrySystemRanges {
		if id >= within[0] && id <= within[1] {
			return true
		}
	}
	return false
}

// SolarSystemOutput is what the SPA holds about one solar system.
type SolarSystemOutput struct {
	Name     string `json:"name"`
	Security string `json:"security"`
}

// securityBandFor names the band a security status puts a system in, read from
// the figure the game rounds it to rather than the raw value.
func securityBandFor(securityStatus float64) string {
	rounded := math.Round(securityStatus*10) / 10

	switch {
	case rounded >= 0.5:
		return SecurityBandHigh
	case rounded > 0:
		return SecurityBandLow
	default:
		return SecurityBandNull
	}
}

// GenerateSolarSystemsOutput names every solar system a job can run in and the
// security band it is in, keyed by its id.
//
// A system name never changes and the set is complete, so the SPA reads the whole
// file rather than resolving ids one at a time: the panels that label a job's
// system want a name without waiting, and the system picker needs the full list
// to offer. Neither is answerable from a demand-driven lookup. The band rides
// with the name because choosing a system is what settles a setup's band. Only
// the ranges industry happens in are written, so the picker cannot offer a system
// no structure can be anchored in.
func GenerateSolarSystemsOutput(solarSystemsMap map[string]any) map[string]SolarSystemOutput {
	systems := make(map[string]SolarSystemOutput, len(solarSystemsMap))

	for key, value := range solarSystemsMap {
		row, ok := value.(map[string]any)
		if !ok {
			continue
		}
		id, ok := parseSDETypeID(key)
		if !ok || !systemTakesIndustry(id) {
			continue
		}
		name, ok := localisedName(row)
		if !ok {
			continue
		}
		security, _ := float64FromJSON(row["securityStatus"])
		systems[key] = SolarSystemOutput{
			Name:     name,
			Security: securityBandFor(security),
		}
	}

	return systems
}
