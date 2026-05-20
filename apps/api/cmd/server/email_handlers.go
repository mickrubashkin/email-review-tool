package main

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"net/http"
	"os"
	"reflect"
	"strings"
	"unicode/utf16"

	"github.com/go-chi/chi/v5"
	"github.com/jackc/pgx/v5/pgconn"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/mickrubashkin/email-review-tool/apps/api/internal/emailedit"
	"github.com/mickrubashkin/email-review-tool/apps/api/internal/emailtext"
	xhtml "golang.org/x/net/html"
)

func registerEmailRoutes(r chi.Router, dbpool *pgxpool.Pool) {
	r.Get("/api/emails", listEmailsHandler(dbpool))
	r.Get("/api/emails/{id}", getEmailHandler(dbpool))
	r.Get("/api/emails/{id}/rendered", getRenderedEmailHandler(dbpool))
	r.Patch("/api/emails/{id}/editable-fields", updateEmailEditableFieldsHandler(dbpool))
	r.Post("/api/emails/{id}/duplicate", duplicateEmailHandler(dbpool))
	r.Post("/api/emails/{id}/adaptations", createEmailAdaptationHandler(dbpool))
	r.Patch("/api/emails/{id}/archive", archiveEmailHandler(dbpool))
	r.Get("/api/admin/email-events", listEmailEventsHandler(dbpool))
}

func listEmailsHandler(dbpool *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		rows, err := dbpool.Query(r.Context(), `
			SELECT
				id,
				sequence,
				title,
				subject,
				preheader,
				send_timing,
				stage,
				sort_order,
				language,
				variant,
				adaptation_key,
				adaptation_label,
				(
					SELECT count(*)::int
					FROM comments
					WHERE comments.email_id = emails.id
						AND comments.status = 'open'
					) AS open_comment_count
			FROM emails
			WHERE archived_at IS NULL
			ORDER BY sort_order, created_at;
		`)
		if err != nil {
			http.Error(w, "failed to load emails", http.StatusInternalServerError)
			return
		}
		defer rows.Close()

		emails := []EmailListItem{}

		for rows.Next() {
			var email EmailListItem

			err := rows.Scan(
				&email.ID,
				&email.Sequence,
				&email.Title,
				&email.Subject,
				&email.Preheader,
				&email.SendTiming,
				&email.Stage,
				&email.SortOrder,
				&email.Language,
				&email.Variant,
				&email.AdaptationKey,
				&email.AdaptationLabel,
				&email.OpenCommentCount,
			)
			if err != nil {
				fmt.Fprintf(os.Stderr, "failed to scan email row: %v\n", err)
				http.Error(w, "failed to read emails", http.StatusInternalServerError)
				return
			}

			emails = append(emails, email)
		}

		if err := rows.Err(); err != nil {
			http.Error(w, "failed to read emails", http.StatusInternalServerError)
			return
		}

		_ = json.NewEncoder(w).Encode(emails)
	}
}

func getEmailHandler(dbpool *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		id := chi.URLParam(r, "id")

		var email EmailDetail
		var editableFields []byte

		err := dbpool.QueryRow(r.Context(), `
			SELECT
				id,
				slug,
				sequence,
				title,
				subject,
				preheader,
				send_timing,
				stage,
				sort_order,
				language,
				variant,
				adaptation_key,
				adaptation_label,
				(
					SELECT count(*)::int
					FROM comments
					WHERE comments.email_id = emails.id
						AND comments.status = 'open'
				) AS open_comment_count,
				original_html,
				review_html,
				template_html,
				template_hash,
				template_version,
				editable_fields
			FROM emails
			WHERE id = $1;
		`, id).Scan(
			&email.ID,
			&email.Slug,
			&email.Sequence,
			&email.Title,
			&email.Subject,
			&email.Preheader,
			&email.SendTiming,
			&email.Stage,
			&email.SortOrder,
			&email.Language,
			&email.Variant,
			&email.AdaptationKey,
			&email.AdaptationLabel,
			&email.OpenCommentCount,
			&email.OriginalHTML,
			&email.ReviewHTML,
			&email.TemplateHTML,
			&email.TemplateHash,
			&email.TemplateVersion,
			&editableFields,
		)

		if err != nil {
			fmt.Fprintf(os.Stderr, "failed to get email %s: %v\n", id, err)
			http.Error(w, "email not found", http.StatusNotFound)
			return
		}

		email.EditableFields = json.RawMessage(editableFields)

		_ = json.NewEncoder(w).Encode(email)
	}
}

