// Package builder is a reusable full-body wizard (section nav | huh form + Finish).
// Screens supply Sections; home embeds Session while the wizard is open.
package builder

// Kind selects how a field is edited and displayed.
type Kind int

const (
	KindText   Kind = iota
	KindSecret      // deprecated: treated as plain KindText (ops TUI shows values)
	KindReadonly
	KindBool // huh Confirm (space / ←→)
)

// Field is one declarative form input (SoT for env/config builders).
type Field struct {
	ID    string
	Label string
	Help  string
	Kind  Kind
	Value string

	// BoolYes / BoolNo label KindBool Confirm choices (empty → Enabled / Disabled).
	BoolYes string
	BoolNo  string

	Autogen     bool   // show Autogen checkbox (first create only)
	AllowRoll   bool   // show Roll checkbox (day-2 non-Locked secrets)
	AutogenOn   bool   // generate on save; hide manual input when set
	Locked      bool   // permanently read-only (no Autogen / Roll)
	PendingRoll bool   // regenerate on Finish only (buffer kept until then)
	Status      string // live validation / Autogen / roll hint
	// Validate refreshes Status from Value. "" leaves Status unchanged.
	Validate func(value string) string
}

// Section is a wizard step with zero or more fields.
type Section struct {
	ID     string
	Title  string
	Help   string
	Fields []Field
}

func (f Field) canAutogen() bool { return f.Autogen && !f.Locked }
func (f Field) canRoll() bool    { return f.AllowRoll && !f.Locked }

// CancelMsg leaves the builder without finishing (home restores ops).
type CancelMsg struct{}

// DoneMsg finishes the builder after validation (parent should Persist).
type DoneMsg struct{}
