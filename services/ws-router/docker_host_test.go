package main

import "testing"

func TestParseDockerHost(t *testing.T) {
	t.Parallel()
	base, sock := parseDockerHost("unix:///var/run/docker.sock")
	if base != "http://docker" || sock != "/var/run/docker.sock" {
		t.Fatalf("unix: base=%q sock=%q", base, sock)
	}
	base, sock = parseDockerHost("tcp://ws-docker-proxy:2375")
	if base != "http://ws-docker-proxy:2375" || sock != "" {
		t.Fatalf("tcp: base=%q sock=%q", base, sock)
	}
	base, sock = parseDockerHost("http://ws-docker-proxy:2375/")
	if base != "http://ws-docker-proxy:2375" || sock != "" {
		t.Fatalf("http: base=%q sock=%q", base, sock)
	}
}
