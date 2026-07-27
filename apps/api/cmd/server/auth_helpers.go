package main

import (
	"net/http"

	"github.com/mickrubashkin/email-review-tool/apps/api/internal/core/auth"
)

func authUserFromContext(r *http.Request) (auth.AuthUser, bool) {
	return auth.FromRequest(r)
}