type updateEmailEditableFieldsRequest struct {
	Title          *string                  `json:"title"`
	Subject        *string                  `json:"subject"`
	Preheader      *string                  `json:"preheader"`
	EditableFields emailedit.EditableFields `json:"editable_fields"`
}

type renderedEmailResponse struct {
	HTML string `json:"html"`
}

func getRenderedEmailHandler(dbpool *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		id := chi.URLParam(r, "id")

		var templateHTML string
		var preheader *string
		var editableFieldsJSON []byte
		err := dbpool.QueryRow(r.Context(), `
			SELECT template_html, preheader, editable_fields
			FROM emails
			WHERE id = $1
				AND archived_at IS NULL;
		`, id).Scan(&templateHTML, &preheader, &editableFieldsJSON)
		if err != nil {
			http.Error(w, "email not found", http.StatusNotFound)
			return
		}

		var editableFields emailedit.EditableFields
		if err := json.Unmarshal(editableFieldsJSON, &editableFields); err != nil {
			http.Error(w, "invalid editable fields", http.StatusInternalServerError)
			return
		}

		html, err := emailedit.RenderEditableHTMLWithMetadata(templateHTML, editableFields, emailedit.RenderMetadata{
			Preheader: stringFromPointer(preheader),
		})
		if err != nil {
			fmt.Fprintf(os.Stderr, "failed to render email %s: %v\n", id, err)
			http.Error(w, "failed to render email", http.StatusInternalServerError)
			return
		}

		w.Header().Set("Content-Type", "application/json")
		_ = json.NewEncoder(w).Encode(renderedEmailResponse{HTML: html})
	}
}

func updateEmailEditableFieldsHandler(dbpool *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		id := chi.URLParam(r, "id")
		user, ok := authUserFromContext(r)
		if !ok {
			http.Error(w, "unauthorized", http.StatusUnauthorized)
			return
		}
		if !isAdminUser(user) {
			http.Error(w, "forbidden", http.StatusForbidden)
			return
		}

		var request updateEmailEditableFieldsRequest
		if err := json.NewDecoder(r.Body).Decode(&request); err != nil {
			http.Error(w, "invalid request body", http.StatusBadRequest)
			return
		}
		if request.EditableFields == nil {
			http.Error(w, "editable_fields is required", http.StatusBadRequest)
			return
		}

		var templateHTML string
		var currentTitle string
		var currentSubject *string
		var currentPreheader *string
		var bodyText *string
		var originalHTML string
		var currentEditableFieldsJSON []byte
		var slug string
		err := dbpool.QueryRow(r.Context(), `
			SELECT slug, template_html, title, subject, preheader, body_text, original_html, editable_fields
			FROM emails
			WHERE id = $1
				AND archived_at IS NULL;
		`, id).Scan(&slug, &templateHTML, &currentTitle, &currentSubject, &currentPreheader, &bodyText, &originalHTML, &currentEditableFieldsJSON)
		if err != nil {
			http.Error(w, "email not found", http.StatusNotFound)
			return
		}

		title := currentTitle
		if request.Title != nil {
			title = strings.TrimSpace(*request.Title)
		}
		if title == "" {
			http.Error(w, "title is required", http.StatusBadRequest)
			return
		}

		subject := currentSubject
		if request.Subject != nil {
			subject = request.Subject
		}
		preheader := currentPreheader
		if request.Preheader != nil {
			preheader = request.Preheader
		}

		renderedHTML, err := emailedit.RenderEditableHTMLWithMetadata(templateHTML, request.EditableFields, emailedit.RenderMetadata{
			Preheader: stringFromPointer(preheader),
		})
		if err != nil {
			fmt.Fprintf(os.Stderr, "invalid editable fields for email %s: %v\n", id, err)
			http.Error(w, "invalid editable fields", http.StatusBadRequest)
			return
		}

		fieldsJSON, err := request.EditableFields.JSON()
		if err != nil {
			http.Error(w, "invalid editable fields", http.StatusBadRequest)
			return
		}
		contentParts := emailtext.ExtractContentParts(
			originalHTML,
			stringFromPointer(subject),
			stringFromPointer(preheader),
			stringFromPointer(bodyText),
		)
		contentPartsJSON, err := json.Marshal(contentParts)
		if err != nil {
			http.Error(w, "failed to update editable fields", http.StatusInternalServerError)
			return
		}

		changes, err := buildEmailUpdateChanges(
			currentTitle,
			currentSubject,
			currentPreheader,
			currentEditableFieldsJSON,
			title,
			subject,
			preheader,
			request.EditableFields,
		)
		if err != nil {
			http.Error(w, "failed to update editable fields", http.StatusInternalServerError)
			return
		}
		commentAnchorTexts, err := changedCommentAnchorTexts(
			templateHTML,
			renderedHTML,
			currentTitle,
			currentSubject,
			currentPreheader,
			currentEditableFieldsJSON,
			title,
			subject,
			preheader,
			request.EditableFields,
		)
		if err != nil {
			http.Error(w, "failed to update editable fields", http.StatusInternalServerError)
			return
		}

		tx, err := dbpool.Begin(r.Context())
		if err != nil {
			http.Error(w, "failed to update editable fields", http.StatusInternalServerError)
			return
		}
		defer tx.Rollback(r.Context())

		result, err := tx.Exec(r.Context(), `
			UPDATE emails
			SET title = $2,
				subject = $3,
				preheader = $4,
				editable_fields = $5::jsonb,
				content_parts = $6::jsonb,
				updated_at = now()
			WHERE id = $1
				AND archived_at IS NULL;
		`, id, title, subject, preheader, fieldsJSON, contentPartsJSON)
		if err != nil {
			http.Error(w, "failed to update editable fields", http.StatusInternalServerError)
			return
		}
		if result.RowsAffected() == 0 {
			http.Error(w, "email not found", http.StatusNotFound)
			return
		}
		if err := resetCommentAnchorsForReviewBlocks(r.Context(), tx, id, commentAnchorTexts); err != nil {
			http.Error(w, "failed to update editable fields", http.StatusInternalServerError)
			return
		}
		if err := insertEmailEvent(r.Context(), tx, emailEvent{
			ActorUserID: user.ID,
			ActorEmail:  user.Email,
			Action:      emailEventUpdated,
			EmailID:     &id,
			EmailSlug:   &slug,
			EmailTitle:  &title,
			Changes:     changes,
		}); err != nil {
			fmt.Fprintf(os.Stderr, "failed to insert email update event for %s: %v\n", id, err)
			http.Error(w, "failed to record email event", http.StatusInternalServerError)
			return
		}
		if err := tx.Commit(r.Context()); err != nil {
			http.Error(w, "failed to update editable fields", http.StatusInternalServerError)
			return
		}

		w.WriteHeader(http.StatusNoContent)
	}
}

