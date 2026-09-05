package evesso

import "strings"

// ServerAnswered reports whether login.eveonline.com replied at all.
//
// A refused grant counts as answered: being turned away means something was
// there to turn you away, and an expired token says nothing about the service
// being down. Only silence — a transport failure, or a 5xx — means it did not
// answer.
//
// This is the same rule the ESI limiter applies to its own calls, where any
// status below 500 is the server answering. SSO holds no bucket and spends no
// token, so this is the whole of what it contributes: one more source of
// evidence about whether CCP's servers are up.
func ServerAnswered(err error) bool {
	return err == nil || isRefusedGrant(err)
}

// isRefusedGrant reports an OAuth error that means this token will never work
// again, whatever the state of the server.
func isRefusedGrant(err error) bool {
	if err == nil {
		return false
	}
	message := err.Error()
	return strings.Contains(message, "invalid_grant") || strings.Contains(message, "invalid_request")
}

// IsPermanentRefreshFailure reports whether a refresh failed in a way that
// retrying cannot fix, so the row holding it can be dropped.
func IsPermanentRefreshFailure(err error) bool { return isRefusedGrant(err) }
