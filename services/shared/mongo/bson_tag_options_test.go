package mongo

import (
	"os"
	"path/filepath"
	"regexp"
	"strings"
	"testing"
)

// bsonOmitzero matches an ",omitzero" inside a bson struct tag.
//
// The driver's tag parser knows omitempty, minsize, truncate and inline only, so
// ",omitzero" on a bson tag is not an option it declines, it is no option at all,
// and the zero value is written. A zero time.Time reaches the document as a year-1
// date that every reader then has to filter for. The json half of the same tag
// pair legitimately wants omitzero, which is what makes the mistake easy to make
// and invisible once made: both halves are usually written as one pair.
//
// Swept over the source rather than by reflection over a list of models, because
// the invariant is that no bson tag anywhere says this — a list would only cover
// the models someone remembered to add.
var bsonOmitzero = regexp.MustCompile(`bson:"[^"]*,omitzero`)

func TestNoBSONTagClaimsOmitzero(t *testing.T) {
	t.Parallel()
	root := moduleRoot(t)

	var found []string
	err := filepath.WalkDir(root, func(path string, d os.DirEntry, err error) error {
		if err != nil || d.IsDir() || !strings.HasSuffix(path, ".go") {
			return err
		}
		body, readErr := os.ReadFile(path)
		if readErr != nil {
			return readErr
		}
		if !bsonOmitzero.Match(body) {
			return nil
		}
		rel, relErr := filepath.Rel(root, path)
		if relErr != nil {
			return relErr
		}
		found = append(found, filepath.ToSlash(rel))
		return nil
	})
	if err != nil {
		t.Fatalf("walk: %v", err)
	}
	if len(found) > 0 {
		t.Fatalf("bson tags claim omitzero, which the driver does not parse, so the zero value is written:\n  %s\n\nUse omitempty on the bson half and keep omitzero on the json half.",
			strings.Join(found, "\n  "))
	}
}
