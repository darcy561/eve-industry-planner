package user

import (
	"fmt"
	"net/http"
	"strings"
	"time"

	"eve-industry-planner/api/helper"
	"eve-industry-planner/shared/core/config"
	mongocore "eve-industry-planner/shared/core/mongo"
	"eve-industry-planner/shared/logs"
	"eve-industry-planner/shared/shared"
	"eve-industry-planner/shared/shared/models"

	"go.mongodb.org/mongo-driver/bson"
	"go.mongodb.org/mongo-driver/mongo"
)

type additionalCharacterRefreshTokensRequest struct {
	RefreshTokens []models.RefreshToken `json:"refreshTokens"`
}

type additionalCharacterRefreshTokenDeleteRequest struct {
	CharacterHashes []string `json:"characterHashes"`
}

type additionalCharacterRefreshTokensResponse struct {
	RefreshTokens []models.RefreshToken `json:"refreshTokens"`
}

func AdditionalCharacterRefreshTokensHandler(w http.ResponseWriter, r *http.Request, clients *shared.ServiceClients) {
	switch r.Method {
	case http.MethodGet:
		handleGetAdditionalCharacterRefreshTokens(w, r, clients)
	case http.MethodPut:
		handlePutAdditionalCharacterRefreshTokens(w, r, clients)
	case http.MethodDelete:
		handleDeleteAdditionalCharacterRefreshTokens(w, r, clients)
	default:
		http.Error(w, "Method not allowed. Use GET, PUT, or DELETE.", http.StatusMethodNotAllowed)
	}
}

func handleGetAdditionalCharacterRefreshTokens(w http.ResponseWriter, r *http.Request, clients *shared.ServiceClients) {
	ctx := r.Context()
	accountID, ok := helper.RequireAccountID(w, r)
	if !ok {
		return
	}

	cfg, err := config.LoadConfig()
	if err != nil {
		logs.RespondHTTPError(w, r, http.StatusInternalServerError, "Internal server error", err)
		return
	}
	if cfg.RefreshTokenKeyring == nil {
		logs.RespondHTTPError(w, r, http.StatusInternalServerError, "Refresh token keyring not configured", fmt.Errorf("refresh token keyring is nil"))
		return
	}

	col := clients.Mongo.Database(mongocore.DatabaseName).Collection(mongocore.CollectionUsers)
	var userDoc models.UserAccountDocument
	if err := col.FindOne(ctx, bson.M{"_id": accountID, "_meta.accountID": accountID}).Decode(&userDoc); err != nil {
		if err == mongo.ErrNoDocuments {
			http.Error(w, "User document not found", http.StatusNotFound)
			return
		}
		logs.RespondHTTPError(w, r, http.StatusInternalServerError, "Failed to load user document", err)
		return
	}

	out := make([]models.RefreshToken, 0, len(userDoc.RefreshTokens))
	for i := range userDoc.RefreshTokens {
		row := userDoc.RefreshTokens[i]
		hash := strings.TrimSpace(row.CharacterHash)
		if hash == "" {
			continue
		}
		plain, err := row.PlainRefreshMaterial(cfg.RefreshTokenKeyring)
		if err != nil {
			logs.WarnCtx(ctx, "skip additional-character refresh token row",
				"account_id", accountID,
				"character_hash", hash,
				"error", err,
			)
			continue
		}
		out = append(out, models.RefreshToken{
			CharacterHash: hash,
			RToken:        plain,
		})
	}

	if err := helper.EncodeJSON(w, additionalCharacterRefreshTokensResponse{RefreshTokens: out}); err != nil {
		logs.RespondHTTPError(w, r, http.StatusInternalServerError, "Internal server error", err)
		return
	}
}

