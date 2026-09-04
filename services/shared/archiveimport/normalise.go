package archiveimport

import (
	"encoding/json"
	"fmt"
	"math"
	"reflect"
	"strconv"
	"strings"
	"time"

	"github.com/google/uuid"

	"eve-industry-planner/shared/models"
)

// EnsureJobIDPrefix aligns legacy IDs with the frontend convention `job-${uuid()}`
// (see frontend Classes/job.js). Numeric Firestore IDs become "job-<digits>"; values
// that already start with "job-" are left unchanged.
func EnsureJobIDPrefix(id string) string {
	id = strings.TrimSpace(id)
	if id == "" {
		return id
	}
	if strings.HasPrefix(id, "job-") {
		return id
	}
	return "job-" + id
}

// JobFromFirestoreMap normalises a Firestore ArchivedJobs document (root fields only,
// not the CLI export wrapper) and decodes it into models.Job.
func JobFromFirestoreMap(doc map[string]any, accountID string) (models.Job, error) {
	if doc == nil {
		return models.Job{}, fmt.Errorf("doc is nil")
	}
	if accountID == "" {
		return models.Job{}, fmt.Errorf("accountID is required")
	}
	clone, err := cloneMap(doc)
	if err != nil {
		return models.Job{}, err
	}

	normalizeJobID(clone)
	normalizeMetaLevel(clone)
	normalizeGroupID(clone)

	if isLegacyArchivedJob(clone) {
		upgradeLegacyJobShape(clone)
	}

	normalizeBuildSubtree(clone)
	normalizeCostsAndSale(clone)
	stripEmptySaleCharacterHashes(clone)
	fillBlueprintTypeIDFromLinkedJobs(clone)
	fillBlueprintTypeIDFromRecipeList(clone)
	fillMetaLevelFromRecipeList(clone)
	stripLegacyRootFields(clone)
	ensureMaterialsSlice(clone)
	ensureParentJobsSlice(clone)
	normalizeNestedJobIDs(clone)
	normalizeJobLayout(clone)

	if err := hoistMetaAndPlanner(clone, accountID); err != nil {
		return models.Job{}, err
	}

	payload, err := json.Marshal(clone)
	if err != nil {
		return models.Job{}, fmt.Errorf("marshal normalized job: %w", err)
	}
	var job models.Job
	if err := json.Unmarshal(payload, &job); err != nil {
		return models.Job{}, fmt.Errorf("decode models.Job: %w", err)
	}
	return job, nil
}

func cloneMap(m map[string]any) (map[string]any, error) {
	// json.Marshal rejects NaN/±Inf. Firestore can store NaN in numeric fields; normalise to 0
	// before cloning so the rest of the pipeline and BSON upserts stay valid.
	cleaned := deepCloneReplaceNonFiniteFloats(m)
	m2, ok := cleaned.(map[string]any)
	if !ok {
		return nil, fmt.Errorf("clone map: expected map after sanitize, got %T", cleaned)
	}
	b, err := json.Marshal(m2)
	if err != nil {
		return nil, fmt.Errorf("clone map: %w", err)
	}
	var out map[string]any
	if err := json.Unmarshal(b, &out); err != nil {
		return nil, fmt.Errorf("clone map: %w", err)
	}
	return out, nil
}

// deepCloneReplaceNonFiniteFloats returns a deep copy of v with float32/float64 NaN and ±Inf replaced by 0.
// Does not mutate the input. Unsupported shapes are returned as-is.
func deepCloneReplaceNonFiniteFloats(v any) any {
	if v == nil {
		return nil
	}
	switch t := v.(type) {
	case float32:
		f := float64(t)
		if math.IsNaN(f) || math.IsInf(f, 0) {
			return float32(0)
		}
		return t
	case float64:
		if math.IsNaN(t) || math.IsInf(t, 0) {
			return float64(0)
		}
		return t
	case map[string]any:
		out := make(map[string]any, len(t))
		for k, vv := range t {
			out[k] = deepCloneReplaceNonFiniteFloats(vv)
		}
		return out
	case []any:
		out := make([]any, len(t))
		for i, vv := range t {
			out[i] = deepCloneReplaceNonFiniteFloats(vv)
		}
		return out
	}
	rv := reflect.ValueOf(v)
	switch rv.Kind() {
	case reflect.Map:
		if rv.Type().Key().Kind() != reflect.String {
			return v
		}
		if rv.IsNil() {
			return v
		}
		out := make(map[string]any, rv.Len())
		for _, key := range rv.MapKeys() {
			out[key.String()] = deepCloneReplaceNonFiniteFloats(rv.MapIndex(key).Interface())
		}
		return out
	case reflect.Slice, reflect.Array:
		n := rv.Len()
		if rv.Kind() == reflect.Slice && rv.IsNil() {
			return v
		}
		out := make([]any, n)
		for i := range n {
			out[i] = deepCloneReplaceNonFiniteFloats(rv.Index(i).Interface())
		}
		return out
	default:
		return v
	}
}

func normalizeJobID(m map[string]any) {
	v, ok := m["jobID"]
	if !ok || v == nil {
		return
	}
	m["jobID"] = EnsureJobIDPrefix(stringifyJSONScalar(v))
}

