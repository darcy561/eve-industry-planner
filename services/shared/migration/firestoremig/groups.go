package firestoremig

import (
	"context"
	"encoding/json"
	"fmt"
	"math"
	"reflect"
	"strconv"
	"time"

	mongocore "eve-industry-planner/shared/core/mongo"
	"eve-industry-planner/shared/logs"
	"eve-industry-planner/shared/shared/models"

	"cloud.google.com/go/firestore"
	"go.mongodb.org/mongo-driver/bson"
	"go.mongodb.org/mongo-driver/mongo"
	"go.mongodb.org/mongo-driver/mongo/options"
)

const (
	firestoreGroupDataDocID = "GroupData"
	// firestoreGroupDataField is the array field on ProfileInfo/GroupData holding job group objects.
	firestoreGroupDataField = "groupData"
)

// GroupDataFirestoreRef is Users/{accountID}/ProfileInfo/GroupData.
func GroupDataFirestoreRef(fs *firestore.Client, accountID string) *firestore.DocumentRef {
	return fs.Collection(FirestoreUsersCollection).Doc(accountID).Collection(firestoreProfileInfoSub).Doc(firestoreGroupDataDocID)
}

// CountGroupsInGroupDataFirestore returns how many objects are in the groupData array (0 if doc missing/empty).
func CountGroupsInGroupDataFirestore(ctx context.Context, fs *firestore.Client, accountID string) (int, error) {
	if accountID == "" {
		return 0, fmt.Errorf("account_id is required")
	}
	snap, err := GroupDataFirestoreRef(fs, accountID).Get(ctx)
	if err != nil {
		return 0, fmt.Errorf("get firestore GroupData: %w", err)
	}
	if !snap.Exists() {
		return 0, nil
	}
	data := snap.Data()
	if data == nil {
		return 0, nil
	}
	return len(groupDataArrayFromDoc(data)), nil
}

// GroupDataArrayLen is the number of objects in the groupData field of a GroupData document map (0 if missing).
func GroupDataArrayLen(data map[string]any) int {
	if data == nil {
		return 0
	}
	return len(groupDataArrayFromDoc(data))
}

// GroupDataArrayElements returns the raw groupData[] array from a GroupData document map.
func GroupDataArrayElements(data map[string]any) []any {
	return groupDataArrayFromDoc(data)
}

// JobIDStringFromFirestoreValue coerces a Firestore scalar to a string job id (snapshot / group includedJobIDs).
func JobIDStringFromFirestoreValue(v any) string {
	return stringFromJobOrCompleteField(v)
}

const maxSkipDetailRunes = 500

// GroupDataImportSkip describes one groupData[] element that was not imported.
type GroupDataImportSkip struct {
	Index  int
	Reason string
	Detail string
}

// String is one line (caller may prefix with account id).
func (s GroupDataImportSkip) String() string {
	if s.Detail == "" {
		return fmt.Sprintf("[%d] %s", s.Index, s.Reason)
	}
	return fmt.Sprintf("[%d] %s: %s", s.Index, s.Reason, s.Detail)
}

