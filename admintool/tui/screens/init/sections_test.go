package initui

import (
	"strings"
	"testing"

	"eve-industry-planner/admintool/internal/kit/templates/env"
	"eve-industry-planner/admintool/tui/builder"
)

func TestNewSessionView(t *testing.T) {
	s := NewSession()
	s.SetSize(40, 70, 24)
	view := s.View()
	if view == "" {
		t.Fatal("empty")
	}
	if !strings.Contains(view, "SETUP") {
		t.Fatalf("missing SETUP: %q", view[:min(120, len(view))])
	}
}

func TestBuilderFieldFromEnvFirstCreateVsDay2(t *testing.T) {
	t.Parallel()
	mongo := env.EnvField{
		Key: "MONGO_PASSWORD", Label: "Mongo", Type: env.FieldPassword,
		Autogen: true, Locked: true, Required: true,
	}
	hmac := env.EnvField{
		Key: "AUTHZ_HMAC_KEY", Label: "HMAC", Type: env.FieldHMAC,
		Autogen: true, Required: true,
	}
	set := "already-set-secret-value-here-ok"

	first := builderFieldFromEnv(mongo, "")
	if !first.Autogen || first.AllowRoll || first.Locked {
		t.Fatalf("first mongo: Autogen=%v AllowRoll=%v Locked=%v", first.Autogen, first.AllowRoll, first.Locked)
	}
	if !first.AutogenOn {
		t.Fatal("required empty Autogen should default on")
	}

	day2Mongo := builderFieldFromEnv(mongo, set)
	if day2Mongo.Autogen || day2Mongo.AllowRoll || !day2Mongo.Locked {
		t.Fatalf("day2 mongo: Autogen=%v AllowRoll=%v Locked=%v", day2Mongo.Autogen, day2Mongo.AllowRoll, day2Mongo.Locked)
	}
	if day2Mongo.Kind != builder.KindText {
		t.Fatalf("day2 mongo kind=%v want plain text (visible + copyable)", day2Mongo.Kind)
	}

	hmac.Locked = true
	day2HMAC := builderFieldFromEnv(hmac, set)
	if day2HMAC.Autogen || day2HMAC.AllowRoll || !day2HMAC.Locked {
		t.Fatalf("day2 hmac: Autogen=%v AllowRoll=%v Locked=%v", day2HMAC.Autogen, day2HMAC.AllowRoll, day2HMAC.Locked)
	}

	s3 := env.EnvField{Key: "S3_SECRET_KEY", Label: "S3", Type: env.FieldPassword, Autogen: true, Required: true}
	day2S3 := builderFieldFromEnv(s3, set)
	if day2S3.Autogen || !day2S3.AllowRoll || day2S3.Locked {
		t.Fatalf("day2 s3: Autogen=%v AllowRoll=%v Locked=%v", day2S3.Autogen, day2S3.AllowRoll, day2S3.Locked)
	}
}