func normalizeNestedJobIDs(m map[string]any) {
	if pj, ok := m["parentJobs"].([]any); ok {
		for i, v := range pj {
			if v == nil {
				continue
			}
			pj[i] = EnsureJobIDPrefix(stringifyJSONScalar(v))
		}
	}
	build, _ := m["build"].(map[string]any)
	if build == nil {
		return
	}
	if cj, ok := build["childJobs"].(map[string]any); ok {
		for _, v := range cj {
			arr, ok := v.([]any)
			if !ok {
				continue
			}
			for i, id := range arr {
				if id == nil {
					continue
				}
				arr[i] = EnsureJobIDPrefix(stringifyJSONScalar(id))
			}
		}
	}
	mats, _ := build["materials"].([]any)
	for _, mi := range mats {
		mat, ok := mi.(map[string]any)
		if !ok {
			continue
		}
		pur, _ := mat["purchasing"].([]any)
		for _, pi := range pur {
			p, ok := pi.(map[string]any)
			if !ok {
				continue
			}
			cid, ok := p["childID"]
			if !ok || cid == nil {
				continue
			}
			s := EnsureJobIDPrefix(stringifyJSONScalar(cid))
			if s == "" {
				p["childID"] = nil
				continue
			}
			p["childID"] = s
		}
	}
}

// normalizeJobLayout coerces models.JobLayout map values to strings. Legacy Firestore data
// often used explicit null for the whole layout object and for each preference field; in
// map[string]any those become nil and must not reach json.Unmarshal as JSON null on string.
// The layout key is always kept: missing/null/invalid layout becomes an empty object {} so
// models.Job always has a (possibly zero) JobLayout.
func normalizeJobLayout(m map[string]any) {
	raw, ok := m["layout"]
	if !ok || raw == nil {
		m["layout"] = map[string]any{}
		return
	}
	lay, ok := raw.(map[string]any)
	if !ok {
		m["layout"] = map[string]any{}
		return
	}
	// Per-job canonical keys are localMarketDisplay/localOrderDisplay. If short-lived
	// marketLocation/orderType appear (interim naming), fold them into local* then drop.
	if _, ok := lay["localMarketDisplay"]; !ok || lay["localMarketDisplay"] == nil {
		if v, ok := lay["marketLocation"]; ok && v != nil {
			lay["localMarketDisplay"] = v
		}
	}
	if _, ok := lay["localOrderDisplay"]; !ok || lay["localOrderDisplay"] == nil {
		if v, ok := lay["orderType"]; ok && v != nil {
			lay["localOrderDisplay"] = v
		}
	}
	delete(lay, "marketLocation")
	delete(lay, "orderType")
	for _, k := range []string{
		"localMarketDisplay", "localOrderDisplay", "esiJobTab", "setupToEdit", "resourceDisplayType",
	} {
		v, ok := lay[k]
		if !ok || v == nil {
			delete(lay, k)
			continue
		}
		if s, ok := v.(string); ok {
			s = strings.TrimSpace(s)
			if s == "" {
				delete(lay, k)
			} else {
				lay[k] = s
			}
			continue
		}
		s := strings.TrimSpace(stringifyJSONScalar(v))
		if s == "" {
			delete(lay, k)
		} else {
			lay[k] = s
		}
	}
	m["layout"] = lay
}

func stringifyJSONScalar(v any) string {
	switch x := v.(type) {
	case string:
		return x
	case float64:
		return strconv.FormatInt(int64(x), 10)
	case json.Number:
		s := x.String()
		return s
	case int:
		return strconv.Itoa(x)
	case int64:
		return strconv.FormatInt(x, 10)
	default:
		return fmt.Sprint(x)
	}
}

func normalizeMetaLevel(m map[string]any) {
	if metaLevelLooksSet(m["metaLevel"]) {
		delete(m, "metaGroup")
		return
	}
	if mg, ok := m["metaGroup"]; ok && mg != nil {
		m["metaLevel"] = mg
	}
	delete(m, "metaGroup")
}

// normalizeGroupID: Firestore null / missing / whitespace-only groupID → groupID "", includedInGroup false.
// Non-empty groupID → trimmed string on map, includedInGroup true (unless explicitly set otherwise).
func normalizeGroupID(m map[string]any) {
	g, hasKey := m["groupID"]
	if !hasKey || g == nil {
		m["groupID"] = ""
		m["includedInGroup"] = false
		return
	}
	s := strings.TrimSpace(stringifyJSONScalar(g))
	if s == "" {
		m["groupID"] = ""
		m["includedInGroup"] = false
		return
	}
	m["groupID"] = s
	if v, ok := m["includedInGroup"]; ok && v != nil {
		m["includedInGroup"] = jobRootBoolFromAny(v, true)
	} else {
		m["includedInGroup"] = true
	}
}

func jobRootBoolFromAny(v any, defaultVal bool) bool {
	if v == nil {
		return defaultVal
	}
	switch x := v.(type) {
	case bool:
		return x
	case float64:
		return x != 0
	case string:
		return strings.EqualFold(strings.TrimSpace(x), "true") || strings.TrimSpace(x) == "1"
	default:
		return defaultVal
	}
}

func isLegacyArchivedJob(m map[string]any) bool {
	if _, ok := m["bpME"]; ok {
		return true
	}
	if _, ok := m["runCount"]; ok {
		return true
	}
	if lv, ok := m["rigType"]; ok && lv != nil {
		_, isNum := lv.(float64)
		if isNum {
			return true
		}
	}
	build, _ := m["build"].(map[string]any)
	if build == nil {
		return false
	}
	if setup, ok := build["setup"].(map[string]any); ok && len(setup) > 0 {
		return false
	}
	if _, ok := build["buildChar"]; ok {
		return true
	}
	if prod, ok := build["products"].(map[string]any); ok {
		if _, ok := prod["quantityPerJob"]; ok {
			return true
		}
	}
	return false
}

