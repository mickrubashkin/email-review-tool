package main

import (
	"context"
	"crypto/rand"
	"crypto/sha256"
	"encoding/base64"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"net/http"
	"os"
	"strconv"
	"strings"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

const sessionCookieName = "email_review_session"

type authContextKey string

const authUserContextKey authContextKey = "auth_user"

type authRequest struct {
	Email string `json:"email"`
}

type inviteCodeRequest struct {
	Email string `json:"email"`
	Code  string `json:"code"`
}

func registerAuthRoutes(r chi.Router, dbpool *pgxpool.Pool, emailSender EmailSender) {
	r.Post("/api/auth/request-link", requestMagicLinkHandler(dbpool, emailSender))
	r.Post("/api/auth/invite-code", inviteCodeLoginHandler(dbpool))
	r.Get("/api/auth/events", listAuthEventsHandler(dbpool))
	r.Get("/api/auth/callback", magicLinkCallbackHandler(dbpool))
	r.Get("/api/auth/me", meHandler(dbpool))
	r.Post("/api/auth/logout", logoutHandler(dbpool))
}

func authMiddleware(dbpool *pgxpool.Pool) func(http.Handler) http.Handler {
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			if !strings.HasPrefix(r.URL.Path, "/api/") ||
				strings.HasPrefix(r.URL.Path, "/api/auth/") ||
				r.URL.Path == "/health" {
				next.ServeHTTP(w, r)
				return
			}

			user, err := currentUserFromRequest(r.Context(), dbpool, r)
			if err != nil {
				http.Error(w, "unauthorized", http.StatusUnauthorized)
				return
			}

			next.ServeHTTP(w, r.WithContext(context.WithValue(r.Context(), authUserContextKey, user)))
		})
	}
}

func requestMagicLinkHandler(dbpool *pgxpool.Pool, emailSender EmailSender) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		var payload authRequest
		if err := json.NewDecoder(r.Body).Decode(&payload); err != nil {
			writeAuthOK(w)
			return
		}

		email := normalizeEmail(payload.Email)
		if !isAllowedAuthEmail(email) {
			writeAuthOK(w)
			return
		}

		user, err := upsertAuthUser(r.Context(), dbpool, email)
		if err != nil {
			fmt.Fprintf(os.Stderr, "failed to upsert auth user %s: %v\n", email, err)
			writeAuthOK(w)
			return
		}
		logAuthEvent(r.Context(), dbpool, r, AuthEvent{
			UserID:    &user.ID,
			Email:     user.Email,
			EventType: "magic_link_requested",
			Success:   true,
		})

		token, err := randomToken()
		if err != nil {
			fmt.Fprintf(os.Stderr, "failed to create magic link token for %s: %v\n", email, err)
			http.Error(w, "failed to create login link", http.StatusInternalServerError)
			return
		}

		expiresAt := time.Now().Add(15 * time.Minute)
		_, err = dbpool.Exec(r.Context(), `
			INSERT INTO magic_login_tokens (token_hash, email, expires_at)
			VALUES ($1, $2, $3);
		`, hashToken(token), user.Email, expiresAt)
		if err != nil {
			fmt.Fprintf(os.Stderr, "failed to save magic link token for %s: %v\n", email, err)
			http.Error(w, "failed to create login link", http.StatusInternalServerError)
			return
		}

		if err := emailSender.SendMagicLink(r.Context(), user.Email, authCallbackURL(token)); err != nil {
			fmt.Fprintf(os.Stderr, "failed to send magic link for %s: %v\n", user.Email, err)
		}

		writeAuthOK(w)
	}
}

func inviteCodeLoginHandler(dbpool *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		var payload inviteCodeRequest
		if err := json.NewDecoder(r.Body).Decode(&payload); err != nil {
			http.Error(w, "invalid request", http.StatusBadRequest)
			return
		}

		email := normalizeEmail(payload.Email)
		if !isAllowedAuthEmail(email) || !isValidInviteCode(payload.Code) {
			if email != "" {
				logAuthEvent(r.Context(), dbpool, r, AuthEvent{
					Email:     email,
					EventType: "failed_invite_code",
					Success:   false,
				})
			}
			http.Error(w, "unauthorized", http.StatusUnauthorized)
			return
		}

		user, err := upsertAuthUser(r.Context(), dbpool, email)
		if err != nil {
			fmt.Fprintf(os.Stderr, "failed to upsert auth user %s: %v\n", email, err)
			http.Error(w, "failed to sign in", http.StatusInternalServerError)
			return
		}
		logAuthEvent(r.Context(), dbpool, r, AuthEvent{
			UserID:    &user.ID,
			Email:     user.Email,
			EventType: "invite_code_login",
			Success:   true,
		})

		if err := createSessionCookie(r.Context(), dbpool, w, user); err != nil {
			fmt.Fprintf(os.Stderr, "failed to create invite-code session for %s: %v\n", user.Email, err)
			http.Error(w, "failed to sign in", http.StatusInternalServerError)
			return
		}

		writeAuthOK(w)
	}
}

