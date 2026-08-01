// Package builder is a reusable full-body wizard (section nav | form).
// Screens supply Sections; home embeds Session while the wizard is open.
package builder

// Kind selects how a field is edited and displayed.
type Kind int

const (
	KindText Kind = iota
	KindSecret
	KindReadonly
	KindBool // space toggles true/false (no text input)
)

// Field is one declarative form input.
type Field struct {
	ID    string
	Label string
	Help  string
	Kind  Kind
	Value string

	// Autogen: show generate checkbox (space toggles AutogenOn).
	Autogen   bool
	AutogenOn bool // checked = generate on save; hide manual input
	// Locked: existing real secret — read-only, no checkbox / roll.
	Locked bool
	// PendingRoll: regenerate this Autogen field on Finish only (buffer unchanged until then).
	// Not available when Locked (DB password roll is a later feature).
	PendingRoll bool
	// Status is live validation / Autogen / roll hint under the field.
	Status string
	// Validate optionally refreshes Status from Value (e.g. path writability).
	// Return "" to leave Status unchanged; non-empty replaces Status.
	Validate func(value string) string
}

// Section is a wizard step with zero or more fields.
type Section struct {
	ID     string
	Title  string
	Help   string
	Fields []Field
}

// CancelMsg leaves the builder without finishing (home restores ops).
type CancelMsg struct{}

// DoneMsg finishes the builder after validation (parent should Persist).
type DoneMsg struct{}
