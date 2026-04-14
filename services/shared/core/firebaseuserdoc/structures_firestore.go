package firebaseuserdoc

import (
	"math"
	"strconv"
	"strings"

	"eve-industry-planner/shared/shared/models"
)

// firestoreCustomStructure is the Firestore/JSON shape for manufacturing and reaction entries.
// systemID and tax may be strings or numbers from legacy clients; convert in toModel().
type firestoreCustomStructure struct {
	ID            string `json:"id"`
	JobType       int    `json:"jobType"`
	Name          string `json:"name"`
	SystemType    int    `json:"systemType"`
	StructureType int    `json:"structureType"`
	RigType       int    `json:"rigType"`
	SystemID      any    `json:"systemID"`
	Tax           any    `json:"tax"`
	Default       bool   `json:"default"`
}

func (f firestoreCustomStructure) toModel() models.CustomStructure {
	return models.CustomStructure{
		ID:            f.ID,
		JobType:       f.JobType,
		Name:          f.Name,
		SystemType:    f.SystemType,
		StructureType: f.StructureType,
		RigType:       f.RigType,
		SystemID:      coerceFirestoreInt64(f.SystemID),
		Tax:           coerceFirestoreFloat64(f.Tax),
		Default:       f.Default,
	}
}

// firestoreReprocessingStructure is the Firestore JSON shape for reprocessing entries.
type firestoreReprocessingStructure struct {
	ID            string `json:"id"`
	JobType       int    `json:"jobType"`
	Name          string `json:"name"`
	StructureType int    `json:"structureType"`
	SystemType    int    `json:"systemType"`
	RigSlot1      int    `json:"rigSlot1"`
	RigSlot2      int    `json:"rigSlot2"`
	Implant       int    `json:"implant"`
	Default       bool   `json:"default"`
	Tax           any    `json:"tax"`
}

func (f firestoreReprocessingStructure) toModel() models.ReprocessingStructure {
	return models.ReprocessingStructure{
		ID:            f.ID,
		JobType:       f.JobType,
		Name:          f.Name,
		StructureType: f.StructureType,
		SystemType:    f.SystemType,
		RigSlot1:      f.RigSlot1,
		RigSlot2:      f.RigSlot2,
		Implant:       f.Implant,
		Default:       f.Default,
		Tax:           coerceFirestoreFloat64(f.Tax),
	}
}

func mapFirestoreCustomStructures(in []firestoreCustomStructure) []models.CustomStructure {
	if len(in) == 0 {
		return []models.CustomStructure{}
	}
	out := make([]models.CustomStructure, 0, len(in))
	for _, row := range in {
		out = append(out, row.toModel())
	}
	return out
}

func mapFirestoreReprocessingStructures(in []firestoreReprocessingStructure) []models.ReprocessingStructure {
	if len(in) == 0 {
		return []models.ReprocessingStructure{}
	}
	out := make([]models.ReprocessingStructure, 0, len(in))
	for _, row := range in {
		out = append(out, row.toModel())
	}
	return out
}

func coerceFirestoreInt64(v any) int64 {
	if v == nil {
		return 0
	}
	switch x := v.(type) {
	case int:
		return int64(x)
	case int32:
		return int64(x)
	case int64:
		return x
	case float64:
		return int64(math.Round(x))
	case float32:
		return int64(math.Round(float64(x)))
	case string:
		s := strings.TrimSpace(x)
		if s == "" {
			return 0
		}
		n, err := strconv.ParseInt(s, 10, 64)
		if err != nil {
			f, err2 := strconv.ParseFloat(s, 64)
			if err2 != nil {
				return 0
			}
			return int64(math.Round(f))
		}
		return n
	default:
		return 0
	}
}

func coerceFirestoreFloat64(v any) float64 {
	if v == nil {
		return 0
	}
	switch x := v.(type) {
	case float64:
		return x
	case float32:
		return float64(x)
	case int:
		return float64(x)
	case int32:
		return float64(x)
	case int64:
		return float64(x)
	case string:
		s := strings.TrimSpace(x)
		if s == "" {
			return 0
		}
		f, err := strconv.ParseFloat(s, 64)
		if err != nil {
			return 0
		}
		return f
	default:
		return 0
	}
}