func magicLinkCallbackHandler(dbpool *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		token := strings.TrimSpace(r.URL.Query().Get("token"))
		if token == "" {
			http.Redirect(w, r, "/", http.StatusSeeOther)
			return
		}

		user, err := consumeMagicToken(r.Context(), dbpool, token)
		if err != nil {
			fmt.Fprintf(os.Stderr, "failed to consume magic link token: %v\n", err)
			http.Redirect(w, r, "/", http.StatusSeeOther)
			return
		}
		logAuthEvent(r.Context(), dbpool, r, AuthEvent{
			UserID:    &user.ID,
			Email:     user.Email,
			EventType: "magic_link_login",
			Success:   true,
		})

		if err := createSessionCookie(r.Context(), dbpool, w, user); err != nil {
			fmt.Fprintf(os.Stderr, "failed to create magic-link session for %s: %v\n", user.Email, err)
			http.Redirect(w, r, "/", http.StatusSeeOther)
			return
		}

		http.Redirect(w, r, "/", http.StatusSeeOther)
	}
}

func meHandler(dbpool *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		user, err := currentUserFromRequest(r.Context(), dbpool, r)
		if err != nil {
			http.Error(w, "unauthorized", http.StatusUnauthorized)
			return
		}

		w.Header().Set("Content-Type", "application/json")
		_ = json.NewEncoder(w).Encode(user)
	}
}

func logoutHandler(dbpool *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		if cookie, err := r.Cookie(sessionCookieName); err == nil {
			if user, userErr := currentUserFromRequest(r.Context(), dbpool, r); userErr == nil {
				logAuthEvent(r.Context(), dbpool, r, AuthEvent{
					UserID:    &user.ID,
					Email:     user.Email,
					EventType: "logout",
					Success:   true,
				})
			}
			_, _ = dbpool.Exec(r.Context(), `
				DELETE FROM sessions
				WHERE session_hash = $1;
			`, hashToken(cookie.Value))
		}

		http.SetCookie(w, expiredSessionCookie())
		writeAuthOK(w)
	}
}

func listAuthEventsHandler(dbpool *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		user, err := currentUserFromRequest(r.Context(), dbpool, r)
		if err != nil {
			http.Error(w, "unauthorized", http.StatusUnauthorized)
			return
		}
		if user.Role != "admin" {
			http.Error(w, "forbidden", http.StatusForbidden)
			return
		}

		filters := AuthEventFilters{
			Email:     strings.TrimSpace(r.URL.Query().Get("email")),
			EventType: strings.TrimSpace(r.URL.Query().Get("event_type")),
			Success:   strings.TrimSpace(r.URL.Query().Get("success")),
			Limit:     parseAuthEventsLimit(r.URL.Query().Get("limit")),
		}

		events, err := listAuthEvents(r.Context(), dbpool, filters)
		if err != nil {
			fmt.Fprintf(os.Stderr, "failed to list auth events: %v\n", err)
			http.Error(w, "failed to load auth events", http.StatusInternalServerError)
			return
		}

		w.Header().Set("Content-Type", "application/json")
		_ = json.NewEncoder(w).Encode(events)
	}
}

func parseAuthEventsLimit(value string) int {
	limit, err := strconv.Atoi(strings.TrimSpace(value))
	if err != nil || limit <= 0 {
		return 100
	}
	if limit > 500 {
		return 500
	}

	return limit
}

func logAuthEvent(ctx context.Context, dbpool *pgxpool.Pool, r *http.Request, event AuthEvent) {
	if err := insertAuthEvent(ctx, dbpool, r, event); err != nil {
		fmt.Fprintf(os.Stderr, "failed to insert auth event %s for %s: %v\n", event.EventType, event.Email, err)
	}
}

func currentUserFromRequest(ctx context.Context, dbpool *pgxpool.Pool, r *http.Request) (AuthUser, error) {
	cookie, err := r.Cookie(sessionCookieName)
	if err != nil || strings.TrimSpace(cookie.Value) == "" {
		return AuthUser{}, fmt.Errorf("missing session")
	}

	var user AuthUser
	err = dbpool.QueryRow(ctx, `
		SELECT u.id, u.email, u.role
		FROM sessions s
		JOIN users u ON u.id = s.user_id
		WHERE s.session_hash = $1
			AND s.expires_at > now()
		LIMIT 1;
	`, hashToken(cookie.Value)).Scan(&user.ID, &user.Email, &user.Role)
	if err != nil {
		return AuthUser{}, err
	}

	return user, nil
}

