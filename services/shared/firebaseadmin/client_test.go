package firebaseadmin

import (
	"context"
	"crypto/rand"
	"crypto/rsa"
	"crypto/x509"
	"encoding/json"
	"encoding/pem"
	"os"
	"path/filepath"
	"testing"
)

// Firebase Admin accepts a service-account JSON without FIREBASE_PROJECT_ID;
// project is taken from the JSON (same as worker / compose when that env is blank).
func Test_getFirebaseApp_withoutFirebaseProjectID(t *testing.T) {
	key, err := rsa.GenerateKey(rand.Reader, 2048)
	if err != nil {
		t.Fatal(err)
	}
	pkcs8, err := x509.MarshalPKCS8PrivateKey(key)
	if err != nil {
		t.Fatal(err)
	}
	pemStr := string(pem.EncodeToMemory(&pem.Block{Type: "PRIVATE KEY", Bytes: pkcs8}))

	dir := t.TempDir()
	saPath := filepath.Join(dir, "sa.json")
	payload := map[string]string{
		"type":                        "service_account",
		"project_id":                  "eip-firebaseadmin-test",
		"private_key_id":              "kid",
		"private_key":                 pemStr,
		"client_email":                "test@eip-firebaseadmin-test.iam.gserviceaccount.com",
		"client_id":                   "1",
		"auth_uri":                    "https://accounts.google.com/o/oauth2/auth",
		"token_uri":                   "https://oauth2.googleapis.com/token",
		"auth_provider_x509_cert_url": "https://www.googleapis.com/oauth2/v1/certs",
	}
	raw, err := json.Marshal(payload)
	if err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(saPath, raw, 0o600); err != nil {
		t.Fatal(err)
	}

	t.Setenv("GOOGLE_APPLICATION_CREDENTIALS", saPath)
	t.Setenv("FIREBASE_PROJECT_ID", "")

	ctx := context.Background()
	app, err := getFirebaseApp(ctx)
	if err != nil {
		t.Fatalf("getFirebaseApp: %v", err)
	}
	if app == nil {
		t.Fatal("expected non-nil app")
	}
}