func rawDataTimeSeconds(m map[string]any) float64 {
	rd, _ := m["rawData"].(map[string]any)
	if rd == nil {
		return 0
	}
	return float64FromAny(rd["time"])
}

func fillSetupMaterialCount(setup map[string]any, build map[string]any, root map[string]any) {
	mc, _ := setup["materialCount"].(map[string]any)
	if mc == nil {
		mc = map[string]any{}
		setup["materialCount"] = mc
	}
	rawRoot, _ := root["rawData"].(map[string]any)
	mats, _ := build["materials"].([]any)
	for _, mi := range mats {
		mat, ok := mi.(map[string]any)
		if !ok {
			continue
		}
		tid := typeIDKey(mat["typeID"])
		if tid == "" {
			continue
		}
		qty := materialCountQuantityInt(mat["quantity"])
		rawQty := qty
		if rm := rawMaterialByTypeID(rawRoot, mat["typeID"]); rm != nil {
			rawQty = materialCountQuantityInt(rm["quantity"])
		}
		mc[tid] = map[string]any{
			"typeID":      intFromAny(mat["typeID"]),
			"quantity":    qty,
			"rawQuantity": rawQty,
		}
	}
}

func rawMaterialByTypeID(raw map[string]any, typeID any) map[string]any {
	if raw == nil {
		return nil
	}
	arr, _ := raw["materials"].([]any)
	want := typeIDKey(typeID)
	for _, x := range arr {
		m, ok := x.(map[string]any)
		if !ok {
			continue
		}
		if typeIDKey(m["typeID"]) == want {
			return m
		}
	}
	return nil
}

func upgradeLegacyJobShape(m map[string]any) {
	build, _ := m["build"].(map[string]any)
	if build == nil {
		build = map[string]any{}
		m["build"] = build
	}

	v7RemapFlatBlueprintFields(m)

	runCount := intFromAny(m["runCount"])
	if runCount == 0 {
		runCount = 1
	}
	jobCount := intFromAny(m["jobCount"])
	if jobCount == 0 {
		jobCount = 1
	}
	me := intFromAny(m["bpME"])
	te := intFromAny(m["bpTE"])
	jt := intFromAny(m["jobType"])
	structureID := intFromAny(m["structureType"])
	rigID := intFromAny(m["rigType"])
	systemTypeID := intFromAny(m["systemType"])
	var selected *string
	if bc, ok := build["buildChar"]; ok && bc != nil {
		if s, ok := bc.(string); ok && s != "" {
			selected = &s
		}
	}
	setupID := uuid.New().String()
	rawTime := rawDataTimeSeconds(m)
	setup := map[string]any{
		"id":                             setupID,
		"runCount":                       runCount,
		"jobCount":                       jobCount,
		"ME":                             me,
		"TE":                             te,
		"structureID":                    structureID,
		"rigID":                          rigID,
		"systemTypeID":                   systemTypeID,
		"systemID":                       30000142,
		"taxValue":                       0.25,
		"estimatedInstallCost":           0.0,
		"customStructureID":              "",
		"materialCount":                  map[string]any{},
		"estimatedTime":                  0.0,
		"rawTime":                        rawTime,
		"jobType":                        jt,
		"appliedRequirementID":           int64(-1),
		"alternativeSystemIndexValue":    0.0,
		"useAlternativeSystemIndexValue": false,
	}
	if selected != nil {
		setup["selectedCharacter"] = *selected
	}
	fillSetupMaterialCount(setup, build, m)
	build["setup"] = map[string]any{setupID: setup}

	if _, ok := m["itemsProducedPerRun"]; !ok || intFromAny(m["itemsProducedPerRun"]) == 0 {
		if q := firstRawProductQuantity(m); q > 0 {
			m["itemsProducedPerRun"] = q
		} else if prod, ok := build["products"].(map[string]any); ok {
			m["itemsProducedPerRun"] = intFromAny(prod["quantityPerJob"])
		}
	}

	childJobs := extractChildJobsFromMaterials(build)
	if len(childJobs) > 0 {
		build["childJobs"] = childJobs
	}

	delete(build, "buildChar")
	delete(build, "time")

	removeMaterialChildJob(build)
}

func extractChildJobsFromMaterials(build map[string]any) map[string]any {
	out := map[string]any{}
	mats, _ := build["materials"].([]any)
	for _, mi := range mats {
		mat, ok := mi.(map[string]any)
		if !ok {
			continue
		}
		tid := typeIDKey(mat["typeID"])
		if tid == "" {
			continue
		}
		cj, ok := mat["childJob"].([]any)
		if !ok || len(cj) == 0 {
			out[tid] = []any{}
			continue
		}
		ids := make([]any, 0, len(cj))
		for _, c := range cj {
			ids = append(ids, EnsureJobIDPrefix(stringifyJSONScalar(c)))
		}
		out[tid] = ids
	}
	return out
}

func removeMaterialChildJob(build map[string]any) {
	mats, _ := build["materials"].([]any)
	for _, mi := range mats {
		mat, ok := mi.(map[string]any)
		if !ok {
			continue
		}
		delete(mat, "childJob")
	}
}

