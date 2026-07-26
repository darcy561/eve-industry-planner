package docker

import "testing"

func TestFormatServiceLogLine(t *testing.T) {
	t.Parallel()
	in := "com.docker.swarm.node.id=abc,com.docker.swarm.service.id=def,com.docker.swarm.task.id=ujyacemehw51olt0loal5119k hello world"
	got := FormatServiceLogLine("api", in)
	want := "api.ujyacemehw51 | hello world"
	if got != want {
		t.Fatalf("got %q want %q", got, want)
	}
	plain := FormatServiceLogLine("api", "just a line")
	if plain != "just a line" {
		t.Fatalf("plain: %q", plain)
	}
}
