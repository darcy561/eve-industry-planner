package logs

import "context"

type debugIdentityResolver func(context.Context) (accountID, sessionID string)

var debugIdentityFromContext debugIdentityResolver

// SetDebugIdentityResolver registers a fallback for account_id/session_id on debug steps
// and handler detail maps when [WithRequestAccountID] / [BindRequestIdentity] keys are absent
// (e.g. auth middleware identity on context only).
func SetDebugIdentityResolver(fn debugIdentityResolver) {
	debugIdentityFromContext = fn
}
