package status

import (
	"strings"
	"testing"

	"eve-industry-planner/admintool/internal/status"
)

func TestRender(t *testing.T) {
	out := Render(status.Report{
		StackName:     "eip",
		StackPresent:  true,
		Source:        "live",
		Overall:       status.OK,
		OverallDetail: "everything expected is up",
		Groups: []status.GroupSection{
			{
				Title: "App",
				Rows: []status.ServiceRow{
					{Label: "API", Signal: status.OK, Detail: "1/1 up"},
				},
			},
		},
	})
	if !strings.Contains(out, "App") || !strings.Contains(out, "API") {
		t.Fatal(out)
	}
	if !strings.Contains(out, "Summary") || !strings.Contains(out, "live") {
		t.Fatal(out)
	}
}
