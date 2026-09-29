package conversion

import (
	"regexp"
	"sort"
	"strconv"
	"strings"
)

// IndustryFamily is one of the item families the game groups industry bonuses by.
type IndustryFamily struct {
	ID          int    `json:"id"`
	Name        string `json:"name"`
	CategoryIDs []int  `json:"categoryIDs,omitempty"`
	GroupIDs    []int  `json:"groupIDs,omitempty"`
}

// IndustryBonus is what one source gives, on one activity and axis, to one family
// of items. A family of zero is every item.
type IndustryBonus struct {
	Activity string  `json:"activity"`
	Axis     string  `json:"axis"`
	FamilyID int     `json:"familyID,omitzero"`
	Family   string  `json:"family,omitzero"`
	Value    float64 `json:"value"`
}

// IndustryBonusSource is a structure or a rig as the game publishes it: what it
// helps, by how much, and how its bonus scales with security.
type IndustryBonusSource struct {
	ID       int                `json:"id"`
	Label    string             `json:"label"`
	Kind     string             `json:"kind"`
	GroupID  int                `json:"groupID,omitzero"`
	Size     int                `json:"size,omitzero"`
	Security map[string]float64 `json:"security,omitempty"`
	Bonuses  []IndustryBonus    `json:"bonuses"`
}

// IndustryBonusCatalogue is everything the game publishes an industry bonus for,
// beside the item families those bonuses are scoped to.
type IndustryBonusCatalogue struct {
	Families map[string]*IndustryFamily      `json:"families"`
	Sources  map[string]*IndustryBonusSource `json:"sources"`
}

const (
	hiSecModifierAttribute   = 2355
	lowSecModifierAttribute  = 2356
	nullSecModifierAttribute = 2357
	rigSizeAttribute         = 1547

	structureCategoryID       = 65
	structureModuleCategoryID = 66
	outpostConversionRigGroup = 1984

	refiningYieldAttribute = 717
	baseRefiningYield      = 50.0
)

// Kinds of thing that carry an industry bonus, which decide what a picker offers.
const (
	IndustryKindStructure  = "structure"
	IndustryKindRig        = "rig"
	IndustryKindOutpostRig = "outpostRig"
)

// securityBandAttributes names each published security modifier.
var securityBandAttributes = map[string]int{
	"hiSec":   hiSecModifierAttribute,
	"lowSec":  lowSecModifierAttribute,
	"nullSec": nullSecModifierAttribute,
}

// industryActivities and industryAxes are read in a fixed order, so one SDE build
// produces one catalogue.
var (
	industryActivities = []string{
		"manufacturing", "reaction", "invention",
		"copying", "researchMaterial", "researchTime",
	}
	industryAxes = []string{"material", "time", "cost"}
)

// rigSetPrefix matches the part of a rig's name that repeats the structure size,
// which the reader already chose before they see the list.
var rigSetPrefix = regexp.MustCompile(`^Standup (?:M|L|XL)-Set `)

// activityWord matches the activity a rig's name repeats, which the kind of job
// being planned already settles.
var activityWord = regexp.MustCompile(` (?:Manufacturing|Reaction) `)

// GenerateIndustryBonusesOutput builds the bonus catalogue from the game's own
// industry tables, so the app reads which items a bonus helps rather than guessing.
func GenerateIndustryBonusesOutput(
	typesData map[string]any,
	groupsData map[string]any,
	typeDogmaData map[string]any,
	dogmaEffectsData map[string]any,
	modifierSourcesData map[string]any,
	targetFiltersData map[string]any,
) *IndustryBonusCatalogue {
	catalogue := &IndustryBonusCatalogue{
		Families: buildIndustryFamilies(targetFiltersData),
		Sources:  map[string]*IndustryBonusSource{},
	}
	categoryByGroup := BuildCategoryByGroupID(groupsData)

	for key, raw := range modifierSourcesData {
		source, ok := raw.(map[string]any)
		if !ok {
			continue
		}
		dogma, ok := typeDogmaData[key].(map[string]any)
		if !ok {
			continue
		}
		typeRow, _ := typesData[key].(map[string]any)

		id, _ := strconv.Atoi(key)
		entry := &IndustryBonusSource{
			ID:       id,
			Label:    industryBonusLabel(typeRow),
			Kind:     industryKindFor(typeRow, categoryByGroup),
			GroupID:  intFromJSON(typeRow["groupID"]),
			Size:     int(dogmaAttributeValue(dogma, rigSizeAttribute)),
			Security: securityForSource(dogma),
			Bonuses:  bonusesForSource(source, dogma, dogmaEffectsData),
		}
		if entry.Label == "" || entry.Kind == "" || len(entry.Bonuses) == 0 {
			continue
		}
		catalogue.Sources[key] = entry
	}
	addReprocessingRigs(catalogue, typesData, groupsData, typeDogmaData, categoryByGroup)
	return catalogue
}