type duplicateEmailRequest struct {
	Language  string  `json:"language"`
	Variant   *string `json:"variant"`
	Title     *string `json:"title"`
	Subject   *string `json:"subject"`
	Preheader *string `json:"preheader"`
}

type createEmailAdaptationRequest struct {
	Label string `json:"label"`
}

func duplicateEmailHandler(dbpool *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		id := chi.URLParam(r, "id")
		user, ok := authUserFromContext(r)
		if !ok {
			http.Error(w, "unauthorized", http.StatusUnauthorized)
			return
		}
		if !isAdminUser(user) {
			http.Error(w, "forbidden", http.StatusForbidden)
			return
		}

		var request duplicateEmailRequest
		if err := json.NewDecoder(r.Body).Decode(&request); err != nil {
			http.Error(w, "invalid request body", http.StatusBadRequest)
			return
		}

		language := strings.ToLower(strings.TrimSpace(request.Language))
		if language == "" {
			http.Error(w, "language is required", http.StatusBadRequest)
			return
		}

		source, err := loadEmailForDuplicate(r, dbpool, id)
		if err != nil {
			http.Error(w, "email not found", http.StatusNotFound)
			return
		}

		variant := source.Variant
		if request.Variant != nil {
			variant = strings.ToLower(strings.TrimSpace(*request.Variant))
		}
		if variant != "new" && variant != "old" {
			http.Error(w, "variant must be new or old", http.StatusBadRequest)
			return
		}

		title := source.Title
		if request.Title != nil {
			title = strings.TrimSpace(*request.Title)
		}
		if title == "" {
			http.Error(w, "title is required", http.StatusBadRequest)
			return
		}

		subject := source.Subject
		if request.Subject != nil {
			subject = request.Subject
		}

		preheader := source.Preheader
		if request.Preheader != nil {
			preheader = request.Preheader
		}

		slug := duplicateEmailSlug(source.Slug, source.Language, language, variant)
		contentParts, err := json.Marshal(emailtext.ExtractContentParts(
			source.OriginalHTML,
			stringFromPointer(subject),
			stringFromPointer(preheader),
			stringFromPointer(source.BodyText),
		))
		if err != nil {
			http.Error(w, "failed to build duplicated email", http.StatusInternalServerError)
			return
		}

		tx, err := dbpool.Begin(r.Context())
		if err != nil {
			http.Error(w, "failed to duplicate email", http.StatusInternalServerError)
			return
		}
		defer tx.Rollback(r.Context())

		created, err := insertDuplicatedEmail(r, tx, duplicateEmailInsert{
			Slug:            slug,
			Sequence:        source.Sequence,
			Title:           title,
			Subject:         subject,
			Preheader:       preheader,
			SendTiming:      source.SendTiming,
			Stage:           source.Stage,
			SortOrder:       source.SortOrder,
			Language:        language,
			Variant:         variant,
			AdaptationKey:   "default",
			AdaptationLabel: "Default",
			BodyText:        source.BodyText,
			ContentParts:    contentParts,
			OriginalHTML:    source.OriginalHTML,
			ReviewHTML:      source.ReviewHTML,
			TemplateHTML:    source.TemplateHTML,
			TemplateHash:    source.TemplateHash,
			TemplateVersion: source.TemplateVersion,
			EditableFields:  source.EditableFields,
		})
		if err != nil {
			if isEmailCreationConflict(err) {
				http.Error(w, "email duplicate already exists", http.StatusConflict)
				return
			}
			fmt.Fprintf(os.Stderr, "failed to duplicate email %s: %v\n", id, err)
			http.Error(w, "failed to duplicate email", http.StatusInternalServerError)
			return
		}
		if err := insertEmailEvent(r.Context(), tx, emailEvent{
			ActorUserID: user.ID,
			ActorEmail:  user.Email,
			Action:      emailEventDuplicated,
			EmailID:     &created.ID,
			EmailSlug:   &created.Slug,
			EmailTitle:  &created.Title,
			Metadata: map[string]any{
				"source_email_id":  id,
				"source_slug":      source.Slug,
				"created_email_id": created.ID,
				"language":         created.Language,
				"variant":          created.Variant,
			},
		}); err != nil {
			fmt.Fprintf(os.Stderr, "failed to insert email duplicate event for %s: %v\n", created.ID, err)
			http.Error(w, "failed to record email event", http.StatusInternalServerError)
			return
		}
		if err := tx.Commit(r.Context()); err != nil {
			http.Error(w, "failed to duplicate email", http.StatusInternalServerError)
			return
		}

		w.WriteHeader(http.StatusCreated)
		_ = json.NewEncoder(w).Encode(created)
	}
}

