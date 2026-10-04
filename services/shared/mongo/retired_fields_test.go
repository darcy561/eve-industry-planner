package mongo

import (
	"strings"
	"testing"

	"eve-industry-planner/testing/gosource"
)

var retiredFieldPaths = []string{
	"_meta.accountID",
	"_meta.corporationRef",
	"_meta.allianceRef",
	"owner.kind",
	"owner.id",
}

var retiredFieldExceptions = map[string]string{
	"core/commands/release_meta_owner.go":  "derives the owner from the account id it is replacing",
	"cmd/mongo_driver_v2_smoke/main.go":    "writes and reads its own throwaway document shape",
	"core/commands/job_identity_encode.go": "runs before the owner stamp in the cutover window, so the account id is all a document carries",
	"core/commands/release_extras_labels.go": "counts documents the owner stamp has not reached, so a dry run can say so " +
		"rather than reporting no work",
}

func TestNoQueryNamesARetiredField(t *testing.T) {
	t.Parallel()

	var found []string
	gosource.EachFile(t, gosource.ModuleRoot(t), func(rel string, body []byte) {
		if strings.HasSuffix(rel, "_test.go") {
			return
		}
		if _, allowed := retiredFieldExceptions[rel]; allowed {
			return
		}
		for _, field := range retiredFieldPaths {
			if strings.Contains(string(body), `"`+field+`"`) {
				found = append(found, rel+" names "+field)
			}
		}
	})
	if len(found) > 0 {
		t.Fatalf("retired storage fields are still named in queries:\n  %s\n\nThe owner lives at %s / %s.",
			strings.Join(found, "\n  "), FieldMetaOwnerKind, FieldMetaOwnerID)
	}
}
