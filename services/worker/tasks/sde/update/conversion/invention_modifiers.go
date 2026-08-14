package conversion

import (
	"fmt"
	"sort"
	"strconv"
	"strings"
)

// InventionModifiersOutput is written to inventionModifiers.json: optional decryptors used in
// invention (probability / output BPC ME, TE, runs). Skills and blueprint requirements stay on recipe rows.
type InventionModifiersOutput struct {
	AttributeIndex map[string]*InventionAttributeDef `json:"attributeIndex"`
	Items          []InventionModifierItem           `json:"items"`
}

// InventionAttributeDef SDE names for the four decryptor stat columns.
type InventionAttributeDef struct {
	Name        string `json:"name"`
	Description string `json:"description,omitempty"`
}

// InventionModifierItem is one optional decryptor (SDE groupID 1304; same set as EVE-IPH).
type InventionModifierItem struct {
	TypeID    int                `json:"typeID"`
	Name      string             `json:"name"`
	Modifiers map[string]float64 `json:"modifiers"` // keys "1112".."1124" — see attributeIndex
}

// GenerateInventionModifiersOutput builds decryptor modifier stats from SDE DogmaAttributes + TypeDogma + Types.
func GenerateInventionModifiersOutput(
	typesData map[string]any,
	dogmaAttributesData map[string]any,
	typeDogmaData map[string]any,
) (*InventionModifiersOutput, error) {
	if typesData == nil || dogmaAttributesData == nil || typeDogmaData == nil {
		return nil, fmt.Errorf("missing types, dogmaAttributes, or typeDogma data")
	}

	allow := decryptorDogmaIDSet()
	attrIndex := buildInventionAttributeIndex(dogmaAttributesData)
	if len(attrIndex) == 0 {
		return &InventionModifiersOutput{
			AttributeIndex: map[string]*InventionAttributeDef{},
			Items:          []InventionModifierItem{},
		}, nil
	}

	items := make([]InventionModifierItem, 0)
	for typeKey, raw := range typeDogmaData {
		row, ok := raw.(map[string]any)
		if !ok {
			continue
		}
		typeRow, hasType := typesData[typeKey].(map[string]any)
		if !hasType || !typePublishedForExport(typeRow) {
			continue
		}
		gid, ok := float64FromJSON(typeRow["groupID"])
		if !ok || !isOptionalDecryptorGroup(int(gid)) {
			continue
		}
		name := englishTypeName(typeRow)

		typeID, err := strconv.Atoi(typeKey)
		if err != nil {
			continue
		}

		dogmaList, ok := row["dogmaAttributes"].([]any)
		if !ok || len(dogmaList) == 0 {
			continue
		}

		modifiers := make(map[string]float64)
		for _, da := range dogmaList {
			m, ok := da.(map[string]any)
			if !ok {
				continue
			}
			aid, ok := float64FromJSON(m["attributeID"])
			if !ok {
				continue
			}
			id := int(aid)
			if _, ok := allow[id]; !ok {
				continue
			}
			attrKey := attrIDKey(aid)
			if _, ok := attrIndex[attrKey]; !ok {
				continue
			}
			val, ok := float64FromJSON(m["value"])
			if !ok {
				continue
			}
			modifiers[attrKey] = val
		}
		if len(modifiers) == 0 {
			continue
		}

		items = append(items, InventionModifierItem{
			TypeID:    typeID,
			Name:      name,
			Modifiers: modifiers,
		})
	}

	sort.Slice(items, func(i, j int) bool { return items[i].TypeID < items[j].TypeID })

	return &InventionModifiersOutput{
		AttributeIndex: attrIndex,
		Items:          items,
	}, nil
}

func buildInventionAttributeIndex(dogmaAttributesData map[string]any) map[string]*InventionAttributeDef {
	out := make(map[string]*InventionAttributeDef)

	for _, id := range decryptorInventionDogmaAllowlist {
		key := strconv.Itoa(id)
		raw, ok := dogmaAttributesData[key]
		if !ok {
			continue
		}
		row, ok := raw.(map[string]any)
		if !ok {
			continue
		}
		name, _ := row["name"].(string)
		def := &InventionAttributeDef{Name: name}
		if desc, ok := row["description"].(string); ok {
			def.Description = strings.TrimSpace(desc)
		}
		out[key] = def
	}

	return out
}

func typePublishedForExport(itemData map[string]any) bool {
	if published, ok := itemData["published"].(bool); ok && !published {
		return false
	}
	if name, ok := itemData["name"].(map[string]any); ok {
		if enName, ok := name["en"].(string); ok {
			if strings.Contains(enName, "expired") || strings.Contains(enName, "Expired") {
				return false
			}
		}
	}
	return true
}

func englishTypeName(itemData map[string]any) string {
	if nameObj, ok := itemData["name"].(map[string]any); ok {
		if en, ok := nameObj["en"].(string); ok {
			return en
		}
	}
	return ""
}

func attrIDKey(attributeID float64) string {
	return strconv.FormatInt(int64(attributeID), 10)
}

func float64FromJSON(v any) (float64, bool) {
	switch x := v.(type) {
	case float64:
		return x, true
	case int:
		return float64(x), true
	case int64:
		return float64(x), true
	default:
		return 0, false
	}
}
