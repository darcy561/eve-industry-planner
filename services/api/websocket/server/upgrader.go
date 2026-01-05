package server

import (
	"github.com/gorilla/websocket"
)

var upgrader = websocket.Upgrader{
	ReadBufferSize:  4096,
	WriteBufferSize: 4096,
	CheckOrigin:     nil, // Disable origin checking - handled by Nginx/proxy in front
	// Enable compression if supported by client
	EnableCompression: true,
}
