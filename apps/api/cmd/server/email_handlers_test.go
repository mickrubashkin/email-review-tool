package main

import (
	"bytes"
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/go-chi/chi/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

func TestListEmailsIncludesOpenCommentCount(t *testing.T) {
	dbpool := testDBPool(t)
	emailID := createTestEmail(t, dbpool)

	_, err := dbpool.Exec(context.Background(), `
		INSERT INTO comments (
			email_id,
			review_block,
			selected_text,
			start_offset,
			end_offset,
			body,
			status
		)
		VALUES
			($1, 'body-001', 'open comment', 0, 12, 'Open comment body', 'open'),
			($1, 'body-002', 'resolved comment', 0, 16, 'Resolved comment body', 'resolved');
	`, emailID)
	if err != nil {
		t.Fatalf("failed to seed comments: %v", err)
	}

	router := chi.NewRouter()
	registerEmailRoutes(router, dbpool)

	request := httptest.NewRequest(http.MethodGet, "/api/emails", nil)
	response := httptest.NewRecorder()
	router.ServeHTTP(response, request)

	if response.Code != http.StatusOK {
		t.Fatalf("expected GET status 200, got %d: %s", response.Code, response.Body.String())
	}

	var emails []EmailListItem
	if err := json.NewDecoder(response.Body).Decode(&emails); err != nil {
		t.Fatalf("failed to decode emails: %v", err)
	}

	for _, email := range emails {
		if email.ID == emailID {
			if email.OpenCommentCount != 1 {
				t.Fatalf("expected open comment count 1, got %d", email.OpenCommentCount)
			}
			return
		}
	}

	t.Fatalf("seed email %s not returned by list emails", emailID)
}

func TestListEmailsExcludesArchivedEmails(t *testing.T) {
	dbpool := testDBPool(t)
	emailID := createTestEmail(t, dbpool)

	_, err := dbpool.Exec(context.Background(), `
		UPDATE emails
		SET archived_at = now()
		WHERE id = $1;
	`, emailID)
	if err != nil {
		t.Fatalf("failed to archive test email: %v", err)
	}

	router := chi.NewRouter()
	registerEmailRoutes(router, dbpool)

	request := httptest.NewRequest(http.MethodGet, "/api/emails", nil)
	response := httptest.NewRecorder()
	router.ServeHTTP(response, request)

	if response.Code != http.StatusOK {
		t.Fatalf("expected GET status 200, got %d: %s", response.Code, response.Body.String())
	}

	var emails []EmailListItem
	if err := json.NewDecoder(response.Body).Decode(&emails); err != nil {
		t.Fatalf("failed to decode emails: %v", err)
	}

	for _, email := range emails {
		if email.ID == emailID {
			t.Fatalf("archived email %s should not be returned by list emails", emailID)
		}
	}
}

func TestCreateEmail(t *testing.T) {
	dbpool := testDBPool(t)
	user := createTestUserWithRole(t, dbpool, "admin")

	router := chi.NewRouter()
	registerEmailRoutes(router, dbpool)

	requestBody := []byte(`{
		"sequence": "onboarding",
		"title": "Uploaded Email",
		"subject": "Uploaded subject",
		"preheader": "Uploaded preheader",
		"send_timing": "day 3",
		"stage": "uploaded",
		"sort_order": 321,
		"language": "en",
		"variant": "candidate",
		"original_html": "<html><body><p data-edit-text=\"intro_text\">Hello upload</p><a href=\"https://example.com\" data-edit-attr-href=\"cta_url\">Start</a></body></html>"
	}`)
	request := httptest.NewRequest(http.MethodPost, "/api/emails", bytes.NewReader(requestBody))
	request = withAuthUser(request, user)
	response := httptest.NewRecorder()
	router.ServeHTTP(response, request)

	if response.Code != http.StatusCreated {
		t.Fatalf("expected POST status 201, got %d: %s", response.Code, response.Body.String())
	}

	var created EmailDetail
	if err := json.NewDecoder(response.Body).Decode(&created); err != nil {
		t.Fatalf("failed to decode created email: %v", err)
	}
	if created.ID == "" {
		t.Fatal("expected created email id")
	}
	t.Cleanup(func() {
		_, _ = dbpool.Exec(context.Background(), `DELETE FROM emails WHERE id = $1;`, created.ID)
	})
	if created.Slug != "onboarding-uploaded-uploaded-email-en" {
		t.Fatalf("expected generated slug, got %q", created.Slug)
	}
	if created.Sequence != "onboarding" ||
		created.Title != "Uploaded Email" ||
		created.Stage != "uploaded" ||
		created.SortOrder != 321 ||
		created.Language != "en" ||
		created.Variant != "candidate" {
		t.Fatalf("unexpected created email: %#v", created)
	}
	if created.ReviewHTML == nil || !strings.Contains(*created.ReviewHTML, "data-review-block") {
		t.Fatalf("expected generated review html, got %#v", created.ReviewHTML)
	}

	var fields map[string]map[string]any
	if err := json.Unmarshal(created.EditableFields, &fields); err != nil {
		t.Fatalf("failed to decode editable fields: %v", err)
	}
	if fields["intro_text"]["value"] != "Hello upload" {
		t.Fatalf("expected extracted intro text, got %#v", fields)
	}
	if fields["cta_url"]["value"] != "https://example.com" {
		t.Fatalf("expected extracted cta url, got %#v", fields)
	}

	var actorEmail string
	err := dbpool.QueryRow(context.Background(), `
		SELECT actor_email
		FROM email_events
		WHERE email_id = $1
			AND action = 'email_created'
		LIMIT 1;
	`, created.ID).Scan(&actorEmail)
	if err != nil {
		t.Fatalf("failed to load created email event: %v", err)
	}
	if actorEmail != user.Email {
		t.Fatalf("expected actor %s, got %s", user.Email, actorEmail)
	}
}

func TestUpdateEmailEditableFields(t *testing.T) {
	dbpool := testDBPool(t)
	emailID := createTestEmail(t, dbpool)
	user := createTestUserWithRole(t, dbpool, "admin")
	setTestEmailTemplate(t, dbpool, emailID, `
		<html>
			<body>
				<a
					href="https://example.com/old"
					style="display:block; width: 196px;"
					data-edit-text="primary_cta_text"
					data-edit-attr-href="primary_cta_url"
					data-edit-style-width-px="primary_cta_width_px"
				>Old CTA</a>
			</body>
		</html>
	`)

	router := chi.NewRouter()
	registerEmailRoutes(router, dbpool)

	requestBody := []byte(`{
		"title": "Updated Email",
		"subject": "Updated subject",
		"preheader": "Updated preheader",
		"editable_fields": {
			"primary_cta_text": { "type": "text", "value": "Start now" },
			"primary_cta_url": { "type": "url", "value": "https://example.com/start" },
			"primary_cta_width_px": { "type": "number", "value": 220 }
		}
	}`)

	request := httptest.NewRequest(
		http.MethodPatch,
		"/api/emails/"+emailID+"/editable-fields",
		bytes.NewReader(requestBody),
	)
	request = withAuthUser(request, user)
	response := httptest.NewRecorder()
	router.ServeHTTP(response, request)

	if response.Code != http.StatusNoContent {
		t.Fatalf("expected PATCH status 204, got %d: %s", response.Code, response.Body.String())
	}

	fields := loadTestEmailEditableFields(t, dbpool, emailID)
	assertEditableField(t, fields, "primary_cta_text", "text", "Start now")
	assertEditableField(t, fields, "primary_cta_url", "url", "https://example.com/start")
	assertEditableField(t, fields, "primary_cta_width_px", "number", float64(220))

	var title string
	var subject *string
	var preheader *string
	err := dbpool.QueryRow(context.Background(), `
		SELECT title, subject, preheader
		FROM emails
		WHERE id = $1;
	`, emailID).Scan(&title, &subject, &preheader)
	if err != nil {
		t.Fatalf("failed to load updated metadata: %v", err)
	}
	if title != "Updated Email" {
		t.Fatalf("expected updated title, got %q", title)
	}
	if subject == nil || *subject != "Updated subject" {
		t.Fatalf("expected updated subject, got %#v", subject)
	}
	if preheader == nil || *preheader != "Updated preheader" {
		t.Fatalf("expected updated preheader, got %#v", preheader)
	}

	var actorEmail string
	var changesJSON []byte
	err = dbpool.QueryRow(context.Background(), `
		SELECT actor_email, changes
		FROM email_events
		WHERE email_id = $1
			AND action = 'email_updated'
		ORDER BY created_at DESC
		LIMIT 1;
	`, emailID).Scan(&actorEmail, &changesJSON)
	if err != nil {
		t.Fatalf("failed to load email update event: %v", err)
	}
	if actorEmail != user.Email {
		t.Fatalf("expected update event actor %s, got %s", user.Email, actorEmail)
	}
	var changes map[string]any
	if err := json.Unmarshal(changesJSON, &changes); err != nil {
		t.Fatalf("failed to decode update event changes: %v", err)
	}
	if _, ok := changes["title"]; !ok {
		t.Fatalf("expected title change, got %#v", changes)
	}
	editableFieldChanges, ok := changes["editable_fields"].(map[string]any)
	if !ok {
		t.Fatalf("expected editable_fields changes, got %#v", changes)
	}
	if _, ok := editableFieldChanges["primary_cta_text"]; !ok {
		t.Fatalf("expected primary_cta_text change, got %#v", editableFieldChanges)
	}
}

func TestUpdateEmailEditableFieldsResetsChangedTextCommentAnchors(t *testing.T) {
	dbpool := testDBPool(t)
	emailID := createTestEmail(t, dbpool)
	user := createTestUserWithRole(t, dbpool, "admin")

	_, err := dbpool.Exec(context.Background(), `
		UPDATE emails
		SET
			subject = 'Old subject',
			preheader = 'Old preheader',
			template_html = '
				<html>
					<body>
						<p data-review-block="primary_cta" data-edit-text="primary_cta_text">Old CTA</p>
						<p data-review-block="secondary_cta" data-edit-text="secondary_cta_text">Keep going</p>
					</body>
				</html>
			',
			editable_fields = '{
				"primary_cta_text": { "type": "text", "value": "Old CTA" },
				"secondary_cta_text": { "type": "text", "value": "Keep going" }
			}'::jsonb
		WHERE id = $1;
	`, emailID)
	if err != nil {
		t.Fatalf("failed to prepare editable comment anchor test: %v", err)
	}

	_, err = dbpool.Exec(context.Background(), `
		INSERT INTO comments (
			email_id,
			review_block,
			selected_text,
			start_offset,
			end_offset,
			body,
			status
		)
		VALUES
			($1, 'primary_cta', 'CTA', 4, 7, 'changed text fragment', 'open'),
			($1, 'primary_cta', 'Old', 0, 3, 'resolved text fragment', 'resolved'),
			($1, 'secondary_cta', 'Keep', 0, 4, 'unchanged text fragment', 'open'),
			($1, 'subject', 'Old', 0, 3, 'subject fragment', 'open'),
			($1, 'preheader', 'pre', 4, 7, 'preheader fragment', 'open');
	`, emailID)
	if err != nil {
		t.Fatalf("failed to seed comments: %v", err)
	}

	router := chi.NewRouter()
	registerEmailRoutes(router, dbpool)

	requestBody := []byte(`{
		"subject": "New subject",
		"preheader": "New preheader",
		"editable_fields": {
			"primary_cta_text": { "type": "text", "value": "Start now" },
			"secondary_cta_text": { "type": "text", "value": "Keep going" }
		}
	}`)
	request := httptest.NewRequest(
		http.MethodPatch,
		"/api/emails/"+emailID+"/editable-fields",
		bytes.NewReader(requestBody),
	)
	request = withAuthUser(request, user)
	response := httptest.NewRecorder()
	router.ServeHTTP(response, request)

	if response.Code != http.StatusNoContent {
		t.Fatalf("expected PATCH status 204, got %d: %s", response.Code, response.Body.String())
	}

	anchors := loadTestCommentAnchorsByBody(t, dbpool, emailID)
	assertCommentAnchor(t, anchors, "changed text fragment", "primary_cta", "Start now", 0, 9, "open")
	assertCommentAnchor(t, anchors, "resolved text fragment", "primary_cta", "Start now", 0, 9, "resolved")
	assertCommentAnchor(t, anchors, "unchanged text fragment", "secondary_cta", "Keep", 0, 4, "open")
	assertCommentAnchor(t, anchors, "subject fragment", "subject", "New subject", 0, 11, "open")
	assertCommentAnchor(t, anchors, "preheader fragment", "preheader", "New preheader", 0, 13, "open")
}

func TestUpdateEmailEditableFieldsRejectsNullFields(t *testing.T) {
	dbpool := testDBPool(t)
	emailID := createTestEmail(t, dbpool)
	user := createTestUserWithRole(t, dbpool, "admin")

	router := chi.NewRouter()
	registerEmailRoutes(router, dbpool)

	request := httptest.NewRequest(
		http.MethodPatch,
		"/api/emails/"+emailID+"/editable-fields",
		bytes.NewReader([]byte(`{ "editable_fields": null }`)),
	)
	request = withAuthUser(request, user)
	response := httptest.NewRecorder()
	router.ServeHTTP(response, request)

	if response.Code != http.StatusBadRequest {
		t.Fatalf("expected PATCH status 400, got %d: %s", response.Code, response.Body.String())
	}
}

func TestUpdateEmailEditableFieldsRejectsUnsafeURL(t *testing.T) {
	dbpool := testDBPool(t)
	emailID := createTestEmail(t, dbpool)
	user := createTestUserWithRole(t, dbpool, "admin")
	setTestEmailTemplate(t, dbpool, emailID, `
		<html>
			<body>
				<a href="https://example.com/old" data-edit-attr-href="cta_url">CTA</a>
			</body>
		</html>
	`)

	router := chi.NewRouter()
	registerEmailRoutes(router, dbpool)

	requestBody := []byte(`{
		"editable_fields": {
			"cta_url": { "type": "url", "value": "javascript:alert(1)" }
		}
	}`)

	request := httptest.NewRequest(
		http.MethodPatch,
		"/api/emails/"+emailID+"/editable-fields",
		bytes.NewReader(requestBody),
	)
	request = withAuthUser(request, user)
	response := httptest.NewRecorder()
	router.ServeHTTP(response, request)

	if response.Code != http.StatusBadRequest {
		t.Fatalf("expected PATCH status 400, got %d: %s", response.Code, response.Body.String())
	}

	fields := loadTestEmailEditableFields(t, dbpool, emailID)
	if len(fields) != 0 {
		t.Fatalf("expected editable fields to remain empty, got %#v", fields)
	}
}

func TestUpdateEmailEditableFieldsNotFound(t *testing.T) {
	dbpool := testDBPool(t)
	user := createTestUserWithRole(t, dbpool, "admin")

	router := chi.NewRouter()
	registerEmailRoutes(router, dbpool)

	request := httptest.NewRequest(
		http.MethodPatch,
		"/api/emails/00000000-0000-0000-0000-000000000000/editable-fields",
		bytes.NewReader([]byte(`{ "editable_fields": {} }`)),
	)
	request = withAuthUser(request, user)
	response := httptest.NewRecorder()
	router.ServeHTTP(response, request)

	if response.Code != http.StatusNotFound {
		t.Fatalf("expected PATCH status 404, got %d: %s", response.Code, response.Body.String())
	}
}

func TestUpdateEmailEditableFieldsRejectsReviewer(t *testing.T) {
	dbpool := testDBPool(t)
	emailID := createTestEmail(t, dbpool)
	user := createTestUserWithRole(t, dbpool, "reviewer")

	router := chi.NewRouter()
	registerEmailRoutes(router, dbpool)

	request := httptest.NewRequest(
		http.MethodPatch,
		"/api/emails/"+emailID+"/editable-fields",
		bytes.NewReader([]byte(`{ "editable_fields": {} }`)),
	)
	request = withAuthUser(request, user)
	response := httptest.NewRecorder()
	router.ServeHTTP(response, request)

	if response.Code != http.StatusForbidden {
		t.Fatalf("expected PATCH status 403, got %d: %s", response.Code, response.Body.String())
	}
}

func TestUpdateEmailEditableFieldsRejectsArchivedEmail(t *testing.T) {
	dbpool := testDBPool(t)
	emailID := createTestEmail(t, dbpool)
	user := createTestUserWithRole(t, dbpool, "admin")

	_, err := dbpool.Exec(context.Background(), `
		UPDATE emails
		SET archived_at = now()
		WHERE id = $1;
	`, emailID)
	if err != nil {
		t.Fatalf("failed to archive test email: %v", err)
	}

	router := chi.NewRouter()
	registerEmailRoutes(router, dbpool)

	request := httptest.NewRequest(
		http.MethodPatch,
		"/api/emails/"+emailID+"/editable-fields",
		bytes.NewReader([]byte(`{ "editable_fields": {} }`)),
	)
	request = withAuthUser(request, user)
	response := httptest.NewRecorder()
	router.ServeHTTP(response, request)

	if response.Code != http.StatusNotFound {
		t.Fatalf("expected PATCH status 404, got %d: %s", response.Code, response.Body.String())
	}
}

func TestGetRenderedEmail(t *testing.T) {
	dbpool := testDBPool(t)
	emailID := createTestEmail(t, dbpool)

	_, err := dbpool.Exec(context.Background(), `
		UPDATE emails
		SET
			preheader = 'Rendered preheader',
			template_html = '<html><body><span data-email-preheader></span><a href="https://example.com/old" data-edit-text="primary_cta_text" data-edit-attr-href="primary_cta_url">Old CTA</a></body></html>',
			editable_fields = '{"primary_cta_text":{"type":"text","value":"Start now"},"primary_cta_url":{"type":"url","value":"https://example.com/start"}}'::jsonb
		WHERE id = $1;
	`, emailID)
	if err != nil {
		t.Fatalf("failed to prepare rendered test email: %v", err)
	}

	router := chi.NewRouter()
	registerEmailRoutes(router, dbpool)

	request := httptest.NewRequest(http.MethodGet, "/api/emails/"+emailID+"/rendered", nil)
	response := httptest.NewRecorder()
	router.ServeHTTP(response, request)

	if response.Code != http.StatusOK {
		t.Fatalf("expected GET status 200, got %d: %s", response.Code, response.Body.String())
	}

	var rendered renderedEmailResponse
	if err := json.NewDecoder(response.Body).Decode(&rendered); err != nil {
		t.Fatalf("failed to decode rendered email: %v", err)
	}
	if !strings.Contains(rendered.HTML, "Rendered preheader") {
		t.Fatalf("expected rendered preheader, got %s", rendered.HTML)
	}
	if !strings.Contains(rendered.HTML, "Start now") {
		t.Fatalf("expected rendered CTA text, got %s", rendered.HTML)
	}
	if !strings.Contains(rendered.HTML, `href="https://example.com/start"`) {
		t.Fatalf("expected rendered CTA URL, got %s", rendered.HTML)
	}
}

func TestGetRenderedEmailRejectsArchivedEmail(t *testing.T) {
	dbpool := testDBPool(t)
	emailID := createTestEmail(t, dbpool)

	_, err := dbpool.Exec(context.Background(), `
		UPDATE emails
		SET archived_at = now()
		WHERE id = $1;
	`, emailID)
	if err != nil {
		t.Fatalf("failed to archive test email: %v", err)
	}

	router := chi.NewRouter()
	registerEmailRoutes(router, dbpool)

	request := httptest.NewRequest(http.MethodGet, "/api/emails/"+emailID+"/rendered", nil)
	response := httptest.NewRecorder()
	router.ServeHTTP(response, request)

	if response.Code != http.StatusNotFound {
		t.Fatalf("expected GET status 404, got %d: %s", response.Code, response.Body.String())
	}
}

func TestDuplicateEmail(t *testing.T) {
	dbpool := testDBPool(t)
	emailID := createTestEmail(t, dbpool)
	user := createTestUserWithRole(t, dbpool, "admin")
	setTestEmailForDuplicate(t, dbpool, emailID)

	_, err := dbpool.Exec(context.Background(), `
		INSERT INTO comments (
			email_id,
			review_block,
			selected_text,
			start_offset,
			end_offset,
			body,
			status
		)
		VALUES ($1, 'body-001', 'selected text', 0, 13, 'Source comment', 'open');
	`, emailID)
	if err != nil {
		t.Fatalf("failed to seed source comment: %v", err)
	}

	router := chi.NewRouter()
	registerEmailRoutes(router, dbpool)

	requestBody := []byte(`{
		"language": "ES",
		"variant": "new",
		"title": "Duplicated Email",
		"subject": "Duplicated subject",
		"preheader": "Duplicated preheader"
	}`)
	request := httptest.NewRequest(
		http.MethodPost,
		"/api/emails/"+emailID+"/duplicate",
		bytes.NewReader(requestBody),
	)
	request = withAuthUser(request, user)
	response := httptest.NewRecorder()
	router.ServeHTTP(response, request)

	if response.Code != http.StatusCreated {
		t.Fatalf("expected POST status 201, got %d: %s", response.Code, response.Body.String())
	}

	var created EmailDetail
	if err := json.NewDecoder(response.Body).Decode(&created); err != nil {
		t.Fatalf("failed to decode duplicated email: %v", err)
	}
	if created.ID == "" || created.ID == emailID {
		t.Fatalf("expected duplicated email to have a new id, got %q", created.ID)
	}
	t.Cleanup(func() {
		_, _ = dbpool.Exec(context.Background(), `DELETE FROM emails WHERE id = $1;`, created.ID)
	})
	if created.Slug != "comment-test-email-es" {
		t.Fatalf("expected duplicated slug comment-test-email-es, got %q", created.Slug)
	}
	if created.Language != "es" {
		t.Fatalf("expected duplicated language es, got %q", created.Language)
	}
	if created.Variant != "new" {
		t.Fatalf("expected duplicated variant new, got %q", created.Variant)
	}
	if created.Title != "Duplicated Email" {
		t.Fatalf("expected duplicated title override, got %q", created.Title)
	}
	if created.Subject == nil || *created.Subject != "Duplicated subject" {
		t.Fatalf("expected duplicated subject override, got %#v", created.Subject)
	}
	if created.Preheader == nil || *created.Preheader != "Duplicated preheader" {
		t.Fatalf("expected duplicated preheader override, got %#v", created.Preheader)
	}
	assertJSONContainsField(t, created.EditableFields, "primary_cta_text")

	var commentCount int
	err = dbpool.QueryRow(context.Background(), `
		SELECT count(*)::int
		FROM comments
		WHERE email_id = $1;
	`, created.ID).Scan(&commentCount)
	if err != nil {
		t.Fatalf("failed to count duplicated comments: %v", err)
	}
	if commentCount != 0 {
		t.Fatalf("expected duplicated email to have no comments, got %d", commentCount)
	}

	var actorEmail string
	var metadataJSON []byte
	err = dbpool.QueryRow(context.Background(), `
		SELECT actor_email, metadata
		FROM email_events
		WHERE email_id = $1
			AND action = 'email_duplicated'
		ORDER BY created_at DESC
		LIMIT 1;
	`, created.ID).Scan(&actorEmail, &metadataJSON)
	if err != nil {
		t.Fatalf("failed to load duplicate event: %v", err)
	}
	if actorEmail != user.Email {
		t.Fatalf("expected duplicate event actor %s, got %s", user.Email, actorEmail)
	}
	var metadata map[string]any
	if err := json.Unmarshal(metadataJSON, &metadata); err != nil {
		t.Fatalf("failed to decode duplicate event metadata: %v", err)
	}
	if metadata["source_email_id"] != emailID {
		t.Fatalf("expected source_email_id %s, got %#v", emailID, metadata["source_email_id"])
	}
	if metadata["created_email_id"] != created.ID {
		t.Fatalf("expected created_email_id %s, got %#v", created.ID, metadata["created_email_id"])
	}
	if metadata["language"] != "es" {
		t.Fatalf("expected duplicate event language es, got %#v", metadata["language"])
	}
}

func TestDuplicateEmailConflict(t *testing.T) {
	dbpool := testDBPool(t)
	emailID := createTestEmail(t, dbpool)
	user := createTestUserWithRole(t, dbpool, "admin")
	setTestEmailForDuplicate(t, dbpool, emailID)
	conflictingID := createTestEmailWithSlug(t, dbpool, "comment-test-email-es")

	router := chi.NewRouter()
	registerEmailRoutes(router, dbpool)

	request := httptest.NewRequest(
		http.MethodPost,
		"/api/emails/"+emailID+"/duplicate",
		bytes.NewReader([]byte(`{ "language": "es", "variant": "new" }`)),
	)
	request = withAuthUser(request, user)
	response := httptest.NewRecorder()
	router.ServeHTTP(response, request)

	if response.Code != http.StatusConflict {
		t.Fatalf("expected POST status 409, got %d: %s", response.Code, response.Body.String())
	}

	var stillExists bool
	err := dbpool.QueryRow(context.Background(), `
		SELECT EXISTS(SELECT 1 FROM emails WHERE id = $1);
	`, conflictingID).Scan(&stillExists)
	if err != nil {
		t.Fatalf("failed to check conflicting email: %v", err)
	}
	if !stillExists {
		t.Fatal("conflicting email should not be modified or deleted")
	}
}

func TestDuplicateEmailNotFound(t *testing.T) {
	dbpool := testDBPool(t)
	user := createTestUserWithRole(t, dbpool, "admin")

	router := chi.NewRouter()
	registerEmailRoutes(router, dbpool)

	request := httptest.NewRequest(
		http.MethodPost,
		"/api/emails/00000000-0000-0000-0000-000000000000/duplicate",
		bytes.NewReader([]byte(`{ "language": "es" }`)),
	)
	request = withAuthUser(request, user)
	response := httptest.NewRecorder()
	router.ServeHTTP(response, request)

	if response.Code != http.StatusNotFound {
		t.Fatalf("expected POST status 404, got %d: %s", response.Code, response.Body.String())
	}
}

func TestDuplicateEmailRejectsMissingLanguage(t *testing.T) {
	dbpool := testDBPool(t)
	emailID := createTestEmail(t, dbpool)
	user := createTestUserWithRole(t, dbpool, "admin")

	router := chi.NewRouter()
	registerEmailRoutes(router, dbpool)

	request := httptest.NewRequest(
		http.MethodPost,
		"/api/emails/"+emailID+"/duplicate",
		bytes.NewReader([]byte(`{ "variant": "new" }`)),
	)
	request = withAuthUser(request, user)
	response := httptest.NewRecorder()
	router.ServeHTTP(response, request)

	if response.Code != http.StatusBadRequest {
		t.Fatalf("expected POST status 400, got %d: %s", response.Code, response.Body.String())
	}
}

func TestDuplicateEmailRejectsInvalidVariant(t *testing.T) {
	dbpool := testDBPool(t)
	emailID := createTestEmail(t, dbpool)
	user := createTestUserWithRole(t, dbpool, "admin")

	router := chi.NewRouter()
	registerEmailRoutes(router, dbpool)

	request := httptest.NewRequest(
		http.MethodPost,
		"/api/emails/"+emailID+"/duplicate",
		bytes.NewReader([]byte(`{ "language": "es", "variant": "draft" }`)),
	)
	request = withAuthUser(request, user)
	response := httptest.NewRecorder()
	router.ServeHTTP(response, request)

	if response.Code != http.StatusBadRequest {
		t.Fatalf("expected POST status 400, got %d: %s", response.Code, response.Body.String())
	}
}

func TestDuplicateEmailRejectsReviewer(t *testing.T) {
	dbpool := testDBPool(t)
	emailID := createTestEmail(t, dbpool)
	user := createTestUserWithRole(t, dbpool, "reviewer")

	router := chi.NewRouter()
	registerEmailRoutes(router, dbpool)

	request := httptest.NewRequest(
		http.MethodPost,
		"/api/emails/"+emailID+"/duplicate",
		bytes.NewReader([]byte(`{ "language": "es" }`)),
	)
	request = withAuthUser(request, user)
	response := httptest.NewRecorder()
	router.ServeHTTP(response, request)

	if response.Code != http.StatusForbidden {
		t.Fatalf("expected POST status 403, got %d: %s", response.Code, response.Body.String())
	}
}

func TestCreateEmailAdaptation(t *testing.T) {
	dbpool := testDBPool(t)
	emailID := createTestEmail(t, dbpool)
	user := createTestUserWithRole(t, dbpool, "admin")
	setTestEmailForDuplicate(t, dbpool, emailID)

	router := chi.NewRouter()
	registerEmailRoutes(router, dbpool)

	request := httptest.NewRequest(
		http.MethodPost,
		"/api/emails/"+emailID+"/adaptations",
		bytes.NewReader([]byte(`{ "label": "UAE" }`)),
	)
	request = withAuthUser(request, user)
	response := httptest.NewRecorder()
	router.ServeHTTP(response, request)

	if response.Code != http.StatusCreated {
		t.Fatalf("expected POST status 201, got %d: %s", response.Code, response.Body.String())
	}

	var created EmailDetail
	if err := json.NewDecoder(response.Body).Decode(&created); err != nil {
		t.Fatalf("failed to decode adaptation: %v", err)
	}
	t.Cleanup(func() {
		_, _ = dbpool.Exec(context.Background(), `DELETE FROM emails WHERE id = $1;`, created.ID)
	})
	if created.Slug != "comment-test-email-en--uae" {
		t.Fatalf("expected adaptation slug comment-test-email-en--uae, got %q", created.Slug)
	}
	if created.Language != "en" || created.Variant != "new" {
		t.Fatalf("expected adaptation to preserve en/new, got %s/%s", created.Language, created.Variant)
	}
	if created.AdaptationKey != "uae" || created.AdaptationLabel != "UAE" {
		t.Fatalf("expected uae/UAE adaptation, got %s/%s", created.AdaptationKey, created.AdaptationLabel)
	}
	assertJSONContainsField(t, created.EditableFields, "primary_cta_text")

	var commentCount int
	if err := dbpool.QueryRow(context.Background(), `
		SELECT count(*)::int FROM comments WHERE email_id = $1;
	`, created.ID).Scan(&commentCount); err != nil {
		t.Fatalf("failed to count adaptation comments: %v", err)
	}
	if commentCount != 0 {
		t.Fatalf("expected adaptation to have no comments, got %d", commentCount)
	}
}

func TestCreateEmailAdaptationConflict(t *testing.T) {
	dbpool := testDBPool(t)
	emailID := createTestEmail(t, dbpool)
	user := createTestUserWithRole(t, dbpool, "admin")
	setTestEmailForDuplicate(t, dbpool, emailID)
	t.Cleanup(func() {
		_, _ = dbpool.Exec(context.Background(), `DELETE FROM emails WHERE slug = 'comment-test-email-en--uae';`)
	})

	router := chi.NewRouter()
	registerEmailRoutes(router, dbpool)
	for index := 0; index < 2; index++ {
		request := httptest.NewRequest(
			http.MethodPost,
			"/api/emails/"+emailID+"/adaptations",
			bytes.NewReader([]byte(`{ "label": "UAE" }`)),
		)
		request = withAuthUser(request, user)
		response := httptest.NewRecorder()
		router.ServeHTTP(response, request)
		if index == 0 && response.Code != http.StatusCreated {
			t.Fatalf("expected first POST status 201, got %d: %s", response.Code, response.Body.String())
		}
		if index == 1 && response.Code != http.StatusConflict {
			t.Fatalf("expected second POST status 409, got %d: %s", response.Code, response.Body.String())
		}
	}
}

func TestArchiveEmail(t *testing.T) {
	dbpool := testDBPool(t)
	emailID := createTestEmail(t, dbpool)
	user := createTestUserWithRole(t, dbpool, "admin")

	router := chi.NewRouter()
	registerEmailRoutes(router, dbpool)

	request := httptest.NewRequest(
		http.MethodPatch,
		"/api/emails/"+emailID+"/archive",
		nil,
	)
	request = withAuthUser(request, user)
	response := httptest.NewRecorder()
	router.ServeHTTP(response, request)

	if response.Code != http.StatusNoContent {
		t.Fatalf("expected PATCH status 204, got %d: %s", response.Code, response.Body.String())
	}

	var archivedBy string
	err := dbpool.QueryRow(context.Background(), `
		SELECT archived_by
		FROM emails
		WHERE id = $1
			AND archived_at IS NOT NULL;
	`, emailID).Scan(&archivedBy)
	if err != nil {
		t.Fatalf("expected email to be archived: %v", err)
	}
	if archivedBy != user.ID {
		t.Fatalf("expected archived_by %s, got %s", user.ID, archivedBy)
	}

	var actorEmail string
	var metadataJSON []byte
	err = dbpool.QueryRow(context.Background(), `
		SELECT actor_email, metadata
		FROM email_events
		WHERE email_id = $1
			AND action = 'email_archived'
		ORDER BY created_at DESC
		LIMIT 1;
	`, emailID).Scan(&actorEmail, &metadataJSON)
	if err != nil {
		t.Fatalf("failed to load archive event: %v", err)
	}
	if actorEmail != user.Email {
		t.Fatalf("expected archive event actor %s, got %s", user.Email, actorEmail)
	}
	var metadata map[string]any
	if err := json.Unmarshal(metadataJSON, &metadata); err != nil {
		t.Fatalf("failed to decode archive event metadata: %v", err)
	}
	if metadata["title"] != "Comment Test Email" {
		t.Fatalf("expected archive event title Comment Test Email, got %#v", metadata["title"])
	}
	if metadata["slug"] != "comment-test-email" {
		t.Fatalf("expected archive event slug comment-test-email, got %#v", metadata["slug"])
	}
}

func TestListEmailEventsRequiresSuperAdmin(t *testing.T) {
	dbpool := testDBPool(t)
	emailID := createTestEmail(t, dbpool)
	admin := createTestUserWithRole(t, dbpool, "admin")
	superAdmin := createTestUserWithRole(t, dbpool, "super_admin")

	_, err := dbpool.Exec(context.Background(), `
		INSERT INTO email_events (
			actor_user_id,
			actor_email,
			action,
			email_id,
			email_slug,
			email_title,
			metadata,
			changes
		)
		VALUES ($1, $2, 'email_updated', $3, 'comment-test-email', 'Test Email', '{}'::jsonb, '{"title":{"before":"Old","after":"New"}}'::jsonb);
	`, admin.ID, admin.Email, emailID)
	if err != nil {
		t.Fatalf("failed to insert email event: %v", err)
	}

	router := chi.NewRouter()
	registerEmailRoutes(router, dbpool)

	adminRequest := httptest.NewRequest(http.MethodGet, "/api/admin/email-events", nil)
	adminRequest = withAuthUser(adminRequest, admin)
	adminResponse := httptest.NewRecorder()
	router.ServeHTTP(adminResponse, adminRequest)
	if adminResponse.Code != http.StatusForbidden {
		t.Fatalf("expected admin GET status 403, got %d: %s", adminResponse.Code, adminResponse.Body.String())
	}

	superRequest := httptest.NewRequest(
		http.MethodGet,
		"/api/admin/email-events?action=email_updated&actor_email=email-handler-admin&email=Test&limit=50",
		nil,
	)
	superRequest = withAuthUser(superRequest, superAdmin)
	superResponse := httptest.NewRecorder()
	router.ServeHTTP(superResponse, superRequest)
	if superResponse.Code != http.StatusOK {
		t.Fatalf("expected super admin GET status 200, got %d: %s", superResponse.Code, superResponse.Body.String())
	}

	var events []EmailEventItem
	if err := json.NewDecoder(superResponse.Body).Decode(&events); err != nil {
		t.Fatalf("failed to decode email events: %v", err)
	}
	if len(events) == 0 {
		t.Fatal("expected at least one email event")
	}
	if events[0].Action != "email_updated" {
		t.Fatalf("expected email_updated event, got %q", events[0].Action)
	}
	if events[0].ActorEmail != admin.Email {
		t.Fatalf("expected event actor %s, got %s", admin.Email, events[0].ActorEmail)
	}
}

func TestArchiveEmailRejectsReviewer(t *testing.T) {
	dbpool := testDBPool(t)
	emailID := createTestEmail(t, dbpool)
	user := createTestUserWithRole(t, dbpool, "reviewer")

	router := chi.NewRouter()
	registerEmailRoutes(router, dbpool)

	request := httptest.NewRequest(
		http.MethodPatch,
		"/api/emails/"+emailID+"/archive",
		nil,
	)
	request = withAuthUser(request, user)
	response := httptest.NewRecorder()
	router.ServeHTTP(response, request)

	if response.Code != http.StatusForbidden {
		t.Fatalf("expected PATCH status 403, got %d: %s", response.Code, response.Body.String())
	}
}

func setTestEmailTemplate(t *testing.T, dbpool *pgxpool.Pool, emailID string, templateHTML string) {
	t.Helper()

	_, err := dbpool.Exec(context.Background(), `
		UPDATE emails
		SET template_html = $2
		WHERE id = $1;
	`, emailID, templateHTML)
	if err != nil {
		t.Fatalf("failed to update test email template: %v", err)
	}
}

type testCommentAnchor struct {
	ReviewBlock  string
	SelectedText string
	StartOffset  int
	EndOffset    int
	Status       string
}

func loadTestCommentAnchorsByBody(t *testing.T, dbpool *pgxpool.Pool, emailID string) map[string]testCommentAnchor {
	t.Helper()

	rows, err := dbpool.Query(context.Background(), `
		SELECT body, review_block, selected_text, start_offset, end_offset, status
		FROM comments
		WHERE email_id = $1;
	`, emailID)
	if err != nil {
		t.Fatalf("failed to load comment anchors: %v", err)
	}
	defer rows.Close()

	anchors := map[string]testCommentAnchor{}
	for rows.Next() {
		var body string
		var anchor testCommentAnchor
		if err := rows.Scan(
			&body,
			&anchor.ReviewBlock,
			&anchor.SelectedText,
			&anchor.StartOffset,
			&anchor.EndOffset,
			&anchor.Status,
		); err != nil {
			t.Fatalf("failed to scan comment anchor: %v", err)
		}
		anchors[body] = anchor
	}
	if err := rows.Err(); err != nil {
		t.Fatalf("failed to read comment anchors: %v", err)
	}

	return anchors
}

func assertCommentAnchor(
	t *testing.T,
	anchors map[string]testCommentAnchor,
	body string,
	reviewBlock string,
	selectedText string,
	startOffset int,
	endOffset int,
	status string,
) {
	t.Helper()

	anchor, ok := anchors[body]
	if !ok {
		t.Fatalf("expected comment %q, got %#v", body, anchors)
	}
	if anchor.ReviewBlock != reviewBlock ||
		anchor.SelectedText != selectedText ||
		anchor.StartOffset != startOffset ||
		anchor.EndOffset != endOffset ||
		anchor.Status != status {
		t.Fatalf(
			"unexpected anchor for %q: got %#v, want block=%q selected=%q start=%d end=%d status=%q",
			body,
			anchor,
			reviewBlock,
			selectedText,
			startOffset,
			endOffset,
			status,
		)
	}
}

func setTestEmailForDuplicate(t *testing.T, dbpool *pgxpool.Pool, emailID string) {
	t.Helper()

	_, err := dbpool.Exec(context.Background(), `
		UPDATE emails
		SET
			slug = 'comment-test-email-en',
			sequence = 'onboarding',
			title = 'Source Email',
			subject = 'Source subject',
			preheader = 'Source preheader',
			send_timing = 'day 1',
			stage = 'registered',
			sort_order = 10,
			language = 'en',
			variant = 'new',
			body_text = 'Source body text',
			content_parts = '{"subject":"Source subject","preheader":"Source preheader","body_text":"Source body text"}'::jsonb,
			original_html = '<html><body><a href="https://example.com">Old CTA</a></body></html>',
			review_html = '<html><body><a data-review-block="primary_cta" href="https://example.com">Old CTA</a></body></html>',
			template_html = '<html><body><a data-review-block="primary_cta" data-edit-text="primary_cta_text" href="https://example.com">Old CTA</a></body></html>',
			template_hash = 'test-template-hash',
			template_version = 'v1',
			editable_fields = '{"primary_cta_text":{"type":"text","value":"Old CTA"}}'::jsonb
		WHERE id = $1;
	`, emailID)
	if err != nil {
		t.Fatalf("failed to prepare duplicate source email: %v", err)
	}
}

func createTestEmailWithSlug(t *testing.T, dbpool *pgxpool.Pool, slug string) string {
	t.Helper()

	var emailID string
	err := dbpool.QueryRow(context.Background(), `
		INSERT INTO emails (
			slug,
			title,
			stage,
			sort_order,
			language,
			variant,
			original_html,
			review_html,
			template_html,
			editable_fields
		)
		VALUES (
			$1,
			'Conflicting Email',
			'test',
			9998,
			'es',
			'new',
			'<html><body>conflict</body></html>',
			'<html><body><p data-review-block="body-001">conflict</p></body></html>',
			'<html><body><p data-review-block="body-001">conflict</p></body></html>',
			'{}'::jsonb
		)
		RETURNING id;
	`, slug).Scan(&emailID)
	if err != nil {
		t.Fatalf("failed to create conflicting test email: %v", err)
	}

	t.Cleanup(func() {
		_, _ = dbpool.Exec(context.Background(), `DELETE FROM emails WHERE id = $1;`, emailID)
	})

	return emailID
}

func createTestUserWithRole(t *testing.T, dbpool *pgxpool.Pool, role string) AuthUser {
	t.Helper()

	var user AuthUser
	err := dbpool.QueryRow(context.Background(), `
		INSERT INTO users (email, role)
		VALUES ($1, $2)
		ON CONFLICT (email) DO UPDATE SET
			role = EXCLUDED.role,
			updated_at = now()
		RETURNING id, email, role;
	`, "email-handler-"+role+"@example.com", role).Scan(&user.ID, &user.Email, &user.Role)
	if err != nil {
		t.Fatalf("failed to create %s test user: %v", role, err)
	}

	t.Cleanup(func() {
		_, _ = dbpool.Exec(context.Background(), `DELETE FROM users WHERE id = $1;`, user.ID)
	})

	return user
}

func withAuthUser(request *http.Request, user AuthUser) *http.Request {
	return request.WithContext(context.WithValue(request.Context(), authUserContextKey, user))
}

func loadTestEmailEditableFields(t *testing.T, dbpool *pgxpool.Pool, emailID string) map[string]struct {
	Type  string `json:"type"`
	Value any    `json:"value"`
} {
	t.Helper()

	var fieldsJSON []byte
	err := dbpool.QueryRow(context.Background(), `
		SELECT editable_fields
		FROM emails
		WHERE id = $1;
	`, emailID).Scan(&fieldsJSON)
	if err != nil {
		t.Fatalf("failed to load editable fields: %v", err)
	}

	var fields map[string]struct {
		Type  string `json:"type"`
		Value any    `json:"value"`
	}
	if err := json.Unmarshal(fieldsJSON, &fields); err != nil {
		t.Fatalf("failed to decode editable fields: %v", err)
	}

	return fields
}

func assertEditableField(
	t *testing.T,
	fields map[string]struct {
		Type  string `json:"type"`
		Value any    `json:"value"`
	},
	key string,
	fieldType string,
	value any,
) {
	t.Helper()

	field, ok := fields[key]
	if !ok {
		t.Fatalf("field %q is missing", key)
	}
	if field.Type != fieldType {
		t.Fatalf("field %q type = %q, want %q", key, field.Type, fieldType)
	}
	if field.Value != value {
		t.Fatalf("field %q value = %#v, want %#v", key, field.Value, value)
	}
}

func assertJSONContainsField(t *testing.T, raw json.RawMessage, key string) {
	t.Helper()

	var fields map[string]any
	if err := json.Unmarshal(raw, &fields); err != nil {
		t.Fatalf("failed to decode raw JSON fields: %v", err)
	}
	if _, ok := fields[key]; !ok {
		t.Fatalf("expected JSON fields to contain %q, got %#v", key, fields)
	}
}