// addReprocessingRigs catalogues the rigs whose bonus the game publishes as a
// refining yield rather than through the industry tables.
func addReprocessingRigs(
	catalogue *IndustryBonusCatalogue,
	typesData map[string]any,
	groupsData map[string]any,
	typeDogmaData map[string]any,
	categoryByGroup map[int]int,
) {
	for key, raw := range typeDogmaData {
		if _, held := catalogue.Sources[key]; held {
			continue
		}
		dogma, ok := raw.(map[string]any)
		if !ok {
			continue
		}
		yield, held := dogmaAttributeIfHeld(dogma, refiningYieldAttribute)
		if !held || yield*100 <= baseRefiningYield {
			continue
		}
		typeRow, _ := typesData[key].(map[string]any)
		if industryKindFor(typeRow, categoryByGroup) != IndustryKindRig {
			continue
		}
		if published, _ := typeRow["published"].(bool); !published {
			continue
		}

		id, _ := strconv.Atoi(key)
		groupID := intFromJSON(typeRow["groupID"])
		catalogue.Sources[key] = &IndustryBonusSource{
			ID:       id,
			Label:    industryBonusLabel(typeRow),
			Kind:     IndustryKindRig,
			GroupID:  groupID,
			Size:     int(dogmaAttributeValue(dogma, rigSizeAttribute)),
			Security: securityForSource(dogma),
			Bonuses: []IndustryBonus{{
				Activity: "reprocessing",
				Axis:     "value",
				Value:    yield*100 - baseRefiningYield,
				Family:   reprocessingFamilyName(groupsData, groupID),
			}},
		}
	}
}

// reprocessingFamilyName is the ore a reprocessing rig helps, as its own group
// names it.
func reprocessingFamilyName(groupsData map[string]any, groupID int) string {
	group, ok := groupsData[strconv.Itoa(groupID)].(map[string]any)
	if !ok {
		return ""
	}
	name, held := localisedName(group)
	if !held {
		return ""
	}
	return name
}

// buildIndustryFamilies reads the item families the game scopes industry bonuses
// by.
func buildIndustryFamilies(targetFiltersData map[string]any) map[string]*IndustryFamily {
	families := make(map[string]*IndustryFamily, len(targetFiltersData))
	for key, raw := range targetFiltersData {
		row, ok := raw.(map[string]any)
		if !ok {
			continue
		}
		id, _ := strconv.Atoi(key)
		name, _ := row["name"].(string)
		families[key] = &IndustryFamily{
			ID:          id,
			Name:        name,
			CategoryIDs: intsFromJSON(row["categoryIDs"]),
			GroupIDs:    intsFromJSON(row["groupIDs"]),
		}
	}
	return families
}

// industryKindFor says what sort of thing carries the bonus, from the category
// its type belongs to.
func industryKindFor(typeRow map[string]any, categoryByGroup map[int]int) string {
	if typeRow == nil {
		return ""
	}
	groupID := intFromJSON(typeRow["groupID"])
	switch categoryByGroup[groupID] {
	case structureCategoryID:
		return IndustryKindStructure
	case structureModuleCategoryID:
		if groupID == outpostConversionRigGroup {
			return IndustryKindOutpostRig
		}
		return IndustryKindRig
	default:
		return ""
	}
}

