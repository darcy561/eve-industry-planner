package mongo

import "go.mongodb.org/mongo-driver/v2/mongo"

func upsertWithWSClientIDRetry[T any](
	doc T,
	doUpsert func(T) (*mongo.UpdateResult, error),
	clearWSClientID func(*T) bool,
) (result *mongo.UpdateResult, retriedWithoutWSClientID bool, err error) {
	result, err = doUpsert(doc)
	if err == nil {
		return result, false, nil
	}
	if !clearWSClientID(&doc) {
		return nil, false, err
	}
	result, retryErr := doUpsert(doc)
	if retryErr != nil {
		return nil, true, retryErr
	}
	return result, true, nil
}