func createEmailAdaptationHandler(dbpool *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		id := chi.URLParam(r, "id")
		user, ok := authUserFromContext(r)
		if !ok {
			http.Error(w, "unauthorized", http.StatusUnauthorized)
			return
		}
		if !isAdminUser(user) {
			http.Error(w, "forbidden", http.StatusForbidden)
			return
		}

		var request createEmailAdaptationRequest
		if err := json.NewDecoder(r.Body).Decode(&request); err != nil {
			http.Error(w, "invalid request body", http.StatusBadRequest)
			return
		}
		label := strings.TrimSpace(request.Label)
		key := normalizeAdaptationKey(label)
		if label == "" || key == "" {
			http.Error(w, "label is required", http.StatusBadRequest)
			return
		}

		source, err := loadEmailForDuplicate(r, dbpool, id)
		if err != nil {
			http.Error(w, "email not found", http.StatusNotFound)
			return
		}

		contentParts, err := json.Marshal(emailtext.ExtractContentParts(
			source.OriginalHTML,
			stringFromPointer(source.Subject),
			stringFromPointer(source.Preheader),
			stringFromPointer(source.BodyText),
		))
		if err != nil {
			http.Error(w, "failed to build adaptation", http.StatusInternalServerError)
			return
		}

		tx, err := dbpool.Begin(r.Context())
		if err != nil {
			http.Error(w, "failed to create adaptation", http.StatusInternalServerError)
			return
		}
		defer tx.Rollback(r.Context())

		created, err := insertDuplicatedEmail(r, tx, duplicateEmailInsert{
			Slug:            adaptationEmailSlug(source.Slug, source.AdaptationKey, key),
			Sequence:        source.Sequence,
			Title:           source.Title,
			Subject:         source.Subject,
			Preheader:       source.Preheader,
			SendTiming:      source.SendTiming,
			Stage:           source.Stage,
			SortOrder:       source.SortOrder,
			Language:        source.Language,
			Variant:         source.Variant,
			AdaptationKey:   key,
			AdaptationLabel: label,
			BodyText:        source.BodyText,
			ContentParts:    contentParts,
			OriginalHTML:    source.OriginalHTML,
			ReviewHTML:      source.ReviewHTML,
			TemplateHTML:    source.TemplateHTML,
			TemplateHash:    source.TemplateHash,
			TemplateVersion: source.TemplateVersion,
			EditableFields:  source.EditableFields,
		})
		if err != nil {
			if isEmailCreationConflict(err) {
				http.Error(w, "email adaptation already exists", http.StatusConflict)
				return
			}
			fmt.Fprintf(os.Stderr, "failed to create adaptation from email %s: %v\n", id, err)
			http.Error(w, "failed to create adaptation", http.StatusInternalServerError)
			return
		}
		if err := insertEmailEvent(r.Context(), tx, emailEvent{
			ActorUserID: user.ID,
			ActorEmail:  user.Email,
			Action:      emailEventAdaptationCreated,
			EmailID:     &created.ID,
			EmailSlug:   &created.Slug,
			EmailTitle:  &created.Title,
			Metadata: map[string]any{
				"source_email_id":  id,
				"source_slug":      source.Slug,
				"created_email_id": created.ID,
				"adaptation_key":   created.AdaptationKey,
				"adaptation_label": created.AdaptationLabel,
			},
		}); err != nil {
			http.Error(w, "failed to record email event", http.StatusInternalServerError)
			return
		}
		if err := tx.Commit(r.Context()); err != nil {
			http.Error(w, "failed to create adaptation", http.StatusInternalServerError)
			return
		}

		w.WriteHeader(http.StatusCreated)
		_ = json.NewEncoder(w).Encode(created)
	}
}

