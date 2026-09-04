package nats

import (
	"os"
	"regexp"
	"strings"
	"testing"
	"time"
)

// Every definition must be reachable by name: the worker resolves priority and
// timeout that way, and a task missing from the registry silently falls back to
// defaults.
func TestAllTasksAreRegisteredUnderTheirName(t *testing.T) {
	defs := Tasks()
	if len(defs) == 0 {
		t.Fatal("no tasks registered")
	}
	for _, d := range defs {
		got, ok := LookupTask(d.Name)
		if !ok {
			t.Errorf("%s is not registered under its own name", d.Name)
			continue
		}
		if got.Subject != d.Subject {
			t.Errorf("%s: registered subject %q, want %q", d.Name, got.Subject, d.Subject)
		}
	}
}

// A task's subject must end in its name: the worker derives the asynq task type
// from the subject's last segment, so a mismatch routes to nothing.
func TestSubjectsEndInTaskName(t *testing.T) {
	for _, d := range Tasks() {
		if want := "." + d.Name; len(d.Subject) < len(want) || d.Subject[len(d.Subject)-len(want):] != want {
			t.Errorf("%s: subject %q does not end in %q", d.Name, d.Subject, want)
		}
	}
}

func TestDefinitionsCarryPriorityAndTimeout(t *testing.T) {
	for _, d := range Tasks() {
		if d.DefaultPriority == "" {
			t.Errorf("%s has no default priority", d.Name)
		}
		if d.DefaultTimeout <= 0 || d.DefaultTimeout > time.Hour {
			t.Errorf("%s has an implausible default timeout: %v", d.Name, d.DefaultTimeout)
		}
	}
}

// Every task must have a publish or trigger helper: those helpers are the API, and
// a definition without one can only be published by reaching past them.
func TestEveryTaskHasAPublishHelper(t *testing.T) {
	source, err := os.ReadFile("tasks.go")
	if err != nil {
		t.Fatal(err)
	}
	text := string(source)
	for _, d := range Tasks() {
		name := definitionVarName(text, d.Name)
		if name == "" {
			t.Errorf("%s has no definition var in tasks.go", d.Name)
			continue
		}
		if !strings.Contains(text, "func Publish"+name+"(") && !strings.Contains(text, "func Trigger"+name+"(") {
			t.Errorf("%s has no Publish/Trigger helper", name)
		}
	}
}

// definitionVarName finds the exported var a task name was defined under.
func definitionVarName(source, taskName string) string {
	re := regexp.MustCompile(`(?m)^\t(\w+) = defineTask\(Definition\{\n\t\tName:\s+"` + regexp.QuoteMeta(taskName) + `"`)
	m := re.FindStringSubmatch(source)
	if len(m) < 2 {
		return ""
	}
	return m[1]
}

// A subject is a task's identity on the wire, so the worker resolves it by
// lookup rather than by reading the last segment. Anything the registry does not
// claim names no task, and is refused rather than run on guessed settings.
func TestTaskBySubjectResolvesEveryTask(t *testing.T) {
	for _, d := range Tasks() {
		got, ok := TaskBySubject(d.Subject)
		if !ok {
			t.Errorf("%s: subject %q resolves to no task", d.Name, d.Subject)
			continue
		}
		if got.Name != d.Name {
			t.Errorf("subject %q resolves to %s, want %s", d.Subject, got.Name, d.Name)
		}
	}
}

func TestTaskBySubjectRefusesWhatItDoesNotKnow(t *testing.T) {
	for _, subject := range []string{
		"",
		"task.",
		"task.migration.somethingRetired",
		// A real task's name on a subject it does not live on: reading the last
		// segment would have accepted this one.
		"task.wrongarea." + RefreshRegionMarketOrders.Name,
	} {
		if got, ok := TaskBySubject(subject); ok {
			t.Errorf("subject %q resolved to %s", subject, got.Name)
		}
	}
}