func firstRawProductQuantity(m map[string]any) int {
	rd, _ := m["rawData"].(map[string]any)
	if rd == nil {
		return 0
	}
	prods, _ := rd["products"].([]any)
	if len(prods) == 0 {
		return 0
	}
	p0, ok := prods[0].(map[string]any)
	if !ok {
		return 0
	}
	return intFromAny(p0["quantity"])
}

func typeIDKey(v any) string {
	if v == nil {
		return ""
	}
	switch x := v.(type) {
	case float64:
		return strconv.Itoa(int(x))
	case int:
		return strconv.Itoa(x)
	case json.Number:
		return x.String()
	default:
		return fmt.Sprint(x)
	}
}

func intFromAny(v any) int {
	switch x := v.(type) {
	case float64:
		return int(x)
	case int:
		return x
	case int64:
		return int(x)
	case json.Number:
		i, _ := x.Int64()
		return int(i)
	default:
		return 0
	}
}

// materialCountQuantityInt rounds legacy fractional quantities to whole units for models.MaterialCount.
func materialCountQuantityInt(v any) int {
	switch x := v.(type) {
	case float64:
		return int(math.Round(x))
	case float32:
		return int(math.Round(float64(x)))
	case int:
		return x
	case int64:
		return int(x)
	case int32:
		return int(x)
	case json.Number:
		f, err := x.Float64()
		if err != nil {
			i, _ := x.Int64()
			return int(i)
		}
		return int(math.Round(f))
	case string:
		s := strings.TrimSpace(x)
		if s == "" {
			return 0
		}
		if n, err := strconv.ParseInt(s, 10, 64); err == nil {
			return int(n)
		}
		f, err := strconv.ParseFloat(s, 64)
		if err != nil {
			return 0
		}
		return int(math.Round(f))
	default:
		return intFromAny(v)
	}
}

func intPtrFromAny(v any) *int {
	if v == nil {
		return nil
	}
	i := intFromAny(v)
	return &i
}

func stripLegacyRootFields(m map[string]any) {
	keys := []string{
		"bpME", "bpTE", "runCount", "jobCount", "rigType",
		"structureType", "structureTypeDisplay", "systemType",
		// The ESI ids a job holds are read from its linked rows
		// (models.Job.LinkedESIJobIDs and friends), so the stored copies are
		// not carried onto the document.
		"apiJobs", "apiOrders", "apiTransactions",
	}
	for _, k := range keys {
		delete(m, k)
	}
}

// normalizeBuildSubtree also drops build.products: what a job produces is worked
// out from its setups (models.Job.TotalQuantityProduced), so the legacy stored
// total is not carried onto the document.
func normalizeBuildSubtree(m map[string]any) {
	build, _ := m["build"].(map[string]any)
	if build == nil {
		return
	}
	normalizeJobSetupMaps(build)
	normalizePurchasing(build)
	delete(build, "products")
}

// normalizeJobSetupMaps coerces each build.setup entry for models.JobSetup value fields (legacy null / Firestore scalar types).
func normalizeJobSetupMaps(build map[string]any) {
	setups, _ := build["setup"].(map[string]any)
	if setups == nil {
		return
	}
	for _, vi := range setups {
		su, ok := vi.(map[string]any)
		if !ok {
			continue
		}
		normalizeJobSetupScalarFields(su)
	}
}

// normalizeJobSetupScalarFields ensures every models.JobSetup root field exists on the map with a
// JSON/BSON-friendly value (matches SPA jobSetup defaults: appliedRequirementID -1,
// tax 0.25 when unset/zero, run/job counts at least 1).
func normalizeJobSetupScalarFields(s map[string]any) {
	for _, k := range []string{"structureID", "rigID", "systemTypeID", "systemID", "ME", "TE", "jobType"} {
		s[k] = jobSetupIntFromMap(s, k, 0)
	}
	for _, k := range []string{"runCount", "jobCount"} {
		n := max(jobSetupIntFromMap(s, k, 1), 1)
		s[k] = n
	}
	for _, k := range []string{"estimatedInstallCost", "estimatedTime", "rawTime", "alternativeSystemIndexValue"} {
		s[k] = jobSetupFloatFromMap(s, k, 0)
	}
	normalizeJobSetupTaxValue(s)
	s["customStructureID"] = jobSetupStringFromMap(s, "customStructureID")
	s["selectedCharacter"] = jobSetupStringFromMap(s, "selectedCharacter")
	s["appliedRequirementID"] = jobSetupAppliedRequirementID(s)
	s["useAlternativeSystemIndexValue"] = jobSetupBoolFromMap(s, "useAlternativeSystemIndexValue", false)

	if _, ok := s["id"]; ok && s["id"] != nil {
		s["id"] = strings.TrimSpace(stringifyJSONScalar(s["id"]))
	} else {
		s["id"] = ""
	}

	if mc, ok := s["materialCount"].(map[string]any); ok && mc != nil {
		s["materialCount"] = mc
	} else {
		s["materialCount"] = map[string]any{}
	}
}

func jobSetupIntFromMap(s map[string]any, key string, defaultVal int) int {
	v, ok := s[key]
	if !ok || v == nil {
		return defaultVal
	}
	return materialCountQuantityInt(v)
}

func jobSetupFloatFromMap(s map[string]any, key string, defaultVal float64) float64 {
	v, ok := s[key]
	if !ok || v == nil {
		return defaultVal
	}
	return historicFloat64Scalar(v)
}

