package conversion

import (
	"os"
	"regexp"
	"slices"
	"sort"
	"testing"
)

// spaBandsPath is the SPA's copy of the band names, read from the repo rather
// than restated here. The names are a wire contract across languages: the server
// writes a system's band and a rig's security map under them, and the SPA matches
// a band against its own system tables. A name only one side knows stops the
// match silently rather than failing anywhere a reader would notice.
const spaBandsPath = "../../../../../../frontend/src/Context/defaultValues.jsx"

var spaBandEntry = regexp.MustCompile(`band:\s*"(\w+)"`)

func TestSPAAndServerAgreeOnTheSecurityBandNames(t *testing.T) {
	source, err := os.ReadFile(spaBandsPath)
	if err != nil {
		t.Fatalf("reading the SPA band names: %v", err)
	}

	found := spaBandEntry.FindAllSubmatch(source, -1)
	if len(found) == 0 {
		t.Fatal("no band names found where this test looks for them")
	}

	var spa []string
	for _, entry := range found {
		name := string(entry[1])
		if !slices.Contains(spa, name) {
			spa = append(spa, name)
		}
	}
	sort.Strings(spa)

	server := []string{SecurityBandHigh, SecurityBandLow, SecurityBandNull}
	sort.Strings(server)

	if !slices.Equal(spa, server) {
		t.Errorf("the SPA names %v; the server names %v", spa, server)
	}
}

// Every band the server can write has to be one the SPA's rig security maps are
// keyed by, because a rig's multiplier is read by band name.
func TestEveryBandTheServerWritesIsOneItAlsoReadsModifiersFor(t *testing.T) {
	for _, band := range []string{SecurityBandHigh, SecurityBandLow, SecurityBandNull} {
		if _, held := securityBandAttributes[band]; !held {
			t.Errorf("%q has no published security modifier attribute", band)
		}
	}
	if len(securityBandAttributes) != 3 {
		t.Errorf("securityBandAttributes holds %d bands, want 3", len(securityBandAttributes))
	}
}