func archiveEmailHandler(dbpool *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		id := chi.URLParam(r, "id")
		user, ok := authUserFromContext(r)
		if !ok {
			http.Error(w, "unauthorized", http.StatusUnauthorized)
			return
		}
		if !isAdminUser(user) {
			http.Error(w, "forbidden", http.StatusForbidden)
			return
		}

		var snapshot emailArchiveSnapshot
		err := dbpool.QueryRow(r.Context(), `
			SELECT id, slug, title, language, variant, stage
			FROM emails
			WHERE id = $1
				AND archived_at IS NULL;
		`, id).Scan(
			&snapshot.ID,
			&snapshot.Slug,
			&snapshot.Title,
			&snapshot.Language,
			&snapshot.Variant,
			&snapshot.Stage,
		)
		if err != nil {
			http.Error(w, "email not found", http.StatusNotFound)
			return
		}

		tx, err := dbpool.Begin(r.Context())
		if err != nil {
			http.Error(w, "failed to archive email", http.StatusInternalServerError)
			return
		}
		defer tx.Rollback(r.Context())

		result, err := tx.Exec(r.Context(), `
			UPDATE emails
			SET archived_at = now(),
				archived_by = $2,
				updated_at = now()
			WHERE id = $1
				AND archived_at IS NULL;
		`, id, user.ID)
		if err != nil {
			http.Error(w, "failed to archive email", http.StatusInternalServerError)
			return
		}
		if result.RowsAffected() == 0 {
			http.Error(w, "email not found", http.StatusNotFound)
			return
		}
		if err := insertEmailEvent(r.Context(), tx, emailEvent{
			ActorUserID: user.ID,
			ActorEmail:  user.Email,
			Action:      emailEventArchived,
			EmailID:     &snapshot.ID,
			EmailSlug:   &snapshot.Slug,
			EmailTitle:  &snapshot.Title,
			Metadata: map[string]any{
				"slug":     snapshot.Slug,
				"title":    snapshot.Title,
				"language": snapshot.Language,
				"variant":  snapshot.Variant,
				"stage":    snapshot.Stage,
			},
		}); err != nil {
			fmt.Fprintf(os.Stderr, "failed to insert email archive event for %s: %v\n", id, err)
			http.Error(w, "failed to record email event", http.StatusInternalServerError)
			return
		}
		if err := tx.Commit(r.Context()); err != nil {
			http.Error(w, "failed to archive email", http.StatusInternalServerError)
			return
		}

		w.WriteHeader(http.StatusNoContent)
	}
}

func listEmailEventsHandler(dbpool *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		user, ok := authUserFromContext(r)
		if !ok {
			http.Error(w, "unauthorized", http.StatusUnauthorized)
			return
		}
		if !isSuperAdminUser(user) {
			http.Error(w, "forbidden", http.StatusForbidden)
			return
		}

		filters := emailEventFilters{
			ActorEmail: strings.TrimSpace(r.URL.Query().Get("actor_email")),
			Action:     strings.TrimSpace(r.URL.Query().Get("action")),
			Email:      strings.TrimSpace(r.URL.Query().Get("email")),
			Limit:      parseAuthEventsLimit(r.URL.Query().Get("limit")),
		}

		events, err := listEmailEvents(r.Context(), dbpool, filters)
		if err != nil {
			fmt.Fprintf(os.Stderr, "failed to list email events: %v\n", err)
			http.Error(w, "failed to load email events", http.StatusInternalServerError)
			return
		}

		w.Header().Set("Content-Type", "application/json")
		_ = json.NewEncoder(w).Encode(events)
	}
}