func jobSetupStringFromMap(s map[string]any, key string) string {
	v, ok := s[key]
	if !ok || v == nil {
		return ""
	}
	if str, ok := v.(string); ok {
		return strings.TrimSpace(str)
	}
	return strings.TrimSpace(stringifyJSONScalar(v))
}

func jobSetupBoolFromMap(s map[string]any, key string, defaultVal bool) bool {
	v, ok := s[key]
	if !ok || v == nil {
		return defaultVal
	}
	switch x := v.(type) {
	case bool:
		return x
	case float64:
		return x != 0
	case int:
		return x != 0
	case string:
		return strings.EqualFold(strings.TrimSpace(x), "true") || strings.TrimSpace(x) == "1"
	default:
		return defaultVal
	}
}

// normalizeJobSetupTaxValue matches SPA: taxValue || 0.25 (missing, null, or zero → 0.25).
func normalizeJobSetupTaxValue(s map[string]any) {
	v, ok := s["taxValue"]
	if !ok || v == nil {
		s["taxValue"] = 0.25
		return
	}
	x := historicFloat64Scalar(v)
	if x == 0 {
		x = 0.25
	}
	s["taxValue"] = x
}

// jobSetupAppliedRequirementID matches SPA: null/missing or legacy 0 → -1 (no requirement).
func jobSetupAppliedRequirementID(s map[string]any) int64 {
	v, ok := s["appliedRequirementID"]
	if !ok || v == nil {
		return -1
	}
	n := historicInt64Scalar(v)
	if n == 0 {
		return -1
	}
	return n
}

func normalizePurchasing(build map[string]any) {
	mats, _ := build["materials"].([]any)
	for _, mi := range mats {
		mat, ok := mi.(map[string]any)
		if !ok {
			continue
		}
		// What a material needs comes from the setups
		// (models.Job.MaterialRequirement), so the stored figure is not carried
		// onto the document.
		delete(mat, "quantity")
		if v, ok := mat["volume"]; ok {
			mat["volume"] = historicFloat64Scalar(v)
		}
		// What a material bought is read from its purchases
		// (models.JobMaterial.PurchasedCost), so the stored totals are not carried
		// onto the document.
		delete(mat, "quantityPurchased")
		delete(mat, "purchasedCost")
		pur, _ := mat["purchasing"].([]any)
		for _, pi := range pur {
			p, ok := pi.(map[string]any)
			if !ok {
				continue
			}
			if id, ok := p["id"]; ok {
				p["id"] = stringifyJSONScalar(id)
			}
			if v, ok := p["childID"]; ok {
				if v == nil {
					delete(p, "childID")
				} else {
					s := strings.TrimSpace(stringifyJSONScalar(v))
					if s == "" {
						delete(p, "childID")
					} else {
						p["childID"] = EnsureJobIDPrefix(s)
					}
				}
			}
			if v, ok := p["typeID"]; ok && v != nil {
				p["typeID"] = materialCountQuantityInt(v)
			}
			if v, ok := p["itemCount"]; ok {
				p["itemCount"] = materialCountQuantityInt(v)
			}
			if v, ok := p["itemCost"]; ok {
				p["itemCost"] = historicFloat64Scalar(v)
			}
		}
	}
}

func normalizeCostsAndSale(m map[string]any) {
	build, _ := m["build"].(map[string]any)
	if build == nil {
		return
	}
	costs, _ := build["costs"].(map[string]any)
	if costs != nil {
		normalizeExtrasCosts(costs)
		mainJT := intFromAny(m["jobType"])
		normalizeLinkedJobs(costs, mainJT)
		stripEmptyLinkedJobCharacterHash(costs)
	}
	sale, _ := build["sale"].(map[string]any)
	if sale != nil {
		normalizeMarketOrders(sale)
		normalizeSaleDates(sale)
		normalizeSaleTransactionIDs(sale)
	}
}

func stripEmptySaleCharacterHashes(m map[string]any) {
	build, _ := m["build"].(map[string]any)
	if build == nil {
		return
	}
	sale, _ := build["sale"].(map[string]any)
	if sale == nil {
		return
	}
	for _, key := range []string{"transactions", "marketOrders"} {
		stripEmptyCharacterHashInList(sale, key)
	}
}

func stripEmptyCharacterHashInList(parent map[string]any, listKey string) {
	list, _ := parent[listKey].([]any)
	for _, item := range list {
		row, ok := item.(map[string]any)
		if !ok {
			continue
		}
		normalizeCharacterHashRow(row)
	}
}

func stripEmptyLinkedJobCharacterHash(costs map[string]any) {
	list, _ := costs["linkedJobs"].([]any)
	for _, item := range list {
		row, ok := item.(map[string]any)
		if !ok {
			continue
		}
		normalizeCharacterHashRow(row)
	}
}

// normalizeCharacterHashRow coerces CharacterHash for models.* string fields: legacy null, or non-string Firestore scalars, become trimmed strings or the key is removed if empty.
func normalizeCharacterHashRow(row map[string]any) {
	v, ok := row["CharacterHash"]
	if !ok {
		return
	}
	if v == nil {
		delete(row, "CharacterHash")
		return
	}
	if s, ok := v.(string); ok {
		s = strings.TrimSpace(s)
		if s == "" {
			delete(row, "CharacterHash")
		} else {
			row["CharacterHash"] = s
		}
		return
	}
	s := strings.TrimSpace(stringifyJSONScalar(v))
	if s == "" {
		delete(row, "CharacterHash")
	} else {
		row["CharacterHash"] = s
	}
}