// UpsertUserJobGroupsFromGroupData reads Firestore ProfileInfo/GroupData (groupData array) and upserts each
// object into user_job_groups as models.Group, matching the API/PUT contract (_id = groupID, _meta.accountID).
// Skips has one entry per skipped array index (not_object, unmarshal, empty_groupID).
func UpsertUserJobGroupsFromGroupData(ctx context.Context, fs *firestore.Client, m *mongo.Client, accountID string) (written, skipped int, skips []GroupDataImportSkip, err error) {
	if accountID == "" {
		return 0, 0, nil, fmt.Errorf("account_id is required")
	}
	if m == nil {
		return 0, 0, nil, fmt.Errorf("mongo client is required")
	}

	snap, err := GroupDataFirestoreRef(fs, accountID).Get(ctx)
	if err != nil {
		return 0, 0, nil, fmt.Errorf("get firestore GroupData: %w", err)
	}
	if !snap.Exists() {
		return 0, 0, nil, nil
	}
	data := snap.Data()
	if data == nil {
		return 0, 0, nil, nil
	}

	items := groupDataArrayFromDoc(data)
	if len(items) == 0 {
		return 0, 0, nil, nil
	}

	now := time.Now().UTC()
	coll := m.Database(mongocore.DatabaseName).Collection(mongocore.CollectionUserJobGroups)

	// Last occurrence wins for duplicate groupIDs in the array.
	byID := make(map[string]models.Group, len(items))
	for i, el := range items {
		mobj, ok := el.(map[string]any)
		if !ok {
			detail := nonObjectElementDetail(el)
			logs.WarnCtx(ctx, "groupData import: skip element (not an object map)", "account_id", accountID, "index", i, "detail", detail)
			skips = append(skips, GroupDataImportSkip{Index: i, Reason: "not_object", Detail: detail})
			skipped++
			continue
		}
		g, perr := groupFromFirestoreMap(accountID, now, mobj)
		if perr != nil {
			detail := fmt.Sprintf("%v; payload=%s", perr, truncateString(mapPreviewJSON(mobj), maxSkipDetailRunes))
			logs.WarnCtx(ctx, "groupData import: skip element (unmarshal/convert failed)", "account_id", accountID, "index", i, "error", perr)
			skips = append(skips, GroupDataImportSkip{Index: i, Reason: "unmarshal", Detail: detail})
			skipped++
			continue
		}
		if g.GroupID == "" {
			detail := fmt.Sprintf("groupID empty or missing; payload=%s", truncateString(mapPreviewJSON(mobj), maxSkipDetailRunes))
			logs.WarnCtx(ctx, "groupData import: skip element (no groupID)", "account_id", accountID, "index", i)
			skips = append(skips, GroupDataImportSkip{Index: i, Reason: "empty_groupID", Detail: detail})
			skipped++
			continue
		}
		byID[g.GroupID] = g
	}
	if len(byID) == 0 {
		return 0, skipped, skips, nil
	}

	writeModels := make([]mongo.WriteModel, 0, len(byID))
	for _, g := range byID {
		writeModels = append(writeModels, mongo.NewUpdateOneModel().
			SetFilter(bson.M{"_id": g.GroupID, "_meta.accountID": accountID}).
			SetUpdate(bson.M{"$set": g}).
			SetUpsert(true))
	}

	retry := mongocore.DefaultRetryConfig()
	retry.OperationName = fmt.Sprintf("bulk upsert user_job_groups (firestore import) %s", accountID)
	var res *mongo.BulkWriteResult
	err = mongocore.RetryMongoOperation(ctx, retry, func() error {
		var e error
		res, e = coll.BulkWrite(ctx, writeModels, options.BulkWrite().SetOrdered(false))
		return e
	})
	if err != nil {
		return 0, skipped, skips, fmt.Errorf("bulk write user_job_groups: %w", err)
	}
	_ = res
	return len(byID), skipped, skips, nil
}

func groupDataArrayFromDoc(data map[string]any) []any {
	v, ok := data[firestoreGroupDataField]
	if !ok || v == nil {
		return nil
	}
	if arr, ok := v.([]any); ok {
		return arr
	}
	if arr, ok := v.([]interface{}); ok {
		out := make([]any, len(arr))
		for i, x := range arr {
			out[i] = x
		}
		return out
	}
	return nil
}