func isRequestAdmin(r *http.Request) bool {
	user, ok := authUserFromContext(r)
	return ok && isAdminUser(user)
}

type emailDuplicateSource struct {
	Slug            string
	Sequence        string
	Title           string
	Subject         *string
	Preheader       *string
	SendTiming      *string
	Stage           string
	SortOrder       int
	Language        string
	Variant         string
	AdaptationKey   string
	AdaptationLabel string
	BodyText        *string
	OriginalHTML    string
	ReviewHTML      *string
	TemplateHTML    string
	TemplateHash    *string
	TemplateVersion *string
	EditableFields  []byte
}

type emailArchiveSnapshot struct {
	ID       string
	Slug     string
	Title    string
	Language string
	Variant  string
	Stage    string
}

func loadEmailForDuplicate(r *http.Request, dbpool *pgxpool.Pool, id string) (emailDuplicateSource, error) {
	var source emailDuplicateSource
	err := dbpool.QueryRow(r.Context(), `
		SELECT
			slug,
			sequence,
			title,
			subject,
			preheader,
			send_timing,
			stage,
			sort_order,
			language,
			variant,
			adaptation_key,
			adaptation_label,
			body_text,
			original_html,
			review_html,
			template_html,
			template_hash,
			template_version,
			editable_fields
		FROM emails
		WHERE id = $1
			AND archived_at IS NULL;
	`, id).Scan(
		&source.Slug,
		&source.Sequence,
		&source.Title,
		&source.Subject,
		&source.Preheader,
		&source.SendTiming,
		&source.Stage,
		&source.SortOrder,
		&source.Language,
		&source.Variant,
		&source.AdaptationKey,
		&source.AdaptationLabel,
		&source.BodyText,
		&source.OriginalHTML,
		&source.ReviewHTML,
		&source.TemplateHTML,
		&source.TemplateHash,
		&source.TemplateVersion,
		&source.EditableFields,
	)

	return source, err
}

type duplicateEmailInsert struct {
	Slug            string
	Sequence        string
	Title           string
	Subject         *string
	Preheader       *string
	SendTiming      *string
	Stage           string
	SortOrder       int
	Language        string
	Variant         string
	AdaptationKey   string
	AdaptationLabel string
	BodyText        *string
	ContentParts    []byte
	OriginalHTML    string
	ReviewHTML      *string
	TemplateHTML    string
	TemplateHash    *string
	TemplateVersion *string
	EditableFields  []byte
}

func insertDuplicatedEmail(r *http.Request, db emailEventExecutor, email duplicateEmailInsert) (EmailDetail, error) {
	var created EmailDetail
	var editableFields []byte

	err := db.QueryRow(r.Context(), `
		INSERT INTO emails (
			slug,
			sequence,
			title,
			subject,
			preheader,
			send_timing,
			stage,
			sort_order,
			language,
			variant,
			adaptation_key,
			adaptation_label,
			body_text,
			content_parts,
			original_html,
			review_html,
			template_html,
			template_hash,
			template_version,
			editable_fields
		)
		VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14::jsonb, $15, $16, $17, $18, $19, $20::jsonb)
		RETURNING
			id,
			slug,
			sequence,
			title,
			subject,
			preheader,
			send_timing,
			stage,
			sort_order,
			language,
			variant,
			adaptation_key,
			adaptation_label,
			0 AS open_comment_count,
			original_html,
			review_html,
			template_html,
			template_hash,
			template_version,
			editable_fields;
	`, email.Slug, email.Sequence, email.Title, email.Subject, email.Preheader, email.SendTiming, email.Stage, email.SortOrder, email.Language, email.Variant, email.AdaptationKey, email.AdaptationLabel, email.BodyText, email.ContentParts, email.OriginalHTML, email.ReviewHTML, email.TemplateHTML, email.TemplateHash, email.TemplateVersion, email.EditableFields).Scan(
		&created.ID,
		&created.Slug,
		&created.Sequence,
		&created.Title,
		&created.Subject,
		&created.Preheader,
		&created.SendTiming,
		&created.Stage,
		&created.SortOrder,
		&created.Language,
		&created.Variant,
		&created.AdaptationKey,
		&created.AdaptationLabel,
		&created.OpenCommentCount,
		&created.OriginalHTML,
		&created.ReviewHTML,
		&created.TemplateHTML,
		&created.TemplateHash,
		&created.TemplateVersion,
		&editableFields,
	)
	if err != nil {
		return EmailDetail{}, err
	}

	created.EditableFields = json.RawMessage(editableFields)
	return created, nil
}