// normalizeSaleTransactionIDs coerces transaction_id and order_id for models.Transaction (historic string/float/null exports).
func normalizeSaleTransactionIDs(sale map[string]any) {
	txs, _ := sale["transactions"].([]any)
	for _, ti := range txs {
		t, ok := ti.(map[string]any)
		if !ok {
			continue
		}
		if v, ok := t["transaction_id"]; ok {
			t["transaction_id"] = historicInt64Scalar(v)
		}
		if v, ok := t["order_id"]; ok {
			t["order_id"] = materialCountQuantityInt(v)
		}
	}
}

// historicInt64Scalar maps legacy Firestore/JSON scalars to int64 (parse strings, round floats).
func historicInt64Scalar(v any) int64 {
	if v == nil {
		return 0
	}
	switch x := v.(type) {
	case int64:
		return x
	case int32:
		return int64(x)
	case int:
		return int64(x)
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
			return 0
		}
		return n
	case json.Number:
		i, err := x.Int64()
		if err == nil {
			return i
		}
		f, err := x.Float64()
		if err != nil {
			return 0
		}
		return int64(math.Round(f))
	default:
		return 0
	}
}

// historicFloat64Scalar maps legacy Firestore/JSON scalars to float64 (parse strings; integers promote).
func historicFloat64Scalar(v any) float64 {
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
	case int64:
		return float64(x)
	case int32:
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
	case json.Number:
		f, err := x.Float64()
		if err != nil {
			return 0
		}
		return f
	default:
		return 0
	}
}

// normalizeSaleDates converts numeric timestamps (e.g. JS Date stored as unix ms) to RFC3339 strings.
func normalizeSaleDates(sale map[string]any) {
	txs, _ := sale["transactions"].([]any)
	for _, ti := range txs {
		t, ok := ti.(map[string]any)
		if !ok {
			continue
		}
		if d, ok := t["date"]; ok {
			if s, ok := d.(string); ok && s != "" {
				continue
			}
			t["date"] = coerceTimeToRFC3339(d)
		}
	}
	fees, _ := sale["brokersFee"].([]any)
	for _, fi := range fees {
		f, ok := fi.(map[string]any)
		if !ok {
			continue
		}
		// A fee is charged once and never revisited, so nothing reads a
		// completion flag on it.
		delete(f, "complete")
		if d, ok := f["date"]; ok {
			if s, ok := d.(string); ok && s != "" {
				continue
			}
			f["date"] = coerceTimeToRFC3339(d)
		}
	}
}

func coerceTimeToRFC3339(v any) string {
	switch x := v.(type) {
	case string:
		s := strings.TrimSpace(x)
		if s == "" {
			return ""
		}
		if t, err := time.Parse(time.RFC3339Nano, s); err == nil {
			return t.UTC().Format(time.RFC3339Nano)
		}
		if t, err := time.Parse(time.RFC3339, s); err == nil {
			return t.UTC().Format(time.RFC3339Nano)
		}
		return ""
	case float64:
		n := int64(x)
		if n > 1_000_000_000_000 { // unix milliseconds
			return time.UnixMilli(n).UTC().Format(time.RFC3339Nano)
		}
		return time.Unix(n, 0).UTC().Format(time.RFC3339Nano)
	case float32:
		return coerceTimeToRFC3339(float64(x))
	case int64:
		if x > 1_000_000_000_000 {
			return time.UnixMilli(x).UTC().Format(time.RFC3339Nano)
		}
		return time.Unix(x, 0).UTC().Format(time.RFC3339Nano)
	case int:
		return coerceTimeToRFC3339(int64(x))
	case int32:
		return coerceTimeToRFC3339(int64(x))
	case json.Number:
		f, err := x.Float64()
		if err != nil {
			return ""
		}
		return coerceTimeToRFC3339(f)
	default:
		return ""
	}
}

// normalizeExtrasCosts rewrites each extras row to models.ExtraCost field names with all keys present:
// id, category (string), extraText, extraValue (float). Legacy keys type, label, cost and numeric category are coerced.
func normalizeExtrasCosts(costs map[string]any) {
	raw, ok := costs["extrasCosts"].([]any)
	if !ok || raw == nil {
		costs["extrasCosts"] = []any{}
		return
	}
	out := make([]any, 0, len(raw))
	for _, ei := range raw {
		e, ok := ei.(map[string]any)
		if !ok {
			continue
		}
		remapped := map[string]any{}
		remapped["id"] = extrasNormalizeStringField(e["id"])
		cat := e["category"]
		if cat == nil {
			cat = e["type"]
		}
		remapped["category"] = extrasNormalizeCategoryString(cat)
		txt := e["extraText"]
		if txt == nil {
			txt = e["label"]
		}
		remapped["extraText"] = extrasNormalizeStringField(txt)
		val := e["extraValue"]
		if val == nil {
			val = e["cost"]
		}
		remapped["extraValue"] = historicFloat64Scalar(val)
		out = append(out, remapped)
	}
	costs["extrasCosts"] = out
}

func extrasNormalizeStringField(v any) string {
	if v == nil {
		return ""
	}
	if s, ok := v.(string); ok {
		return strings.TrimSpace(s)
	}
	return strings.TrimSpace(stringifyJSONScalar(v))
}

