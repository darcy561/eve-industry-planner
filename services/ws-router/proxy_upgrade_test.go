package main

import (
	"net/http"
	"testing"
)

func TestWSProxyCopyBufIs16KiB(t *testing.T) {
	t.Parallel()
	if wsProxyCopyBuf != 16*1024 {
		t.Fatalf("wsProxyCopyBuf=%d want 16KiB", wsProxyCopyBuf)
	}
}

func TestIsWebSocketUpgrade(t *testing.T) {
	t.Parallel()
	req, _ := http.NewRequest(http.MethodGet, "/ws", nil)
	if isWebSocketUpgrade(req) {
		t.Fatal("plain GET should not upgrade")
	}
	req.Header.Set("Connection", "keep-alive, Upgrade")
	req.Header.Set("Upgrade", "websocket")
	if !isWebSocketUpgrade(req) {
		t.Fatal("expected websocket upgrade")
	}
}

func TestMergeUpgradeHeadersKeepsStickyCookie(t *testing.T) {
	t.Parallel()
	dst := http.Header{}
	dst.Add("Set-Cookie", "eip_ws_affinity=abc; Path=/")
	src := http.Header{}
	src.Set("Connection", "Upgrade")
	src.Set("Upgrade", "websocket")
	src.Set("Sec-WebSocket-Accept", "sig")
	src.Add("Set-Cookie", "other=1")
	mergeUpgradeHeaders(dst, src)
	if dst.Get("Upgrade") != "websocket" || dst.Get("Sec-WebSocket-Accept") != "sig" {
		t.Fatalf("handshake headers %#v", dst)
	}
	cookies := dst.Values("Set-Cookie")
	if len(cookies) != 2 {
		t.Fatalf("cookies %#v", cookies)
	}
}
