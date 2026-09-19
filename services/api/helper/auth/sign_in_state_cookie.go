package auth

import (
	"crypto/rand"
	"crypto/subtle"
	"encoding/base64"
	"net/http"
	"strings"
	"time"
)

// SignInStateCookieName holds the sign-in states this browser has been issued.
const SignInStateCookieName = "eip_sso_state"

const signInStateCookiePath = "/api/v1/eve-sso"

// SignInStateTTL bounds how long a minted state stays good.
const SignInStateTTL = 10 * time.Minute

// signInStateBytes is key-sized rather than nonce-sized: a guessed state is a
// working attack.
const signInStateBytes = 32

// maxLiveSignInStates is how many sign-ins a browser may have in flight. More
// than one, because a session expiring in one tab while a character is linked in
// another is two at once.
const maxLiveSignInStates = 3

const signInStateSeparator = ","

// NewSignInState mints a state value to hand a browser.
func NewSignInState() (string, error) {
	raw := make([]byte, signInStateBytes)
	if _, err := rand.Read(raw); err != nil {
		return "", err
	}
	return base64.RawURLEncoding.EncodeToString(raw), nil
}

// AddSignInState binds a newly minted state to this browser, keeping the ones
// already in flight.
func AddSignInState(w http.ResponseWriter, r *http.Request, value string) {
	value = strings.TrimSpace(value)
	if w == nil || value == "" {
		return
	}
	live := append([]string{value}, liveSignInStates(r)...)
	if len(live) > maxLiveSignInStates {
		live = live[:maxLiveSignInStates]
	}
	writeSignInStateCookie(w, strings.Join(live, signInStateSeparator))
}

// TakeSignInState reports whether a presented state is one this browser holds,
// and spends it if so.
//
// A mismatch removes nothing: the other values belong to sign-ins still in
// flight, and clearing them would let one bad callback cancel a real sign-in.
func TakeSignInState(w http.ResponseWriter, r *http.Request, presented string) bool {
	presented = strings.TrimSpace(presented)
	if presented == "" {
		return false
	}

	// Every candidate is compared, so the work does not depend on which matched.
	matched := false
	remaining := make([]string, 0, maxLiveSignInStates)
	for _, held := range liveSignInStates(r) {
		if subtle.ConstantTimeCompare([]byte(held), []byte(presented)) == 1 {
			matched = true
			continue
		}
		remaining = append(remaining, held)
	}
	if !matched {
		return false
	}

	if w != nil {
		if len(remaining) == 0 {
			clearSignInStateCookie(w)
		} else {
			writeSignInStateCookie(w, strings.Join(remaining, signInStateSeparator))
		}
	}
	return true
}

func liveSignInStates(r *http.Request) []string {
	if r == nil {
		return nil
	}
	c, err := r.Cookie(SignInStateCookieName)
	if err != nil || c == nil {
		return nil
	}
	var live []string
	for part := range strings.SplitSeq(c.Value, signInStateSeparator) {
		if part = strings.TrimSpace(part); part != "" {
			live = append(live, part)
		}
	}
	return live
}

func writeSignInStateCookie(w http.ResponseWriter, value string) {
	http.SetCookie(w, &http.Cookie{
		Name:     SignInStateCookieName,
		Value:    value,
		Path:     signInStateCookiePath,
		MaxAge:   int(SignInStateTTL.Seconds()),
		HttpOnly: true,
		Secure:   true,
		// Strict still reaches the exchange, which the SPA issues from a page on
		// this origin however the reader got to it — including straight back
		// from login.eveonline.com.
		SameSite: http.SameSiteStrictMode,
	})
}

// clearSignInStateCookie drops every state this browser holds.
func clearSignInStateCookie(w http.ResponseWriter) {
	if w == nil {
		return
	}
	http.SetCookie(w, &http.Cookie{
		Name:     SignInStateCookieName,
		Value:    "",
		Path:     signInStateCookiePath,
		MaxAge:   -1,
		HttpOnly: true,
		Secure:   true,
		SameSite: http.SameSiteStrictMode,
	})
}

// signInStateRequestIsCrossSite reports whether a mint arrived from another site.
// Such a request carries no cookie under SameSite=Strict, so honouring it would
// replace the reader's live sign-ins rather than add to them.
//
// An absent header is allowed, and is the limit of this check: Safari before 16.4
// and older WebViews send none and carry cookies fine, so refusing would stop
// them signing in at all.
func signInStateRequestIsCrossSite(r *http.Request) bool {
	if r == nil {
		return false
	}
	switch r.Header.Get("Sec-Fetch-Site") {
	case "", "same-origin", "none":
		return false
	default:
		return true
	}
}

// SignInStateMintAllowed reports whether a mint may write to this browser's cookie.
func SignInStateMintAllowed(r *http.Request) bool {
	return !signInStateRequestIsCrossSite(r)
}