func extrasNormalizeCategoryString(v any) string {
	if v == nil {
		return ""
	}
	if s, ok := v.(string); ok {
		return strings.TrimSpace(s)
	}
	return strings.TrimSpace(stringifyJSONScalar(v))
}

func normalizeLinkedJobs(costs map[string]any, mainJobType int) {
	list, _ := costs["linkedJobs"].([]any)
	for _, li := range list {
		lj, ok := li.(map[string]any)
		if !ok {
			continue
		}
		if v, ok := lj["isCorp"]; ok {
			lj["is_corporation"] = v
			delete(lj, "isCorp")
		}
		if _, has := lj["job_type"]; !has {
			lj["job_type"] = mainJobType
		}
		normalizeLinkedJobCompletedDate(lj)
		if v, ok := lj["corporation_id"]; ok {
			n := materialCountQuantityInt(v)
			if n == 0 {
				delete(lj, "corporation_id")
			} else {
				lj["corporation_id"] = n
			}
		}
	}
}

func normalizeLinkedJobCompletedDate(lj map[string]any) {
	v, ok := lj["completed_date"]
	if !ok {
		return
	}
	if v == nil {
		delete(lj, "completed_date")
		return
	}
	if s, ok := v.(string); ok {
		s = strings.TrimSpace(s)
		if s == "" {
			delete(lj, "completed_date")
			return
		}
		if t := coerceTimeToRFC3339(s); t != "" {
			lj["completed_date"] = t
			return
		}
		lj["completed_date"] = s
		return
	}
	if t := strings.TrimSpace(coerceTimeToRFC3339(v)); t != "" {
		lj["completed_date"] = t
		return
	}
	delete(lj, "completed_date")
}

// normalizeMarketOrderRange coerces ESI/market order "range" to a string for models.MarketOrder.Range
// (e.g. "region", or a decimal string from legacy numeric Firestore/BSON values).
func normalizeMarketOrderRange(mo map[string]any) {
	v, ok := mo["range"]
	if !ok || v == nil {
		mo["range"] = ""
		return
	}
	switch x := v.(type) {
	case string:
		mo["range"] = strings.TrimSpace(x)
	default:
		mo["range"] = strings.TrimSpace(stringifyJSONScalar(v))
	}
}

func normalizeMarketOrders(sale map[string]any) {
	orders, _ := sale["marketOrders"].([]any)
	for _, oi := range orders {
		mo, ok := oi.(map[string]any)
		if !ok {
			continue
		}
		normalizeMarketOrderRange(mo)
		if p, ok := mo["price"]; ok {
			if _, has := mo["item_price"]; !has {
				mo["item_price"] = p
			}
			delete(mo, "price")
		}
		// Whether an order has sold out is read from the volume left
		// (models.MarketOrder.IsComplete), not carried onto the document.
		delete(mo, "complete")
	}
}

func ensureMaterialsSlice(m map[string]any) {
	build, _ := m["build"].(map[string]any)
	if build == nil {
		return
	}
	if build["materials"] == nil {
		build["materials"] = []any{}
	}
}

// ensureParentJobsSlice normalises Firestore parentJob into canonical parentJobs ([] if missing).
func ensureParentJobsSlice(m map[string]any) {
	var v any
	if v2, ok := m["parentJobs"]; ok && v2 != nil {
		v = v2
	} else if v2, ok := m["parentJob"]; ok && v2 != nil {
		v = v2
	}
	if v == nil {
		m["parentJobs"] = []any{}
		delete(m, "parentJob")
		return
	}
	if _, ok := v.([]any); !ok {
		m["parentJobs"] = []any{}
	} else {
		m["parentJobs"] = v
	}
	delete(m, "parentJob")
}

// fillBlueprintTypeIDFromLinkedJobs sets root blueprintTypeID from the first linked ESI job when
// the root field is missing, null, or zero (common on older Firestore exports that still have
// blueprint_type_id on linked jobs). Static SDE item→blueprint maps can extend this later.
func fillBlueprintTypeIDFromLinkedJobs(m map[string]any) {
	if intFromAny(m["blueprintTypeID"]) != 0 {
		return
	}
	build, _ := m["build"].(map[string]any)
	if build == nil {
		return
	}
	costs, _ := build["costs"].(map[string]any)
	if costs == nil {
		return
	}
	list, _ := costs["linkedJobs"].([]any)
	for _, li := range list {
		lj, ok := li.(map[string]any)
		if !ok {
			continue
		}
		id := intFromAny(lj["blueprint_type_id"])
		if id != 0 {
			m["blueprintTypeID"] = id
			return
		}
	}
}

func hoistMetaAndPlanner(m map[string]any, accountID string) error {
	now := time.Now().UTC()
	// Legacy Firestore root buildVer is not persisted on models.Job; migration tooling
	// may still resolve a canonical version for logging (see ResolveCanonicalBuildVer).
	delete(m, "buildVer")

	meta, ok := m["_meta"].(map[string]any)
	if !ok || meta == nil {
		meta = map[string]any{}
		m["_meta"] = meta
	}

	delete(meta, "buildVer")
	meta["accountID"] = accountID
	meta["lastUpdatedBy"] = accountID

	delete(m, "isIncludedOnPlanner")

	// displayOnPlanner: true by default; false when in a group unless isReadyToSell.
	included, _ := m["includedInGroup"].(bool)
	ready := jobRootBoolFromAny(m["isReadyToSell"], false)
	m["displayOnPlanner"] = !included || ready

	hoistLifecycleToMeta(m, accountID, now)
	normalizeMetaTimestampsForJobDecode(meta, now)
	return nil
}

