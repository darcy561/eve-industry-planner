package mongo

import (
	"regexp"
	"strings"
	"testing"

	"eve-industry-planner/testing/gosource"
)

// bsonOmitzero matches an ",omitzero" inside a bson struct tag.
//
// The driver's tag parser knows omitempty, minsize, truncate and inline only, so
// ",omitzero" on a bson tag is not an option it declines, it is no option at all,
// and the zero value is written. A zero time.Time reaches the document as a year-1
// date that every reader then has to filter for. The json half of the same tag
// pair legitimately wants omitzero, which is what makes the mistake easy to make
// and invisible once made: both halves are usually written as one pair.
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
