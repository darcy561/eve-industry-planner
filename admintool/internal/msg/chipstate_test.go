package msg

import (
	"encoding/json"
	"testing"

	"eve-industry-planner/admintool/internal/process"
)

func TestEmitDisabledIsNoop(t *testing.T) {
	t.Setenv(process.EnvFromTUI, "")
	EmitDockerFromSwarm("active", "api 1", false)
	EmitHealthFromProbe(LightGreen, "ok")
	EmitStack("deploying", LightAmber, "up…")
	EmitStackForVerb("up")
}

func TestEventFromEnvelope(t *testing.T) {
	raw, _ := json.Marshal(Event{State: "active", Light: LightGreen, Message: "api 1"})
	env := Envelope{Version: Version, Type: TypeChipDocker, Data: raw}
	ev, ok := EventFromEnvelope(env)
	if !ok || ev.Kind != KindDocker || ev.State != "active" || ev.Light != LightGreen {
		t.Fatalf("%v %+v", ok, ev)
	}
}

func TestKindMatchesEIPMSGTypes(t *testing.T) {
	if KindDocker != TypeChipDocker || KindHealth != TypeChipHealth || KindStack != TypeChipStack {
		t.Fatal("chipstate kinds must be eipmsg type strings")
	}
}