// groupFromFirestoreMap maps a Firestore group object to models.Group (json round-trip + ownership metadata).
// Legacy Firestore data may use numeric job IDs, string type IDs, etc. — we normalize to match models.Group
// before JSON decode (same invariants as the current JS toDocument() shape).
func groupFromFirestoreMap(accountID string, now time.Time, obj map[string]any) (models.Group, error) {
	norm := make(map[string]any, len(obj))
	for k, v := range obj {
		norm[k] = v
	}
	normalizeLegacyFirestoreGroupMap(norm)

	b, err := json.Marshal(norm)
	if err != nil {
		return models.Group{}, err
	}
	var g models.Group
	if err := json.Unmarshal(b, &g); err != nil {
		return models.Group{}, err
	}
	g.AccountID = accountID
	if g.GroupName == "" {
		g.GroupName = "Untitled Group"
	}
	// _meta: account + import timestamps
	g.MetaData.LastModified = now
	g.MetaData.AccountID = accountID
	if g.MetaData.CreatedAt.IsZero() {
		g.MetaData.CreatedAt = now
	}
	if g.MetaData.LastUpdatedBy == "" {
		g.MetaData.LastUpdatedBy = "firestore-import"
	}
	// nil slices for consistent BSON
	if g.IncludedJobIDs == nil {
		g.IncludedJobIDs = []string{}
	}
	if g.IncludedTypeIDs == nil {
		g.IncludedTypeIDs = []int{}
	}
	if g.MaterialIDs == nil {
		g.MaterialIDs = []int{}
	}
	if g.AreComplete == nil {
		g.AreComplete = []string{}
	}
	if g.LinkedJobIDs == nil {
		g.LinkedJobIDs = []int64{}
	}
	if g.LinkedOrderIDs == nil {
		g.LinkedOrderIDs = []int64{}
	}
	if g.LinkedTransIDs == nil {
		g.LinkedTransIDs = []int64{}
	}
	return g, nil
}

// normalizeLegacyFirestoreGroupMap coerces old Firestore shapes (mixed scalar types in arrays) to JSON
// compatible with models.Group. Mutates the map in place.
func normalizeLegacyFirestoreGroupMap(m map[string]any) {
	if m == nil {
		return
	}
	if v, ok := m["includedJobIDs"]; ok {
		if s := toStringIDSliceFromMixedArray(v); s != nil {
			m["includedJobIDs"] = s
		}
	}
	if v, ok := m["areComplete"]; ok {
		if s := toStringIDSliceFromMixedArray(v); s != nil {
			m["areComplete"] = s
		}
	}
	if v, ok := m["includedTypeIDs"]; ok {
		if s := toIntSliceFromMixedArray(v); s != nil {
			m["includedTypeIDs"] = s
		}
	}
	if v, ok := m["materialIDs"]; ok {
		if s := toIntSliceFromMixedArray(v); s != nil {
			m["materialIDs"] = s
		}
	}
	if v, ok := m["linkedJobIDs"]; ok {
		if s := toInt64SliceFromMixedArray(v); s != nil {
			m["linkedJobIDs"] = s
		}
	}
	if v, ok := m["linkedOrderIDs"]; ok {
		if s := toInt64SliceFromMixedArray(v); s != nil {
			m["linkedOrderIDs"] = s
		}
	}
	if v, ok := m["linkedTransIDs"]; ok {
		if s := toInt64SliceFromMixedArray(v); s != nil {
			m["linkedTransIDs"] = s
		}
	}
}

func toSliceAny(v any) ([]any, bool) {
	if v == nil {
		return nil, false
	}
	switch a := v.(type) {
	case []any:
		return a, true
	default:
		return nil, false
	}
}

func toStringIDSliceFromMixedArray(v any) []string {
	arr, ok := toSliceAny(v)
	if !ok {
		return nil
	}
	out := make([]string, 0, len(arr))
	for _, el := range arr {
		if el == nil {
			continue
		}
		s := stringFromJobOrCompleteField(el)
		if s == "" {
			continue
		}
		out = append(out, s)
	}
	return out
}

