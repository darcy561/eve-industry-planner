package models

import (
	"encoding/json"
	"fmt"
	"math"
	"strconv"
	"strings"
)

// FlexibleInt64 decodes JSON numbers or quoted decimal strings into int64.
// Some Firestore/legacy exports store ESI ids as strings. Non-numeric strings
// (e.g. UUID placeholders) decode as 0 so archive import does not fail.
type FlexibleInt64 int64

// Int64 returns the value as int64.
func (f FlexibleInt64) Int64() int64 { return int64(f) }

// UnmarshalJSON implements [json.Unmarshaler].
func (f *FlexibleInt64) UnmarshalJSON(b []byte) error {
	if len(b) == 0 || string(b) == "null" {
		*f = 0
		return nil
	}
	var n int64
	if err := json.Unmarshal(b, &n); err == nil {
		*f = FlexibleInt64(n)
		return nil
	}
	var x float64
	if err := json.Unmarshal(b, &x); err == nil {
		*f = FlexibleInt64(int64(x))
		return nil
	}
	var s string
	if err := json.Unmarshal(b, &s); err != nil {
		return err
	}
	s = strings.TrimSpace(s)
	if s == "" {
		*f = 0
		return nil
	}
	v, err := strconv.ParseInt(s, 10, 64)
	if err != nil {
		*f = 0
		return nil
	}
	*f = FlexibleInt64(v)
	return nil
}

// MarshalJSON implements [json.Marshaler].
func (f FlexibleInt64) MarshalJSON() ([]byte, error) {
	return json.Marshal(int64(f))
}

// FlexibleRoundedInt decodes JSON numbers and numeric strings into int with math.Round applied
// to non-integer floats. Legacy exports sometimes store near-integer totals as floats (FP noise).
type FlexibleRoundedInt int

// Int returns the value as int.
func (f FlexibleRoundedInt) Int() int { return int(f) }

// UnmarshalJSON implements [json.Unmarshaler].
func (f *FlexibleRoundedInt) UnmarshalJSON(b []byte) error {
	if len(b) == 0 || string(b) == "null" {
		*f = 0
		return nil
	}
	var n int64
	if err := json.Unmarshal(b, &n); err == nil {
		*f = FlexibleRoundedInt(n)
		return nil
	}
	var x float64
	if err := json.Unmarshal(b, &x); err == nil {
		*f = FlexibleRoundedInt(int64(math.Round(x)))
		return nil
	}
	var s string
	if err := json.Unmarshal(b, &s); err != nil {
		return err
	}
	s = strings.TrimSpace(s)
	if s == "" {
		*f = 0
		return nil
	}
	if v, err := strconv.ParseInt(s, 10, 64); err == nil {
		*f = FlexibleRoundedInt(v)
		return nil
	}
	v, err := strconv.ParseFloat(s, 64)
	if err != nil {
		*f = 0
		return nil
	}
	*f = FlexibleRoundedInt(int64(math.Round(v)))
	return nil
}

// MarshalJSON implements [json.Marshaler].
func (f FlexibleRoundedInt) MarshalJSON() ([]byte, error) {
	return json.Marshal(int(f))
}

// FlexibleFloat64 decodes JSON numbers or numeric strings into float64 (Firestore / legacy exports).
type FlexibleFloat64 float64

// Float64 returns the value as float64.
func (f FlexibleFloat64) Float64() float64 { return float64(f) }

// UnmarshalJSON implements [json.Unmarshaler].
func (f *FlexibleFloat64) UnmarshalJSON(b []byte) error {
	if len(b) == 0 || string(b) == "null" {
		*f = 0
		return nil
	}
	var x float64
	if err := json.Unmarshal(b, &x); err == nil {
		*f = FlexibleFloat64(x)
		return nil
	}
	var s string
	if err := json.Unmarshal(b, &s); err != nil {
		return err
	}
	s = strings.TrimSpace(s)
	if s == "" {
		*f = 0
		return nil
	}
	v, err := strconv.ParseFloat(s, 64)
	if err != nil {
		*f = 0
		return nil
	}
	*f = FlexibleFloat64(v)
	return nil
}

// MarshalJSON implements [json.Marshaler].
func (f FlexibleFloat64) MarshalJSON() ([]byte, error) {
	return json.Marshal(float64(f))
}

// FlexibleString decodes JSON strings, numbers, or booleans into a string (legacy / Firestore type drift).
type FlexibleString string

// String returns the value as a plain string.
func (f FlexibleString) String() string { return string(f) }

// UnmarshalJSON implements [json.Unmarshaler].
func (f *FlexibleString) UnmarshalJSON(b []byte) error {
	if len(b) == 0 || string(b) == "null" {
		*f = ""
		return nil
	}
	var s string
	if err := json.Unmarshal(b, &s); err == nil {
		*f = FlexibleString(s)
		return nil
	}
	var n int64
	if err := json.Unmarshal(b, &n); err == nil {
		*f = FlexibleString(strconv.FormatInt(n, 10))
		return nil
	}
	var x float64
	if err := json.Unmarshal(b, &x); err == nil {
		*f = FlexibleString(strconv.FormatFloat(x, 'f', -1, 64))
		return nil
	}
	var bl bool
	if err := json.Unmarshal(b, &bl); err == nil {
		*f = FlexibleString(strconv.FormatBool(bl))
		return nil
	}
	return fmt.Errorf("FlexibleString: cannot decode %s", string(b))
}

// MarshalJSON implements [json.Marshaler].
func (f FlexibleString) MarshalJSON() ([]byte, error) {
	return json.Marshal(string(f))
}