func handlePutAdditionalCharacterRefreshTokens(w http.ResponseWriter, r *http.Request, clients *shared.ServiceClients) {
	ctx := r.Context()
	accountID, ok := helper.RequireAccountID(w, r)
	if !ok {
		return
	}

	cfg, err := config.LoadConfig()
	if err != nil {
		logs.RespondHTTPError(w, r, http.StatusInternalServerError, "Internal server error", err)
		return
	}
	if cfg.RefreshTokenKeyring == nil {
		logs.RespondHTTPError(w, r, http.StatusInternalServerError, "Refresh token keyring not configured", fmt.Errorf("refresh token keyring is nil"))
		return
	}

	var req additionalCharacterRefreshTokensRequest
	if err := helper.DecodeJSONRequest(r, &req, helper.DefaultMaxBodySize); err != nil {
		http.Error(w, err.Error(), http.StatusBadRequest)
		return
	}

	col := clients.Mongo.Database(mongocore.DatabaseName).Collection(mongocore.CollectionUsers)
	var existingDoc models.UserAccountDocument
	if err := col.FindOne(ctx, bson.M{"_id": accountID, "_meta.accountID": accountID}).Decode(&existingDoc); err != nil {
		if err == mongo.ErrNoDocuments {
			http.Error(w, "User document not found", http.StatusNotFound)
			return
		}
		logs.RespondHTTPError(w, r, http.StatusInternalServerError, "Failed to load user document", err)
		return
	}

	prevByHash := make(map[string]models.RefreshToken, len(existingDoc.RefreshTokens))
	for _, row := range existingDoc.RefreshTokens {
		hash := strings.ToLower(strings.TrimSpace(row.CharacterHash))
		if hash == "" {
			continue
		}
		prevByHash[hash] = row
	}

	nextRows := make([]models.RefreshToken, 0, len(existingDoc.RefreshTokens)+len(req.RefreshTokens))
	used := make(map[string]struct{}, len(req.RefreshTokens))
	for i := range req.RefreshTokens {
		row := req.RefreshTokens[i]
		row.CharacterHash = strings.TrimSpace(row.CharacterHash)
		if row.CharacterHash == "" {
			continue
		}
		key := strings.ToLower(row.CharacterHash)
		if strings.TrimSpace(row.RToken) != "" {
			if err := row.EncryptRefreshAtRest(row.RToken, cfg.RefreshTokenKeyring); err != nil {
				http.Error(w, "Invalid refresh token payload", http.StatusBadRequest)
				return
			}
			nextRows = append(nextRows, row)
			used[key] = struct{}{}
			continue
		}
		if prev, ok := prevByHash[key]; ok && prev.RTokenCiphertext != "" {
			nextRows = append(nextRows, prev)
			used[key] = struct{}{}
		}
	}
	for _, row := range existingDoc.RefreshTokens {
		hash := strings.TrimSpace(row.CharacterHash)
		if hash == "" {
			continue
		}
		key := strings.ToLower(hash)
		if _, ok := used[key]; ok {
			continue
		}
		nextRows = append(nextRows, row)
	}

	retryCfg := mongocore.DefaultRetryConfig()
	retryCfg.OperationName = fmt.Sprintf("update additional character refresh tokens %s", accountID)
	if err := mongocore.RetryMongoOperation(ctx, retryCfg, func() error {
		_, err := col.UpdateOne(ctx, bson.M{"_id": accountID, "_meta.accountID": accountID}, bson.M{
			"$set": bson.M{
				"refreshTokens":      nextRows,
				"_meta.lastModified": time.Now().UTC(),
			},
		})
		return err
	}); err != nil {
		logs.RespondHTTPError(w, r, http.StatusInternalServerError, "Failed to save refresh tokens", err)
		return
	}

	w.WriteHeader(http.StatusNoContent)
}

func handleDeleteAdditionalCharacterRefreshTokens(w http.ResponseWriter, r *http.Request, clients *shared.ServiceClients) {
	ctx := r.Context()
	accountID, ok := helper.RequireAccountID(w, r)
	if !ok {
		return
	}

	var req additionalCharacterRefreshTokenDeleteRequest
	if err := helper.DecodeJSONRequest(r, &req, helper.DefaultMaxBodySize); err != nil {
		http.Error(w, err.Error(), http.StatusBadRequest)
		return
	}

	toRemove := make(map[string]struct{}, len(req.CharacterHashes))
	for _, hash := range req.CharacterHashes {
		key := strings.ToLower(strings.TrimSpace(hash))
		if key == "" {
			continue
		}
		toRemove[key] = struct{}{}
	}
	if len(toRemove) == 0 {
		http.Error(w, "characterHashes must include at least one hash", http.StatusBadRequest)
		return
	}

	col := clients.Mongo.Database(mongocore.DatabaseName).Collection(mongocore.CollectionUsers)
	var existingDoc models.UserAccountDocument
	if err := col.FindOne(ctx, bson.M{"_id": accountID, "_meta.accountID": accountID}).Decode(&existingDoc); err != nil {
		if err == mongo.ErrNoDocuments {
			http.Error(w, "User document not found", http.StatusNotFound)
			return
		}
		logs.RespondHTTPError(w, r, http.StatusInternalServerError, "Failed to load user document", err)
		return
	}

	nextRows := make([]models.RefreshToken, 0, len(existingDoc.RefreshTokens))
	for _, row := range existingDoc.RefreshTokens {
		key := strings.ToLower(strings.TrimSpace(row.CharacterHash))
		if key == "" {
			continue
		}
		if _, remove := toRemove[key]; remove {
			continue
		}
		nextRows = append(nextRows, row)
	}

	retryCfg := mongocore.DefaultRetryConfig()
	retryCfg.OperationName = fmt.Sprintf("delete additional character refresh tokens %s", accountID)
	if err := mongocore.RetryMongoOperation(ctx, retryCfg, func() error {
		_, err := col.UpdateOne(ctx, bson.M{"_id": accountID, "_meta.accountID": accountID}, bson.M{
			"$set": bson.M{
				"refreshTokens":      nextRows,
				"_meta.lastModified": time.Now().UTC(),
			},
		})
		return err
	}); err != nil {
		logs.RespondHTTPError(w, r, http.StatusInternalServerError, "Failed to delete refresh tokens", err)
		return
	}

	w.WriteHeader(http.StatusNoContent)
}