func buildEmailUpdateChanges(
	currentTitle string,
	currentSubject *string,
	currentPreheader *string,
	currentEditableFieldsJSON []byte,
	nextTitle string,
	nextSubject *string,
	nextPreheader *string,
	nextEditableFields emailedit.EditableFields,
) (map[string]any, error) {
	changes := map[string]any{}
	addStringChange(changes, "title", &currentTitle, &nextTitle)
	addStringChange(changes, "subject", currentSubject, nextSubject)
	addStringChange(changes, "preheader", currentPreheader, nextPreheader)

	currentFields := emailedit.EditableFields{}
	if len(currentEditableFieldsJSON) > 0 {
		if err := json.Unmarshal(currentEditableFieldsJSON, &currentFields); err != nil {
			return nil, err
		}
	}

	fieldChanges := map[string]any{}
	seen := map[string]bool{}
	for key, currentField := range currentFields {
		nextField, ok := nextEditableFields[key]
		seen[key] = true
		if !ok {
			fieldChanges[key] = map[string]any{
				"before": currentField,
				"after":  nil,
			}
			continue
		}
		if !reflect.DeepEqual(currentField, nextField) {
			fieldChanges[key] = map[string]any{
				"before": currentField,
				"after":  nextField,
			}
		}
	}
	for key, nextField := range nextEditableFields {
		if seen[key] {
			continue
		}
		fieldChanges[key] = map[string]any{
			"before": nil,
			"after":  nextField,
		}
	}
	if len(fieldChanges) > 0 {
		changes["editable_fields"] = fieldChanges
	}

	return changes, nil
}

func addStringChange(changes map[string]any, key string, before *string, after *string) {
	if stringFromPointer(before) == stringFromPointer(after) {
		return
	}
	changes[key] = map[string]any{
		"before": before,
		"after":  after,
	}
}

func changedCommentAnchorTexts(
	templateHTML string,
	renderedHTML string,
	currentTitle string,
	currentSubject *string,
	currentPreheader *string,
	currentEditableFieldsJSON []byte,
	nextTitle string,
	nextSubject *string,
	nextPreheader *string,
	nextEditableFields emailedit.EditableFields,
) (map[string]string, error) {
	currentFields := emailedit.EditableFields{}
	if len(currentEditableFieldsJSON) > 0 {
		if err := json.Unmarshal(currentEditableFieldsJSON, &currentFields); err != nil {
			return nil, err
		}
	}

	textFieldBlocks, err := editableTextFieldReviewBlocks(templateHTML)
	if err != nil {
		return nil, err
	}

	changedBlocks := map[string]bool{}
	for key, reviewBlock := range textFieldBlocks {
		currentField, currentOK := currentFields[key]
		nextField, nextOK := nextEditableFields[key]
		if !nextOK || nextField.Type != emailedit.FieldTypeText {
			continue
		}
		if !currentOK || currentField.Type != emailedit.FieldTypeText || !reflect.DeepEqual(currentField.Value, nextField.Value) {
			changedBlocks[reviewBlock] = true
		}
	}

	anchorTexts := map[string]string{}
	if len(changedBlocks) > 0 {
		renderedBlockTexts, err := reviewBlockTexts(renderedHTML, changedBlocks)
		if err != nil {
			return nil, err
		}
		for reviewBlock := range changedBlocks {
			if text, ok := renderedBlockTexts[reviewBlock]; ok {
				anchorTexts[reviewBlock] = text
			}
		}
	}

	if stringFromPointer(currentSubject) != stringFromPointer(nextSubject) {
		anchorTexts["subject"] = stringFromPointer(nextSubject)
	} else if currentSubject == nil && nextSubject == nil && currentTitle != nextTitle {
		anchorTexts["subject"] = nextTitle
	}
	if stringFromPointer(currentPreheader) != stringFromPointer(nextPreheader) {
		anchorTexts["preheader"] = stringFromPointer(nextPreheader)
	}

	return anchorTexts, nil
}

func resetCommentAnchorsForReviewBlocks(
	ctx context.Context,
	db emailEventExecutor,
	emailID string,
	anchorTexts map[string]string,
) error {
	for reviewBlock, text := range anchorTexts {
		_, err := db.Exec(ctx, `
			UPDATE comments
			SET selected_text = $3,
				start_offset = 0,
				end_offset = $4
			WHERE email_id = $1
				AND review_block = $2;
		`, emailID, reviewBlock, text, jsStringLength(text))
		if err != nil {
			return err
		}
	}

	return nil
}

