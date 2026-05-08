package auth

import "net/http"

// AppSessionCookieName is the shared auth session cookie for API + websocket.
const AppSessionCookieName = "eip_session"

const appSessionCookiePath = "/"

func AppSessionCookieMaxAgeSeconds() int {
	return int(RefreshTokenTTL.Seconds())
}

func SetAppSessionCookie(w http.ResponseWriter, sessionID string) {
	if w == nil || sessionID == "" {
		return
	}
	http.SetCookie(w, &http.Cookie{
		Name:     AppSessionCookieName,
		Value:    sessionID,
		Path:     appSessionCookiePath,
		MaxAge:   AppSessionCookieMaxAgeSeconds(),
		HttpOnly: true,
		Secure:   true,
		SameSite: http.SameSiteLaxMode,
	})
}

func ClearAppSessionCookie(w http.ResponseWriter) {
	if w == nil {
		return
	}
	http.SetCookie(w, &http.Cookie{
		Name:     AppSessionCookieName,
		Value:    "",
		Path:     appSessionCookiePath,
		MaxAge:   -1,
		HttpOnly: true,
		Secure:   true,
		SameSite: http.SameSiteLaxMode,
	})
}

func ReadAppSessionCookie(r *http.Request) string {
	if r == nil {
		return ""
	}
	c, err := r.Cookie(AppSessionCookieName)
	if err != nil || c == nil {
		return ""
	}
	return c.Value
}

