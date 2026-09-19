package sso

import (
	"net/http"

	"eve-industry-planner/api/helper"
	"eve-industry-planner/api/helper/auth"
	"eve-industry-planner/shared/logs"
)

// SignInStateResponse carries the value the SPA sends to EVE as the OAuth state.
type SignInStateResponse struct {
	State string `json:"state"`
}

// SignInStateHandler issues a sign-in state and binds it to this browser, so the
// exchange can refuse a callback that browser did not start.
func (h *Handlers) SignInStateHandler(w http.ResponseWriter, r *http.Request) {
	if !helper.RequireMethod(w, r, http.MethodPost) {
		return
	}

	if !auth.SignInStateMintAllowed(r) {
		respondSSOClientError(w, r, "eve_sso_sign_in_state", "Forbidden",
			"sign-in state requested from another site", "sso_sign_in_state_cross_site",
			http.StatusForbidden, nil)
		return
	}

	state, err := auth.NewSignInState()
	if err != nil {
		helper.RespondEndpointServerError(w, r, "Internal server error",
			"failed to mint a sign-in state", "sso_sign_in_state_mint_failed",
			"eve_sso_sign_in_state", err, nil)
		return
	}

	auth.AddSignInState(w, r, state)
	logs.AttachHandlerSuccessDetail(r, "issued a sign-in state", nil)
	if err := helper.EncodeJSON(w, SignInStateResponse{State: state}); err != nil {
		helper.RespondEndpointServerError(w, r, "Internal server error",
			"failed to encode sign-in state response", "sso_sign_in_state_encode_failed",
			"eve_sso_sign_in_state", err, nil)
	}
}