func editableTextFieldReviewBlocks(templateHTML string) (map[string]string, error) {
	root, err := xhtml.Parse(strings.NewReader(templateHTML))
	if err != nil {
		return nil, err
	}

	blocks := map[string]string{}
	collectEditableTextFieldReviewBlocks(root, "", blocks)
	return blocks, nil
}

func collectEditableTextFieldReviewBlocks(node *xhtml.Node, currentReviewBlock string, blocks map[string]string) {
	if node.Type == xhtml.ElementNode {
		if reviewBlock := htmlAttrValue(node, "data-review-block"); reviewBlock != "" {
			currentReviewBlock = reviewBlock
		}
		if key := htmlAttrValue(node, "data-edit-text"); key != "" && currentReviewBlock != "" {
			blocks[key] = currentReviewBlock
		}
	}

	for child := node.FirstChild; child != nil; child = child.NextSibling {
		collectEditableTextFieldReviewBlocks(child, currentReviewBlock, blocks)
	}
}

func reviewBlockTexts(renderedHTML string, targetBlocks map[string]bool) (map[string]string, error) {
	root, err := xhtml.Parse(strings.NewReader(renderedHTML))
	if err != nil {
		return nil, err
	}

	texts := map[string]string{}
	collectReviewBlockTexts(root, targetBlocks, texts)
	return texts, nil
}

func collectReviewBlockTexts(node *xhtml.Node, targetBlocks map[string]bool, texts map[string]string) {
	if node.Type == xhtml.ElementNode {
		reviewBlock := htmlAttrValue(node, "data-review-block")
		if targetBlocks[reviewBlock] {
			texts[reviewBlock] = strings.TrimSpace(htmlTextContent(node))
		}
	}

	for child := node.FirstChild; child != nil; child = child.NextSibling {
		collectReviewBlockTexts(child, targetBlocks, texts)
	}
}

func htmlAttrValue(node *xhtml.Node, key string) string {
	for _, attr := range node.Attr {
		if strings.EqualFold(attr.Key, key) {
			return attr.Val
		}
	}

	return ""
}

func htmlTextContent(node *xhtml.Node) string {
	if node.Type == xhtml.TextNode {
		return node.Data
	}

	var builder strings.Builder
	for child := node.FirstChild; child != nil; child = child.NextSibling {
		builder.WriteString(htmlTextContent(child))
	}
	return builder.String()
}

func jsStringLength(value string) int {
	return len(utf16.Encode([]rune(value)))
}

func duplicateEmailSlug(sourceSlug string, sourceLanguage string, targetLanguage string, targetVariant string) string {
	base := strings.Split(sourceSlug, "--")[0]
	base = strings.TrimSuffix(base, "-old")
	sourceLanguage = strings.ToLower(strings.TrimSpace(sourceLanguage))
	if sourceLanguage != "" {
		base = strings.TrimSuffix(base, "-"+sourceLanguage)
	}

	slug := base + "-" + targetLanguage
	if targetVariant == "old" {
		slug += "-old"
	}

	return slug
}

func adaptationEmailSlug(sourceSlug string, sourceAdaptationKey string, targetAdaptationKey string) string {
	base := strings.TrimSuffix(sourceSlug, "--"+sourceAdaptationKey)
	return base + "--" + targetAdaptationKey
}

func normalizeAdaptationKey(label string) string {
	key := strings.ToLower(strings.TrimSpace(label))
	key = strings.Map(func(r rune) rune {
		switch {
		case r >= 'a' && r <= 'z':
			return r
		case r >= '0' && r <= '9':
			return r
		case r == ' ' || r == '_' || r == '-':
			return '-'
		default:
			return -1
		}
	}, key)
	return strings.Trim(strings.Join(strings.FieldsFunc(key, func(r rune) bool { return r == '-' }), "-"), "-")
}

func isEmailSlugConflict(err error) bool {
	var pgErr *pgconn.PgError
	return errors.As(err, &pgErr) &&
		pgErr.Code == "23505" &&
		pgErr.ConstraintName == "emails_slug_unique"
}

func isEmailCreationConflict(err error) bool {
	var pgErr *pgconn.PgError
	return errors.As(err, &pgErr) &&
		pgErr.Code == "23505" &&
		(pgErr.ConstraintName == "emails_slug_unique" || pgErr.ConstraintName == "emails_active_adaptation_unique")
}

func stringFromPointer(value *string) string {
	if value == nil {
		return ""
	}

	return *value
}