func createSessionCookie(ctx context.Context, dbpool *pgxpool.Pool, w http.ResponseWriter, user AuthUser) error {
	sessionToken, err := randomToken()
	if err != nil {
		return err
	}

	expiresAt := time.Now().Add(30 * 24 * time.Hour)
	_, err = dbpool.Exec(ctx, `
		INSERT INTO sessions (session_hash, user_id, expires_at)
		VALUES ($1, $2, $3);
	`, hashToken(sessionToken), user.ID, expiresAt)
	if err != nil {
		return err
	}

	http.SetCookie(w, sessionCookie(sessionToken, expiresAt))
	return nil
}

func upsertAuthUser(ctx context.Context, dbpool *pgxpool.Pool, email string) (AuthUser, error) {
	role := "reviewer"
	if email == normalizeEmail(os.Getenv("AUTH_BOOTSTRAP_ADMIN_EMAIL")) {
		role = "admin"
	}

	var user AuthUser
	err := dbpool.QueryRow(ctx, `
		INSERT INTO users (email, role)
		VALUES ($1, $2)
		ON CONFLICT (email) DO UPDATE SET
			role = CASE
				WHEN users.role = 'reviewer' AND EXCLUDED.role = 'admin' THEN 'admin'
				ELSE users.role
			END,
			updated_at = now()
		RETURNING id, email, role;
	`, email, role).Scan(&user.ID, &user.Email, &user.Role)

	return user, err
}

func consumeMagicToken(ctx context.Context, dbpool *pgxpool.Pool, token string) (AuthUser, error) {
	tx, err := dbpool.Begin(ctx)
	if err != nil {
		return AuthUser{}, err
	}
	defer tx.Rollback(ctx)

	var email string
	err = tx.QueryRow(ctx, `
		UPDATE magic_login_tokens
		SET used_at = now()
		WHERE token_hash = $1
			AND used_at IS NULL
			AND expires_at > now()
		RETURNING email;
	`, hashToken(token)).Scan(&email)
	if err != nil {
		return AuthUser{}, err
	}

	var user AuthUser
	err = tx.QueryRow(ctx, `
		SELECT id, email, role
		FROM users
		WHERE email = $1;
	`, email).Scan(&user.ID, &user.Email, &user.Role)
	if err != nil {
		return AuthUser{}, err
	}

	if err := tx.Commit(ctx); err != nil {
		return AuthUser{}, err
	}

	return user, nil
}

func isAllowedAuthEmail(email string) bool {
	allowedDomain := strings.TrimPrefix(strings.ToLower(strings.TrimSpace(os.Getenv("AUTH_ALLOWED_DOMAIN"))), "@")
	if allowedDomain == "" || email == "" {
		return false
	}

	_, domain, ok := strings.Cut(email, "@")
	return ok && domain == allowedDomain
}

func isValidInviteCode(code string) bool {
	normalizedCode := strings.TrimSpace(code)
	if normalizedCode == "" {
		return false
	}

	codeHash := strings.TrimSpace(os.Getenv("AUTH_INVITE_CODE_HASH"))
	if codeHash != "" {
		return hashToken(normalizedCode) == codeHash
	}

	rawCode := strings.TrimSpace(os.Getenv("AUTH_INVITE_CODE"))
	return rawCode != "" && normalizedCode == rawCode
}

func normalizeEmail(value string) string {
	return strings.ToLower(strings.TrimSpace(value))
}

func randomToken() (string, error) {
	bytes := make([]byte, 32)
	if _, err := rand.Read(bytes); err != nil {
		return "", err
	}

	return base64.RawURLEncoding.EncodeToString(bytes), nil
}

func hashToken(value string) string {
	hash := sha256.Sum256([]byte(value))
	return hex.EncodeToString(hash[:])
}

func authCallbackURL(token string) string {
	appURL := strings.TrimRight(os.Getenv("AUTH_APP_URL"), "/")
	if appURL == "" {
		appURL = "http://localhost:5173"
	}

	return fmt.Sprintf("%s/auth/callback?token=%s", appURL, token)
}

func sessionCookie(value string, expiresAt time.Time) *http.Cookie {
	return &http.Cookie{
		Name:     sessionCookieName,
		Value:    value,
		Path:     "/",
		Expires:  expiresAt,
		HttpOnly: true,
		SameSite: http.SameSiteLaxMode,
		Secure:   authCookieSecure(),
	}
}

func expiredSessionCookie() *http.Cookie {
	return &http.Cookie{
		Name:     sessionCookieName,
		Value:    "",
		Path:     "/",
		Expires:  time.Unix(0, 0),
		MaxAge:   -1,
		HttpOnly: true,
		SameSite: http.SameSiteLaxMode,
		Secure:   authCookieSecure(),
	}
}

func authCookieSecure() bool {
	return strings.EqualFold(strings.TrimSpace(os.Getenv("AUTH_COOKIE_SECURE")), "true")
}

func writeAuthOK(w http.ResponseWriter) {
	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(map[string]bool{"ok": true})
}
