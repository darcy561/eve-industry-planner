package archiveimport

import "strings"

// v7RemapFlatBlueprintFields mirrors Eve-Industry-Planner-Tools Release Scripts/v7-0.js
// updateOldBuildInfo(): before v7, rigType stored the rig option's **material** multiplier;
// structureTypeDisplay matched structure **label**; systemType matched system **value**.
// After remap, structureType / rigType / systemType are numeric IDs used in build.setup.
func v7RemapFlatBlueprintFields(m map[string]any) {
	jt := intFromAny(m["jobType"])
	display, _ := m["structureTypeDisplay"].(string)
	hasDisplay := strings.TrimSpace(display) != ""
	if !hasDisplay && jt != 1 && jt != 2 {
		return
	}
	if jt != 1 && jt != 2 {
		delete(m, "structureTypeDisplay")
		return
	}
	rigLegacy := float64FromAny(m["rigType"])
	sysVal := float64FromAny(m["systemType"])

	var stID, rigID, sysID int
	switch jt {
	case 1:
		stID = manufacturingStructureIDFromLabel(display)
		rigID = manufacturingRigIDFromLegacyMaterial(rigLegacy)
		sysID = manufacturingSystemIDFromLegacyValue(sysVal)
	case 2:
		stID = reactionStructureIDFromLabel(display)
		rigID = manufacturingRigIDFromLegacyMaterial(rigLegacy)
		sysID = reactionSystemIDFromLegacyValue(sysVal)
	default:
		return
	}

	m["structureType"] = stID
	m["rigType"] = rigID
	m["systemType"] = sysID
	delete(m, "structureTypeDisplay")
}

func manufacturingStructureIDFromLabel(label string) int {
	label = strings.TrimSpace(label)
	if label == "Station" {
		label = "NPC Station"
	}
	switch label {
	case "NPC Station":
		return 0
	case "Medium":
		return 1
	case "Large":
		return 2
	case "X-Large":
		return 3
	case "The Fulcrum":
		return 4
	default:
		return 0
	}
}

func reactionStructureIDFromLabel(label string) int {
	switch strings.TrimSpace(label) {
	case "Medium":
		return 0
	case "Large":
		return 1
	default:
		return 0
	}
}

// manufacturingRigIDFromLegacyMaterial matches v7-0 manRigs in object key order (first material match wins).
var manufacturingRigMaterialRows = []struct {
	id       int
	material float64
}{
	{0, 0},
	{1, 2.0},
	{2, 2.4},
	{3, 0},   // material 0, TE — same material as row 0; never chosen after id 0 in JS order
	{4, 0},   // duplicate material 0
	{5, 2.0}, // duplicate 2.0
	{6, 2.4},
	{7, 2.0},
	{8, 2.4},
}

func manufacturingRigIDFromLegacyMaterial(material float64) int {
	for _, row := range manufacturingRigMaterialRows {
		if nearlyEqual(row.material, material) {
			return row.id
		}
	}
	return 0
}

func nearlyEqual(a, b float64) bool {
	const eps = 1e-9
	d := a - b
	if d < 0 {
		d = -d
	}
	return d < eps
}

// manufacturingSystemIDFromLegacyValue: first matching row in v7 manSystem insertion order.
var manufacturingSystemValueRows = []struct {
	id    int
	value float64
}{
	{0, 1},
	{1, 1.9},
	{2, 2.1},
	{3, 1},
}

func manufacturingSystemIDFromLegacyValue(v float64) int {
	for _, row := range manufacturingSystemValueRows {
		if nearlyEqual(row.value, v) {
			return row.id
		}
	}
	return 0
}

var reactionSystemValueRows = []struct {
	id    int
	value float64
}{
	{0, 1},
	{1, 1.1},
}

func reactionSystemIDFromLegacyValue(v float64) int {
	for _, row := range reactionSystemValueRows {
		if nearlyEqual(row.value, v) {
			return row.id
		}
	}
	return 0
}

func float64FromAny(v any) float64 {
	switch x := v.(type) {
	case float64:
		return x
	case int:
		return float64(x)
	case int64:
		return float64(x)
	default:
		return float64(intFromAny(v))
	}
}
