package server

import (
	"github.com/gorilla/websocket"
)

var upgrader = websocket.Upgrader{
	ReadBufferSize:  4096,
	WriteBufferSize: 4096,
	CheckOrigin:     nil, // Disable origin checking - handled by Nginx/proxy in front
	// RFC 7692: negotiate permessage-deflate when the client offers it. Flate level is set
	// after upgrade to match shared/compression.FlateDefaultLevel (API default HTTP tier).
	EnableCompression: true,
}
