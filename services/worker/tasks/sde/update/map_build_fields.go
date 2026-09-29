package update

import "eve-industry-planner/worker/tasks/sde/update/conversion"

// The SDE ships far more per row than the conversion reads. types.jsonl is
// ~150MB of the ~190MB extract, and most of that is the `description` blob and
// eight locales of `name` where only English is ever published. Parsing those
// into map[string]any and holding them for the whole conversion is what sets the
// task's peak memory, so each file names the keys it actually needs and the rest
// are dropped as the row is read.
//
// A file absent from this table keeps every key. blueprints.jsonl is deliberately
// absent: its `activities` sub-objects are stored by reference and marshalled
// verbatim into output/recipeList.json, so dropping an unread key there would
// change published output.
var mapBuildFields = map[string][]string{
	"types.jsonl": {
		"_key", "published", "name", "marketGroupID", "groupID",
		"metaGroupID", "raceID", "factionID", "volume", "basePrice", "graphicID",
		"portionSize",
	},
	"typeDogma.jsonl":       {"_key", "dogmaAttributes", "dogmaEffects"},
	"mapSolarSystems.jsonl": {"_key", "name"},
	"marketGroups.jsonl":    {"_key", "name", "parentGroupID"},
	"groups.jsonl":          {"_key", "categoryID"},
	"dogmaAttributes.jsonl": {"_key", "name", "description"},
	"dogmaEffects.jsonl":    {"_key", "modifierInfo"},
	// The reprocessing conversion ranges every value of the row rather than naming
	// "materials", so randomizedMaterials (10 rows) contributes to output too.
	"typeMaterials.jsonl": {"_key", "materials", "randomizedMaterials"},
}

// localisedNameFiles names the files whose `name` is an object of translations.
// Only OutputLocale is published, so the other locales are dropped with the rest
// of the unread data. dogmaAttributes.jsonl is absent on purpose: its `name` is
// a plain string, not a locale object.
var localisedNameFiles = map[string]struct{}{
	"types.jsonl":           {},
	"mapSolarSystems.jsonl": {},
	"marketGroups.jsonl":    {},
}

// keepFieldsFor returns the allowlist for a file, and whether one exists.
func keepFieldsFor(filename string) (map[string]struct{}, bool) {
	fields, ok := mapBuildFields[filename]
	if !ok {
		return nil, false
	}
	keep := make(map[string]struct{}, len(fields))
	for _, f := range fields {
		keep[f] = struct{}{}
	}
	return keep, true
}

// publishedLocaleOnly reduces a row's locale object to the one translation the
// conversion publishes. A row carries eight languages and types.jsonl has ~53000
// of them, so the seven that are never read are a large share of the parsed heap.
//
// A name that is not a locale object is returned untouched, so a file whose name
// is a plain string is unaffected if one is ever added to localisedNameFiles.
func publishedLocaleOnly(name any) any {
	nameObj, ok := name.(map[string]any)
	if !ok {
		return name
	}
	published, ok := nameObj[conversion.OutputLocale]
	if !ok {
		return name
	}
	return map[string]any{conversion.OutputLocale: published}
}
