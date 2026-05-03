package conversion

import "testing"

func TestGenerateInventionModifiersOutput_decryptorRow(t *testing.T) {
	typesData := map[string]interface{}{
		"34201": map[string]interface{}{
			"_key":      float64(34201),
			"groupID":   float64(1304),
			"published": true,
			"name":      map[string]interface{}{"en": "Accelerant Decryptor"},
		},
		"1": map[string]interface{}{
			"published": false,
			"name":      map[string]interface{}{"en": "Hidden"},
		},
	}
	dogmaAttrs := map[string]interface{}{
		"1112": map[string]interface{}{
			"_key":        float64(1112),
			"name":        "inventionPropabilityMultiplier",
			"description": "test",
		},
	}
	typeDogma := map[string]interface{}{
		"34201": map[string]interface{}{
			"_key": float64(34201),
			"dogmaAttributes": []interface{}{
				map[string]interface{}{"attributeID": float64(1112), "value": float64(3.5)},
			},
		},
		"1": map[string]interface{}{
			"_key": float64(1),
			"dogmaAttributes": []interface{}{
				map[string]interface{}{"attributeID": float64(1112), "value": float64(9)},
			},
		},
	}

	out, err := GenerateInventionModifiersOutput(typesData, dogmaAttrs, typeDogma)
	if err != nil {
		t.Fatalf("GenerateInventionModifiersOutput: %v", err)
	}
	if len(out.Items) != 1 || out.Items[0].TypeID != 34201 {
		t.Fatalf("expected one item 34201, got %#v", out.Items)
	}
	if out.Items[0].Modifiers["1112"] != 3.5 {
		t.Fatalf("modifier value: got %v", out.Items[0].Modifiers["1112"])
	}
	if out.AttributeIndex["1112"] == nil || out.AttributeIndex["1112"].Name != "inventionPropabilityMultiplier" {
		t.Fatalf("attribute index: %#v", out.AttributeIndex["1112"])
	}
}

func TestGenerateInventionModifiersOutput_talocanDecryptorExcludedIPHAlignment(t *testing.T) {
	typesData := map[string]interface{}{
		"21074": map[string]interface{}{
			"_key": float64(21074), "groupID": float64(735), "published": true,
			"name": map[string]interface{}{"en": "Talocan Sketch Books"},
		},
	}
	dogmaAttrs := map[string]interface{}{
		"1112": map[string]interface{}{"name": "inventionPropabilityMultiplier"},
	}
	typeDogma := map[string]interface{}{
		"21074": map[string]interface{}{
			"dogmaAttributes": []interface{}{
				map[string]interface{}{"attributeID": float64(1112), "value": float64(3.5)},
			},
		},
	}
	out, err := GenerateInventionModifiersOutput(typesData, dogmaAttrs, typeDogma)
	if err != nil {
		t.Fatal(err)
	}
	if len(out.Items) != 0 {
		t.Fatalf("expected Talocan group 735 excluded (IPH uses 1304 only), got %d items", len(out.Items))
	}
}

func TestGenerateInventionModifiersOutput_dataInterfaceExcluded(t *testing.T) {
	typesData := map[string]interface{}{
		"30384": map[string]interface{}{
			"_key": float64(30384), "groupID": float64(979), "published": true,
			"name": map[string]interface{}{"en": "Minmatar Subsystems Data Interface"},
		},
	}
	dogmaAttrs := map[string]interface{}{
		"1112": map[string]interface{}{"name": "inventionPropabilityMultiplier"},
	}
	typeDogma := map[string]interface{}{
		"30384": map[string]interface{}{
			"dogmaAttributes": []interface{}{
				map[string]interface{}{"attributeID": float64(1112), "value": float64(1)},
			},
		},
	}
	out, err := GenerateInventionModifiersOutput(typesData, dogmaAttrs, typeDogma)
	if err != nil {
		t.Fatal(err)
	}
	if len(out.Items) != 0 {
		t.Fatalf("expected data interface excluded, got %d items", len(out.Items))
	}
}

func TestGenerateInventionModifiersOutput_nonDecryptorDogmaIgnored(t *testing.T) {
	typesData := map[string]interface{}{
		"99": map[string]interface{}{
			"_key": float64(99), "groupID": float64(1304), "published": true,
			"name": map[string]interface{}{"en": "Skill Book"},
		},
	}
	dogmaAttrs := map[string]interface{}{
		"474": map[string]interface{}{"name": "inventionBonus"},
		"1112": map[string]interface{}{
			"name": "inventionPropabilityMultiplier",
		},
	}
	typeDogma := map[string]interface{}{
		"99": map[string]interface{}{
			"dogmaAttributes": []interface{}{
				map[string]interface{}{"attributeID": float64(474), "value": float64(10)},
			},
		},
	}
	out, err := GenerateInventionModifiersOutput(typesData, dogmaAttrs, typeDogma)
	if err != nil {
		t.Fatal(err)
	}
	if len(out.Items) != 0 {
		t.Fatalf("expected skill-only dogma excluded, got %#v", out.Items)
	}
}
