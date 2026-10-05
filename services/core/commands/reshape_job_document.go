package commands

import (
	"fmt"
	"slices"
	"sort"
	"strconv"

	"eve-industry-planner/shared/models"

	"go.mongodb.org/mongo-driver/v2/bson"
)

// reshapeReport is what one document's conversion did, so a dry run can say what a real run would
// change without writing anything.
type reshapeReport struct {
	RowsKeyed                int
	FeesFolded               int
	FeesDroppedLater         int
	FeesDroppedOrphan        int
	FeeISKDroppedLater       float64
	FeesDroppedCopy          int
	FeeISKDroppedCopy        float64
	FeeISKDroppedOrphan      float64
	TransactionsMinted       int
	OrdersMerged             int
	PurchaseTypeIDs          int
	DuplicateRows            int
	InventionVersionsStamped int
	AlreadyShaped            bool
	FieldsDropped            map[string]int
	Refusals                 []string
}

func (r reshapeReport) refused() bool { return len(r.Refusals) > 0 }

func (r *reshapeReport) add(other reshapeReport) {
	r.RowsKeyed += other.RowsKeyed
	r.FeesFolded += other.FeesFolded
	r.FeesDroppedLater += other.FeesDroppedLater
	r.FeesDroppedOrphan += other.FeesDroppedOrphan
	r.FeeISKDroppedLater += other.FeeISKDroppedLater
	r.FeesDroppedCopy += other.FeesDroppedCopy
	r.FeeISKDroppedCopy += other.FeeISKDroppedCopy
	r.FeeISKDroppedOrphan += other.FeeISKDroppedOrphan
	r.TransactionsMinted += other.TransactionsMinted
	r.OrdersMerged += other.OrdersMerged
	r.PurchaseTypeIDs += other.PurchaseTypeIDs
	r.DuplicateRows += other.DuplicateRows
	r.InventionVersionsStamped += other.InventionVersionsStamped
	for field, count := range other.FieldsDropped {
		if r.FieldsDropped == nil {
			r.FieldsDropped = map[string]int{}
		}
		r.FieldsDropped[field] += count
	}
	r.Refusals = append(r.Refusals, other.Refusals...)
}

// mintTransactionID supplies an id for a hand-entered sale that carries none.
type mintTransactionID func() int64

// reshapeJobDocument converts one stored job into its reshaped document on a copy, refusing one whose
// conversion would lose a row it cannot account for.
func reshapeJobDocument(doc bson.M, mint mintTransactionID) (bson.M, reshapeReport) {
	var report reshapeReport
	out := deepCopy(doc)

	if alreadyReshaped(out) {
		report.AlreadyShaped = true
		return out, report
	}

	out["skills"] = keyRows(asArray(out["skills"]), "typeID", "skills", &report)

	build := asDocument(out["build"])
	esi := bson.M{}

	orders := keyOrders(asArray(pathValue(build, "sale", "marketOrders")), &report)
	report.FeesFolded = foldBrokerFees(orders, asArray(pathValue(build, "sale", "brokersFee")), &report)
	esi["marketOrders"] = orders
	esi["industryJobs"] = keyRows(asArray(pathValue(build, "costs", "linkedJobs")), "job_id", "esi.industryJobs", &report)
	esi["transactions"] = keyTransactions(asArray(pathValue(build, "sale", "transactions")), mint, &report)

	build["materials"] = keyMaterials(asArray(build["materials"]), &report)
	build["extrasCosts"] = keyRows(asArray(pathValue(build, "costs", "extrasCosts")), "id", "build.extrasCosts", &report)
	build["inventionEntries"] = stampInventionVersions(
		keyRows(asArray(pathValue(build, "costs", "inventionEntries")), "id", "build.inventionEntries", &report), &report)

	if plan := asDocument(pathValue(build, "sale", "plan")); len(plan) > 0 {
		for _, field := range []string{"sellerCharacter", "saleLocationID"} {
			if value, held := plan[field]; held {
				build[field] = value
			}
		}
	}
	delete(build, "costs")
	delete(build, "sale")

	emptyLayout(out, build)
	pruneToShape(out, build, esi, &report)

	out["build"] = build
	out["esi"] = esi
	return out, report
}

