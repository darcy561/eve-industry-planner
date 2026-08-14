package server

import (
	"context"
	"testing"

	"eve-industry-planner/shared/stackservices"
)

func TestDocSubscribeAuthorized_singletonAccountDocs(t *testing.T) {
	s := &Server{Stack: &stackservices.Clients{}}

	if !s.docSubscribeAuthorized(context.Background(), "users.acc123", "acc123") {
		t.Fatal("expected users doc for same account")
	}
	if s.docSubscribeAuthorized(context.Background(), "users.other", "acc123") {
		t.Fatal("expected reject users doc for other account id")
	}
	if !s.docSubscribeAuthorized(context.Background(), "application_settings.acc123", "acc123") {
		t.Fatal("expected application_settings for same account")
	}
	if s.docSubscribeAuthorized(context.Background(), "application_settings.other", "acc123") {
		t.Fatal("expected reject settings for other account")
	}
}

func TestDocSubscribeAuthorized_unknownCollectionDenied(t *testing.T) {
	s := &Server{Stack: &stackservices.Clients{}}
	if s.docSubscribeAuthorized(context.Background(), "blueprints.123", "acc123") {
		t.Fatal("expected deny unknown / public collection")
	}
	if s.docSubscribeAuthorized(context.Background(), "random.foo", "acc123") {
		t.Fatal("expected deny unknown collection")
	}
}

func TestDocSubscribeAuthorized_jobsRequiresMongo(t *testing.T) {
	s := &Server{Stack: &stackservices.Clients{Mongo: nil}}
	if s.docSubscribeAuthorized(context.Background(), "jobs.any-id", "acc123") {
		t.Fatal("expected deny jobs when mongo unavailable")
	}
}
