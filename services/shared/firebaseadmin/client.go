package firebaseadmin

import (
	"context"
	"os"
	"sync"

	"cloud.google.com/go/firestore"
	firebase "firebase.google.com/go/v4"
	"firebase.google.com/go/v4/auth"
	"google.golang.org/api/option"
)

var (
	appOnce sync.Once
	app     *firebase.App
	appErr  error

	firestoreClient     *firestore.Client
	firestoreClientOnce sync.Once
	firestoreClientErr  error

	authClient     *auth.Client
	authClientOnce sync.Once
	authClientErr  error
)

// getFirebaseApp lazily initialises a shared Firebase App instance using environment configuration.
func getFirebaseApp(ctx context.Context) (*firebase.App, error) {
	appOnce.Do(func() {
		var opts []option.ClientOption

		// Use explicit credentials file if provided
		if credPath := os.Getenv("GOOGLE_APPLICATION_CREDENTIALS"); credPath != "" {
			opts = append(opts, option.WithCredentialsFile(credPath))
		}

		config := &firebase.Config{}
		if projectID := os.Getenv("FIREBASE_PROJECT_ID"); projectID != "" {
			config.ProjectID = projectID
		}

		app, appErr = firebase.NewApp(ctx, config, opts...)
	})

	return app, appErr
}

// GetFirestoreClient returns a shared Firestore client, safe for concurrent use.
func GetFirestoreClient(ctx context.Context) (*firestore.Client, error) {
	firestoreClientOnce.Do(func() {
		app, err := getFirebaseApp(ctx)
		if err != nil {
			firestoreClientErr = err
			return
		}

		firestoreClient, firestoreClientErr = app.Firestore(ctx)
	})

	return firestoreClient, firestoreClientErr
}

// GetAuthClient returns a shared Firebase Auth client, safe for concurrent use.
func GetAuthClient(ctx context.Context) (*auth.Client, error) {
	authClientOnce.Do(func() {
		app, err := getFirebaseApp(ctx)
		if err != nil {
			authClientErr = err
			return
		}

		authClient, authClientErr = app.Auth(ctx)
	})

	return authClient, authClientErr
}

// Close cleans up any long-lived Firebase clients.
func Close(ctx context.Context) error {
	var firstErr error

	if firestoreClient != nil {
		if err := firestoreClient.Close(); err != nil && firstErr == nil {
			firstErr = err
		}
	}

	// Auth client does not require explicit close
	_ = ctx

	return firstErr
}