// normalizeMetaTimestampsForJobDecode ensures _meta timestamps are RFC3339Nano strings.
// models.Job uses time.Time for these fields; encoding/json only accepts strings, not numeric
// unix timestamps, so legacy Firestore floats must be rewritten before the final decode.
// When createdAt/lastModified are missing or invalid, they default to now (import time).
func normalizeMetaTimestampsForJobDecode(meta map[string]any, now time.Time) {
	if meta == nil {
		return
	}
	normalizeMetaTimeKey(meta, "archivedAt", true)
	normalizeMetaTimeKey(meta, "createdAt", false)
	if strings.TrimSpace(metaString(meta["createdAt"])) == "" {
		meta["createdAt"] = now.Format(time.RFC3339Nano)
	}
	normalizeMetaTimeKey(meta, "lastModified", false)
	if strings.TrimSpace(metaString(meta["lastModified"])) == "" {
		meta["lastModified"] = now.Format(time.RFC3339Nano)
	}
	normalizeMetaTimeKey(meta, "deletedAt", true)
	normalizeMetaDeletedByForJobDecode(meta)
}

func metaString(v any) string {
	if v == nil {
		return ""
	}
	if s, ok := v.(string); ok {
		return s
	}
	return ""
}

// normalizeMetaTimeKey coerces meta[key] to an RFC3339Nano string via coerceTimeToRFC3339.
// If the value is missing, nil, or unparseable, the key is removed; callers may repopulate.
func normalizeMetaTimeKey(meta map[string]any, key string, omitWhenEmpty bool) {
	v, ok := meta[key]
	if !ok || v == nil {
		if omitWhenEmpty {
			delete(meta, key)
		}
		return
	}
	s := coerceTimeToRFC3339(v)
	if s == "" {
		delete(meta, key)
		return
	}
	meta[key] = s
}

func firstCoercedDeletedAt(candidates ...any) string {
	for _, v := range candidates {
		if v == nil {
			continue
		}
		if s := strings.TrimSpace(coerceTimeToRFC3339(v)); s != "" {
			return s
		}
	}
	return ""
}

// normalizeMetaDeletedByForJobDecode keeps _meta.deletedBy as a plain string and drops it when deletedAt is absent.
func normalizeMetaDeletedByForJobDecode(meta map[string]any) {
	if meta == nil {
		return
	}
	at := strings.TrimSpace(metaString(meta["deletedAt"]))
	v, ok := meta["deletedBy"]
	if !ok || v == nil {
		return
	}
	s := strings.TrimSpace(fmt.Sprint(v))
	if s == "" {
		delete(meta, "deletedBy")
		return
	}
	meta["deletedBy"] = s
	if at == "" {
		delete(meta, "deletedBy")
	}
}

// hoistLifecycleToMeta maps Firestore root fields into _meta for Mongo/target document shape:
// archiveProcessed, archiveTimeStamp→archivedAt, archivedBy (when archived),
// deleted/deletedTimeStamp/_meta.deleted* → deletedAt (RFC3339 string) + deletedBy.
func hoistLifecycleToMeta(m map[string]any, accountID string, now time.Time) {
	meta, ok := m["_meta"].(map[string]any)
	if !ok || meta == nil {
		return
	}

	if v, ok := m["archiveProcessed"]; ok {
		meta["archiveProcessed"] = truthyAny(v)
	}
	delete(m, "archiveProcessed")

	if v, ok := m["archiveTimeStamp"]; ok && v != nil {
		if s := strings.TrimSpace(coerceTimeToRFC3339(v)); s != "" {
			meta["archivedAt"] = s
		}
	}
	delete(m, "archiveTimeStamp")

	if v, ok := m["archived"]; ok && truthyAny(v) && accountID != "" {
		meta["archivedBy"] = accountID
	}

	rootDeleted := false
	if v, ok := m["deleted"]; ok {
		rootDeleted = truthyAny(v)
	}
	delete(m, "deleted")

	var rootDelTS any
	if v, ok := m["deletedTimeStamp"]; ok {
		rootDelTS = v
	}
	delete(m, "deletedTimeStamp")

	metaDeleted := false
	if v, ok := meta["deleted"]; ok {
		metaDeleted = truthyAny(v)
	}
	metaDelTS, _ := meta["deletedTimeStamp"]
	at := firstCoercedDeletedAt(rootDelTS, metaDelTS, meta["deletedAt"])
	want := rootDeleted || metaDeleted || at != ""

	if want {
		if at == "" {
			at = now.UTC().Format(time.RFC3339Nano)
		}
		meta["deletedAt"] = at
		if accountID != "" && strings.TrimSpace(metaString(meta["deletedBy"])) == "" {
			meta["deletedBy"] = accountID
		}
	}

	delete(meta, "deleted")
	delete(meta, "deletedTimeStamp")

	// Target Mongo document omits root archived (infer from ArchivedJobs collection / _meta).
	delete(m, "archived")
}

func truthyAny(v any) bool {
	switch x := v.(type) {
	case bool:
		return x
	case float64:
		return x != 0
	case int:
		return x != 0
	case int64:
		return x != 0
	case json.Number:
		i, err := x.Int64()
		return err == nil && i != 0
	default:
		return false
	}
}
