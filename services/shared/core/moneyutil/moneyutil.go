package moneyutil

import "math"

const round2Eps = 1e-9

// Round2 rounds a float to 2 decimal places for ISK-style values.
func Round2(x float64) float64 {
	return math.Round((x+round2Eps)*100) / 100
}