// The fields a reshaped job holds, and nothing else.
var (
	reshapedJobFields = []string{
		"_id", "_meta", "schemaVersion", "jobID", "name", "jobType", "jobStatus",
		"itemID", "blueprintTypeID", "metaLevel", "volume", "maxProductionLimit",
		"itemsProducedPerRun", "groupID", "includedInGroup", "displayOnPlanner",
		"isReadyToSell", "parentJobs", "protected", "filedCostMonth", "filedSalesMonth",
		"rawData", "skills", "build", "esi",
	}
	reshapedBuildFields = []string{
		"setup", "materials", "childJobs", "extrasCosts", "inventionEntries",
		"localPricing", "materialPriceOverrides", "sellerCharacter", "saleLocationID",
	}
	reshapedESIFields = []string{"industryJobs", "marketOrders", "transactions"}

	derivedSetupFields = []string{"estimatedTime", "estimatedInstallCost"}
)

// pruneToShape drops what the reshaped document does not hold, counting every drop by name so an
// unexpected field shows up in the report.
func pruneToShape(out bson.M, build bson.M, esi bson.M, report *reshapeReport) {
	prune(out, reshapedJobFields, "", report)
	prune(build, reshapedBuildFields, "build.", report)
	prune(esi, reshapedESIFields, "esi.", report)

	for _, setup := range asDocument(build["setup"]) {
		entry := asDocument(setup)
		for _, field := range derivedSetupFields {
			if _, held := entry[field]; held {
				delete(entry, field)
				countDropped(report, "build.setup."+field)
			}
		}
	}
}

func prune(doc bson.M, keep []string, prefix string, report *reshapeReport) {
	for field := range doc {
		if slices.Contains(keep, field) {
			continue
		}
		delete(doc, field)
		countDropped(report, prefix+field)
	}
}

func countDropped(report *reshapeReport, field string) {
	if report.FieldsDropped == nil {
		report.FieldsDropped = map[string]int{}
	}
	report.FieldsDropped[field]++
}

// emptyLayout reads `layout` out to where each of its fields belongs.
func emptyLayout(out bson.M, build bson.M) {
	layout := asDocument(out["layout"])
	delete(out, "layout")
	if layout == nil {
		return
	}

	if overrides := asDocument(layout["materialPriceOverrides"]); len(overrides) > 0 {
		build["materialPriceOverrides"] = overrides
	}
	market := firstString(layout["localMarketDisplay"], layout["marketLocation"])
	orderType := firstString(layout["localOrderDisplay"], layout["orderType"])
	if pricing := jobPricingOverride(asDocument(layout["localPricing"]), market, orderType); pricing != nil {
		build["localPricing"] = pricing
	}
}

// jobPricingOverride folds a job's superseded single market and order type into the per-side choice
// that replaced them, once, as the document is converted.
func jobPricingOverride(stored bson.M, market string, orderType string) bson.M {
	side := func(name string) bson.M {
		chosen := asDocument(stored[name])
		if asString(chosen["market"]) != "" || asString(chosen["orderType"]) != "" {
			return pricingSide(asString(chosen["market"]), asString(chosen["orderType"]))
		}
		return pricingSide(market, orderType)
	}
	buying, selling := side("buying"), side("selling")
	if len(buying) > 0 || len(selling) > 0 {
		return bson.M{"buying": buying, "selling": selling}
	}
	return nil
}

// pricingSide writes only what was chosen. `models.PricingChoice` tags both fields `omitempty` and
// an empty side is `{}`, so writing `""` would put a value where the model states there is none.
func pricingSide(market string, orderType string) bson.M {
	side := bson.M{}
	if market != "" {
		side["market"] = market
	}
	if orderType != "" {
		side["orderType"] = orderType
	}
	return side
}

func firstString(values ...any) string {
	for _, value := range values {
		if text := asString(value); text != "" {
			return text
		}
	}
	return ""
}

// stampInventionVersions names the shape each stored invention entry was written in.
func stampInventionVersions(entries bson.M, report *reshapeReport) bson.M {
	for _, row := range entries {
		entry := asDocument(row)
		if asInt64(entry["version"]) > 0 {
			continue
		}
		entry["version"] = models.InventionEntrySchemaCurrent
		report.InventionVersionsStamped++
	}
	return entries
}

// alreadyReshaped reports whether this document has been through the conversion.
func alreadyReshaped(doc bson.M) bool {
	build := asDocument(doc["build"])
	return asDocument(doc["esi"]) != nil && build != nil &&
		build["costs"] == nil && build["sale"] == nil
}

// keyRows turns one row collection into a map addressed by the id its rows already carry.
func keyRows(rows bson.A, key string, where string, report *reshapeReport) bson.M {
	out := bson.M{}
	for _, row := range rows {
		document := asDocument(row)
		id, usable := mapKey(document[key])
		if !usable {
			report.Refusals = append(report.Refusals,
				fmt.Sprintf("%s: a row carries no usable %s", where, key))
			continue
		}
		if held, seen := out[id]; seen {
			collapse(asDocument(held), document, where, id, report)
			continue
		}
		out[id] = document
	}
	report.RowsKeyed += len(out)
	return out
}