// stringFromJobOrCompleteField accepts string, JSON numbers, and common Firestore int types.
func stringFromJobOrCompleteField(v any) string {
	if v == nil {
		return ""
	}
	// Avoid default fmt.Sprint producing the literal "<nil>" for nil pointers (bad Firestore doc ids).
	rv := reflect.ValueOf(v)
	switch rv.Kind() {
	case reflect.Pointer, reflect.Interface, reflect.Slice, reflect.Map, reflect.Chan, reflect.Func:
		if rv.IsNil() {
			return ""
		}
	}
	switch t := v.(type) {
	case string:
		return t
	case bool:
		if t {
			return "true"
		}
		return "false"
	case int:
		return strconv.Itoa(t)
	case int32:
		return strconv.FormatInt(int64(t), 10)
	case int64:
		return strconv.FormatInt(t, 10)
	case uint, uint32, uint64:
		return fmt.Sprintf("%v", t)
	case float64:
		if math.Trunc(t) == t {
			if t >= -9e15 && t <= 9e15 {
				return strconv.FormatInt(int64(t), 10)
			}
		}
		return strconv.FormatFloat(t, 'f', -1, 64)
	case json.Number:
		if i, err := t.Int64(); err == nil {
			return strconv.FormatInt(i, 10)
		}
		return t.String()
	default:
		return fmt.Sprint(t)
	}
}

func toIntSliceFromMixedArray(v any) []int {
	arr, ok := toSliceAny(v)
	if !ok {
		return nil
	}
	out := make([]int, 0, len(arr))
	for _, el := range arr {
		if n, ok := intFromMixed(el); ok {
			out = append(out, n)
		}
	}
	return out
}

func intFromMixed(v any) (int, bool) {
	if v == nil {
		return 0, false
	}
	switch t := v.(type) {
	case int:
		return t, true
	case int32:
		return int(t), true
	case int64:
		return int(t), true
	case uint:
		return int(t), true
	case uint32:
		return int(t), true
	case uint64:
		if t > uint64(^uint(0)>>1) {
			return 0, false
		}
		return int(t), true
	case float64:
		if math.Trunc(t) == t {
			if t > float64(^uint(0)>>1) || t < -9e12 {
				return 0, false
			}
			return int(t), true
		}
		return 0, false
	case string:
		if t == "" {
			return 0, false
		}
		n, err := strconv.Atoi(t)
		if err != nil {
			return 0, false
		}
		return n, true
	case json.Number:
		i, err := t.Int64()
		if err != nil {
			return 0, false
		}
		return int(i), true
	default:
		return 0, false
	}
}

func toInt64SliceFromMixedArray(v any) []int64 {
	arr, ok := toSliceAny(v)
	if !ok {
		return nil
	}
	out := make([]int64, 0, len(arr))
	for _, el := range arr {
		if n, ok := int64FromMixed(el); ok {
			out = append(out, n)
		}
	}
	return out
}

func int64FromMixed(v any) (int64, bool) {
	if v == nil {
		return 0, false
	}
	switch t := v.(type) {
	case int:
		return int64(t), true
	case int32:
		return int64(t), true
	case int64:
		return t, true
	case uint:
		return int64(t), true
	case uint32:
		return int64(t), true
	case uint64:
		return int64(t), true
	case float64:
		if math.Trunc(t) == t {
			return int64(t), true
		}
		return 0, false
	case string:
		if t == "" {
			return 0, false
		}
		n, err := strconv.ParseInt(t, 10, 64)
		if err != nil {
			return 0, false
		}
		return n, true
	case json.Number:
		n, err := t.Int64()
		if err != nil {
			return 0, false
		}
		return n, true
	default:
		return 0, false
	}
}

func nonObjectElementDetail(el any) string {
	if el == nil {
		return "value is null"
	}
	if b, err := json.Marshal(el); err == nil {
		return fmt.Sprintf("type=%s json=%s", reflect.TypeOf(el).String(), truncateString(string(b), 240))
	}
	return fmt.Sprintf("type=%s", reflect.TypeOf(el).String())
}

func mapPreviewJSON(m map[string]any) string {
	if m == nil {
		return "null"
	}
	b, err := json.Marshal(m)
	if err != nil {
		return err.Error()
	}
	return string(b)
}

func truncateString(s string, max int) string {
	if max <= 0 {
		return ""
	}
	if len(s) <= max {
		return s
	}
	if max <= 1 {
		return s[:max]
	}
	return s[:max-1] + "…"
}