// figureAttributesFor resolves which attribute supplies each figure the industry
// tables name for one type.
func figureAttributesFor(dogma map[string]any, dogmaEffectsData map[string]any) map[int]int {
	supplying := map[int]int{}
	for _, entry := range sliceFromJSON(dogma["dogmaEffects"]) {
		row, ok := entry.(map[string]any)
		if !ok {
			continue
		}
		effect, ok := dogmaEffectsData[strconv.Itoa(intFromJSON(row["effectID"]))].(map[string]any)
		if !ok {
			continue
		}
		for _, info := range sliceFromJSON(effect["modifierInfo"]) {
			modifier, ok := info.(map[string]any)
			if !ok {
				continue
			}
			named := intFromJSON(modifier["modifiedAttributeID"])
			from := intFromJSON(modifier["modifyingAttributeID"])
			if named == 0 || from == 0 {
				continue
			}
			supplying[named] = from
		}
	}
	return supplying
}

// bonusesForSource reads every bonus one source gives, on every activity it
// carries.
func bonusesForSource(source map[string]any, dogma map[string]any, dogmaEffectsData map[string]any) []IndustryBonus {
	supplying := figureAttributesFor(dogma, dogmaEffectsData)
	var bonuses []IndustryBonus

	for _, activity := range industryActivities {
		axes, ok := source[activity].(map[string]any)
		if !ok {
			continue
		}
		for _, axis := range industryAxes {
			for _, entry := range sliceFromJSON(axes[axis]) {
				row, ok := entry.(map[string]any)
				if !ok {
					continue
				}
				value, held := figureFor(dogma, supplying, intFromJSON(row["dogmaAttributeID"]))
				if !held || value == 0 {
					continue
				}
				bonuses = append(bonuses, IndustryBonus{
					Activity: activity,
					Axis:     axis,
					FamilyID: intFromJSON(row["filterID"]),
					Value:    -value,
				})
			}
		}
	}

	sort.Slice(bonuses, func(a, b int) bool {
		if bonuses[a].Activity != bonuses[b].Activity {
			return bonuses[a].Activity < bonuses[b].Activity
		}
		if bonuses[a].Axis != bonuses[b].Axis {
			return bonuses[a].Axis < bonuses[b].Axis
		}
		return bonuses[a].FamilyID < bonuses[b].FamilyID
	})
	return bonuses
}

// figureFor reads the figure behind an attribute the industry tables name, which
// a type either carries itself or reaches through one of its own effects.
func figureFor(dogma map[string]any, supplying map[int]int, named int) (float64, bool) {
	if value, held := dogmaAttributeIfHeld(dogma, named); held {
		return value, true
	}
	from, known := supplying[named]
	if !known {
		return 0, false
	}
	return dogmaAttributeIfHeld(dogma, from)
}

// securityForSource reads the multipliers a bonus is scaled by, per band.
func securityForSource(dogma map[string]any) map[string]float64 {
	security := map[string]float64{}
	for band, attribute := range securityBandAttributes {
		value, held := dogmaAttributeIfHeld(dogma, attribute)
		if !held {
			continue
		}
		security[band] = value
	}
	if len(security) == 0 {
		return nil
	}
	return security
}

// industryBonusLabel is a name without the structure size and the activity, both
// of which a reader has already chosen before they see the list.
func industryBonusLabel(typeRow map[string]any) string {
	name, held := localisedName(typeRow)
	if !held {
		return ""
	}
	name = rigSetPrefix.ReplaceAllString(name, "")
	name = activityWord.ReplaceAllString(name, " ")
	return strings.TrimSpace(name)
}

func dogmaAttributeValue(dogma map[string]any, attribute int) float64 {
	value, _ := dogmaAttributeIfHeld(dogma, attribute)
	return value
}

func dogmaAttributeIfHeld(dogma map[string]any, attribute int) (float64, bool) {
	for _, entry := range sliceFromJSON(dogma["dogmaAttributes"]) {
		row, ok := entry.(map[string]any)
		if !ok {
			continue
		}
		if intFromJSON(row["attributeID"]) != attribute {
			continue
		}
		value, _ := float64FromJSON(row["value"])
		return value, true
	}
	return 0, false
}

func sliceFromJSON(value any) []any {
	entries, _ := value.([]any)
	return entries
}

func intFromJSON(value any) int {
	number, _ := parseSDETypeID(value)
	return number
}

func intsFromJSON(value any) []int {
	entries := sliceFromJSON(value)
	if len(entries) == 0 {
		return nil
	}
	out := make([]int, 0, len(entries))
	for _, entry := range entries {
		out = append(out, intFromJSON(entry))
	}
	return out
}
