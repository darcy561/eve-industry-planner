package mongo

import (
	"regexp"
	"strings"
	"testing"

	"eve-industry-planner/testing/gosource"
)

var bsonOmitzero = regexp.MustCompile(`bson:"[^"]*,omitzero`)

func TestNoBSONTagClaimsOmitzero(t *testing.T) {
	t.Parallel()

	var found []string
	root := gosource.ModuleRoot(t)
	gosource.EachFile(t, root, func(rel string, body []byte) {
		if bsonOmitzero.Match(body) {
			found = append(found, rel)
		}
	})
	if len(found) > 0 {
		t.Fatalf("bson tags claim omitzero, which the driver does not parse, so the zero value is written:\n  %s\n\nUse omitempty on the bson half and keep omitzero on the json half.",
			strings.Join(found, "\n  "))
	}
}
