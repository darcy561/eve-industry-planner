package conversion

// GenerateSolarSystemsOutput names every solar system, keyed by its id.
//
// A system name never changes and the set is complete, so the SPA reads the whole
// file rather than resolving ids one at a time: the panels that label a job's
// system want a name without waiting, and the system picker needs the full list
// to offer. Neither is answerable from a demand-driven lookup.
func GenerateSolarSystemsOutput(solarSystemsMap map[string]any) map[string]string {
	systems := make(map[string]string, len(solarSystemsMap))

	for key, value := range solarSystemsMap {
		row, ok := value.(map[string]any)
		if !ok {
			continue
		}
		name, ok := localisedName(row)
		if !ok {
			continue
		}
		systems[key] = name
	}

	return systems
}