// collapse decides what two rows under one key mean.
func collapse(held bson.M, incoming bson.M, where string, id string, report *reshapeReport) {
	if sameRow(held, incoming) {
		report.DuplicateRows++
		return
	}
	report.Refusals = append(report.Refusals,
		fmt.Sprintf("%s: two rows under %s differ", where, id))
}

// sameRow reports whether two rows hold the same values.
func sameRow(a any, b any) bool {
	switch left := a.(type) {
	case bson.M:
		right := asDocument(b)
		if right == nil || len(left) != len(right) {
			return false
		}
		for key, value := range left {
			other, held := right[key]
			if !held || !sameRow(value, other) {
				return false
			}
		}
		return true
	case map[string]any:
		return sameRow(bson.M(left), b)
	case bson.A:
		right := asArray(b)
		if len(left) != len(right) {
			return false
		}
		for i, value := range left {
			if !sameRow(value, right[i]) {
				return false
			}
		}
		return true
	case []any:
		return sameRow(bson.A(left), b)
	default:
		if isNumber(a) && isNumber(b) {
			return asFloat64(a) == asFloat64(b)
		}
		return a == b
	}
}

func isNumber(value any) bool {
	switch value.(type) {
	case int, int32, int64, float64:
		return true
	default:
		return false
	}
}

// keyMaterials keys the materials and, inside each, its purchases.
func keyMaterials(rows bson.A, report *reshapeReport) bson.M {
	out := bson.M{}
	for _, row := range rows {
		material := asDocument(row)
		id, usable := mapKey(material["typeID"])
		if !usable {
			report.Refusals = append(report.Refusals, "build.materials: a row carries no usable typeID")
			continue
		}
		purchases := asArray(material["purchasing"])
		for _, purchase := range purchases {
			if _, held := asDocument(purchase)["typeID"]; held {
				report.PurchaseTypeIDs++
			}
		}
		material["purchasing"] = keyRows(purchases, "id", "build.materials."+id+".purchasing", report)
		for _, purchase := range asDocument(material["purchasing"]) {
			delete(asDocument(purchase), "typeID")
		}
		if held, seen := out[id]; seen {
			collapse(asDocument(held), material, "build.materials", id, report)
			continue
		}
		out[id] = material
	}
	report.RowsKeyed += len(out)
	return out
}

// keyOrders keys the market orders, keeping the longest `timeStamps` where two copies of one order
// collapse.
func keyOrders(rows bson.A, report *reshapeReport) bson.M {
	out := bson.M{}
	for _, row := range rows {
		order := asDocument(row)
		id, usable := mapKey(order["order_id"])
		if !usable {
			report.Refusals = append(report.Refusals, "esi.marketOrders: a row carries no usable order_id")
			continue
		}
		held, seen := out[id]
		if !seen {
			out[id] = order
			continue
		}
		if !sameOrderBesidesHistory(asDocument(held), order) {
			report.Refusals = append(report.Refusals,
				fmt.Sprintf("esi.marketOrders: two rows under %s differ in more than timeStamps", id))
			continue
		}
		report.OrdersMerged++
		if len(asArray(order["timeStamps"])) > len(asArray(asDocument(held)["timeStamps"])) {
			out[id] = order
		}
	}
	report.RowsKeyed += len(out)
	return out
}

// sameOrderBesidesHistory reports whether two rows for one order agree on everything except how much
// of its history each observed.
func sameOrderBesidesHistory(held bson.M, incoming bson.M) bool {
	a, b := deepCopy(held), deepCopy(incoming)
	delete(a, "timeStamps")
	delete(b, "timeStamps")
	delete(a, "fee")
	delete(b, "fee")
	return sameRow(a, b)
}

// keyTransactions keys the sales, minting an id for a hand-entered one that carries none.
func keyTransactions(rows bson.A, mint mintTransactionID, report *reshapeReport) bson.M {
	out := bson.M{}
	for _, row := range rows {
		transaction := asDocument(row)
		if asInt64(transaction["transaction_id"]) <= 0 {
			transaction["transaction_id"] = mint()
			report.TransactionsMinted++
		}
		id, usable := mapKey(transaction["transaction_id"])
		if !usable {
			report.Refusals = append(report.Refusals, "esi.transactions: a row carries no usable transaction_id")
			continue
		}
		if held, seen := out[id]; seen {
			collapse(asDocument(held), transaction, "esi.transactions", id, report)
			continue
		}
		out[id] = transaction
	}
	report.RowsKeyed += len(out)
	return out
}

