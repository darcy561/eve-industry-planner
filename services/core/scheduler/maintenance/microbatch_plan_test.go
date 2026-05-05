package maintenance

import "testing"

func TestMicroBatchPlan(t *testing.T) {
	t.Parallel()
	cases := []struct {
		name      string
		n         int
		wantSlice int
		wantReq   int
	}{
		{"zero", 0, 0, 0},
		{"one", 1, 1, 1},
		{"fits_full_window", 50, 39, 2}, // 585s / 15s = 39 slices; ceil(50/39)=2
		{"small_batch", 3, 3, 1},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			ps, rq := microBatchPlan(tc.n)
			if ps != tc.wantSlice || rq != tc.wantReq {
				t.Fatalf("microBatchPlan(%d) = (%d,%d) want (%d,%d)", tc.n, ps, rq, tc.wantSlice, tc.wantReq)
			}
		})
	}
}