// foldBrokerFees moves each fee onto the order it was charged against.
func foldBrokerFees(orders bson.M, fees bson.A, report *reshapeReport) int {
	oldest := map[string]bson.M{}
	for _, row := range fees {
		fee := asDocument(row)
		id, usable := mapKey(fee["order_id"])
		if !usable {
			report.Refusals = append(report.Refusals, "brokersFee: a row carries no usable order_id")
			continue
		}
		delete(fee, "complete")
		delete(fee, "CharacterHash")
		delete(fee, "order_id")

		held, seen := oldest[id]
		if !seen {
			oldest[id] = fee
			continue
		}
		older, newer := held, fee
		if isOlderFee(fee, held) {
			older, newer = fee, held
		}
		oldest[id] = older

		if sameRow(held, fee) {
			report.FeesDroppedCopy++
			report.FeeISKDroppedCopy += asFloat64(newer["amount"])
			continue
		}
		report.FeesDroppedLater++
		report.FeeISKDroppedLater += asFloat64(newer["amount"])
	}

	folded := 0
	for id, row := range orders {
		if fee, held := oldest[id]; held {
			order := asDocument(row)
			order["fee"] = asFloat64(fee["amount"])
			order["salesTax"] = asFloat64(fee["salesTax"])
			order["feeDate"] = asString(fee["date"])
			delete(oldest, id)
			folded++
		}
	}

	for _, fee := range sortedByKey(oldest) {
		report.FeesDroppedOrphan++
		report.FeeISKDroppedOrphan += asFloat64(fee["amount"])
	}
	return folded
}

// isOlderFee reports whether an incoming fee was charged before the one already held for its order.
func isOlderFee(incoming bson.M, held bson.M) bool {
	date := asString(incoming["date"])
	if date == "" {
		return false
	}
	current := asString(held["date"])
	return current == "" || date < current
}

// sortedByKey walks a map in a fixed order, so a report of what was dropped reads the same way
// twice.
func sortedByKey(rows map[string]bson.M) []bson.M {
	keys := make([]string, 0, len(rows))
	for key := range rows {
		keys = append(keys, key)
	}
	sort.Strings(keys)
	out := make([]bson.M, 0, len(keys))
	for _, key := range keys {
		out = append(out, rows[key])
	}
	return out
}

// mapKey renders a row's id as the map key it becomes.
func mapKey(value any) (string, bool) {
	switch typed := value.(type) {
	case string:
		return typed, typed != ""
	case int32:
		return strconv.FormatInt(int64(typed), 10), true
	case int64:
		return strconv.FormatInt(typed, 10), true
	case int:
		return strconv.Itoa(typed), true
	case float64:
		if typed != float64(int64(typed)) {
			return "", false
		}
		return strconv.FormatInt(int64(typed), 10), true
	default:
		return "", false
	}
}

// deepCopy copies the maps and arrays a conversion reaches into, so rewriting one cannot reach back
// into the caller's document.
func deepCopy(value any) bson.M {
	copied, _ := deepCopyValue(value).(bson.M)
	return copied
}

func deepCopyValue(value any) any {
	switch typed := value.(type) {
	case bson.M:
		out := make(bson.M, len(typed))
		for key, held := range typed {
			out[key] = deepCopyValue(held)
		}
		return out
	case map[string]any:
		return deepCopyValue(bson.M(typed))
	case bson.A:
		out := make(bson.A, len(typed))
		for i, held := range typed {
			out[i] = deepCopyValue(held)
		}
		return out
	case []any:
		return deepCopyValue(bson.A(typed))
	default:
		return value
	}
}

func pathValue(doc bson.M, path ...string) any {
	var value any = doc
	for _, step := range path {
		document := asDocument(value)
		if document == nil {
			return nil
		}
		value = document[step]
	}
	return value
}

func asDocument(value any) bson.M {
	switch typed := value.(type) {
	case bson.M:
		return typed
	case map[string]any:
		return bson.M(typed)
	default:
		return nil
	}
}

func asArray(value any) bson.A {
	switch typed := value.(type) {
	case bson.A:
		return typed
	case []any:
		return bson.A(typed)
	default:
		return nil
	}
}

func asString(value any) string {
	text, _ := value.(string)
	return text
}

func asInt64(value any) int64 {
	switch typed := value.(type) {
	case int32:
		return int64(typed)
	case int64:
		return typed
	case int:
		return int64(typed)
	case float64:
		return int64(typed)
	default:
		return 0
	}
}

func asFloat64(value any) float64 {
	switch typed := value.(type) {
	case float64:
		return typed
	case int32:
		return float64(typed)
	case int64:
		return float64(typed)
	case int:
		return float64(typed)
	default:
		return 0
	}
}
