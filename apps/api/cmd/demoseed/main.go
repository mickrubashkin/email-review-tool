package main

import (
	"context"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"flag"
	"fmt"
	"io/fs"
	"os"
	"path/filepath"
	"strconv"
	"strings"
	"unicode"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/joho/godotenv"
	"github.com/mickrubashkin/email-review-tool/apps/api/internal/emailedit"
	"github.com/mickrubashkin/email-review-tool/apps/api/internal/emailreview"
	"github.com/mickrubashkin/email-review-tool/apps/api/internal/emailtext"
)

const (
	demoBoardKey       = "demo-onboarding"
	demoBoardName      = "Demo Onboarding Review"
	demoReviewerEmail  = "demo-reviewer@example.com"
	demoAdminEmail     = "demo-admin@example.com"
	demoFixtureRootEnv = "DEMO_EMAILS_DIR"
)

var demoStages = []string{"signup", "activation", "education", "conversion"}

var demoEmailMetaByName = map[string]demoEmailMeta{
	"welcome": {
		Title:      "Welcome",
		Subject:    "Welcome to Acme Cloud",
		Preheader:  "Start the generic onboarding flow.",
		SendTiming: "immediately",
	},
	"complete-setup": {
		Title:      "Complete Setup",
		Subject:    "Complete your setup in three minutes",
		Preheader:  "Finish the final setup steps to unlock the first value moment.",
		SendTiming: "1 day after signup",
	},
	"first-value": {
		Title:      "First Value",
		Subject:    "Find your first value moment",
		Preheader:  "Use the checklist to reach your first meaningful result.",
		SendTiming: "3 days after signup",
	},
	"upgrade-nudge": {
		Title:      "Upgrade Nudge",
		Subject:    "Ready for the next step",
		Preheader:  "Review the next workflow options when your team is ready.",
		SendTiming: "7 days after signup",
	},
}

type demoEmailMeta struct {
	Title      string
	Subject    string
	Preheader  string
	SendTiming string
}

type demoEmail struct {
	Slug           string
	Title          string
	Subject        string
	Preheader      string
	SendTiming     string
	Stage          string
	SortOrder      int
	Language       string
	Variant        string
	BodyText       string
	ContentParts   emailtext.ContentParts
	OriginalHTML   string
	ReviewHTML     string
	TemplateHTML   string
	TemplateHash   string
	EditableFields []byte
}

type demoActor struct {
	ID    string
	Email string
}

type demoSeedConfig struct {
	Reset bool
}

func main() {
	reset := flag.Bool("reset", false, "reset demo-owned data before seeding")
	flag.Parse()

	if err := runDemoSeed(demoSeedConfig{Reset: *reset}); err != nil {
		fmt.Fprintf(os.Stderr, "Unable to seed demo data: %v\n", err)
		os.Exit(1)
	}
}

func runDemoSeed(config demoSeedConfig) error {
	_ = godotenv.Load("../../.env")

	if err := validateDemoSeedEnv(config.Reset); err != nil {
		return err
	}

	databaseURL := os.Getenv("DATABASE_URL")
	if databaseURL == "" {
		return fmt.Errorf("DATABASE_URL is required")
	}

	ctx := context.Background()
	dbpool, err := pgxpool.New(ctx, databaseURL)
	if err != nil {
		return fmt.Errorf("create connection pool: %w", err)
	}
	defer dbpool.Close()

	if err := dbpool.Ping(ctx); err != nil {
		return fmt.Errorf("ping database: %w", err)
	}

	fixtureDir, err := findDemoFixtureDir()
	if err != nil {
		return err
	}
	emails, err := loadDemoEmails(fixtureDir)
	if err != nil {
		return err
	}
	if len(emails) == 0 {
		return fmt.Errorf("no demo email fixtures found in %s", fixtureDir)
	}

	tx, err := dbpool.Begin(ctx)
	if err != nil {
		return err
	}
	defer tx.Rollback(ctx)

	if config.Reset {
		if err := resetDemoData(ctx, tx); err != nil {
			return err
		}
	}

	admin, reviewer, err := ensureDemoUsers(ctx, tx)
	if err != nil {
		return err
	}
	boardID, err := ensureDemoBoard(ctx, tx)
	if err != nil {
		return err
	}
	if err := ensureDemoApprovalAreas(ctx, tx, boardID); err != nil {
		return err
	}

	emailIDs := map[string]string{}
	for _, email := range emails {
		emailID, err := upsertDemoEmail(ctx, tx, email)
		if err != nil {
			return fmt.Errorf("upsert %s: %w", email.Slug, err)
		}
		emailIDs[email.Slug] = emailID
		if err := ensureInitialVersion(ctx, tx, emailID, email); err != nil {
			return fmt.Errorf("ensure initial version for %s: %w", email.Slug, err)
		}
	}

	if err := seedDemoScenario(ctx, tx, emailIDs, admin, reviewer); err != nil {
		return err
	}

	if err := tx.Commit(ctx); err != nil {
		return err
	}

	fmt.Printf("Seeded demo board %q with %d emails\n", demoBoardKey, len(emails))
	return nil
}

func validateDemoSeedEnv(reset bool) error {
	if os.Getenv("DEMO_SEED_ENABLED") != "true" {
		return fmt.Errorf("DEMO_SEED_ENABLED=true is required")
	}
	if reset && os.Getenv("DEMO_RESET_CONFIRM") != "demo" {
		return fmt.Errorf("DEMO_RESET_CONFIRM=demo is required when using -reset")
	}
	return nil
}

func findDemoFixtureDir() (string, error) {
	if value := os.Getenv(demoFixtureRootEnv); value != "" {
		return value, nil
	}

	workingDir, err := os.Getwd()
	if err != nil {
		return "", err
	}

	for dir := workingDir; ; dir = filepath.Dir(dir) {
		candidate := filepath.Join(dir, "db", "seeds", "demo-emails")
		info, err := os.Stat(candidate)
		if err == nil && info.IsDir() {
			return candidate, nil
		}
		if err != nil && !os.IsNotExist(err) {
			return "", err
		}
		parent := filepath.Dir(dir)
		if parent == dir {
			break
		}
	}

	return "", fmt.Errorf("db/seeds/demo-emails was not found from %s or its parents", workingDir)
}

func loadDemoEmails(root string) ([]demoEmail, error) {
	emails := []demoEmail{}

	err := filepath.WalkDir(root, func(path string, entry fs.DirEntry, err error) error {
		if err != nil {
			return err
		}
		if entry.IsDir() || filepath.Ext(path) != ".html" {
			return nil
		}

		email, err := parseDemoEmail(root, path)
		if err != nil {
			return err
		}
		emails = append(emails, email)
		return nil
	})
	if err != nil {
		return nil, err
	}

	return emails, nil
}

func parseDemoEmail(root string, path string) (demoEmail, error) {
	relativePath, err := filepath.Rel(root, path)
	if err != nil {
		return demoEmail{}, err
	}
	parts := strings.Split(filepath.ToSlash(relativePath), "/")
	if len(parts) != 3 {
		return demoEmail{}, fmt.Errorf("expected {stage}/{email}/{language}.html, got %s", relativePath)
	}

	stageOrder, stage := parseOrderedName(parts[0])
	emailOrder, emailName := parseOrderedName(parts[1])
	language := strings.TrimSuffix(parts[2], filepath.Ext(parts[2]))
	meta, ok := demoEmailMetaByName[emailName]
	if !ok {
		return demoEmail{}, fmt.Errorf("missing demo metadata for %s", emailName)
	}

	htmlBytes, err := os.ReadFile(path)
	if err != nil {
		return demoEmail{}, err
	}
	originalHTML := string(htmlBytes)
	reviewHTML, err := emailreview.AddReviewBlocks(originalHTML)
	if err != nil {
		return demoEmail{}, fmt.Errorf("add review blocks to %s: %w", relativePath, err)
	}
	editableFields, err := emailedit.ExtractEditableFields(reviewHTML)
	if err != nil {
		return demoEmail{}, fmt.Errorf("extract editable fields from %s: %w", relativePath, err)
	}
	if len(editableFields) == 0 {
		return demoEmail{}, fmt.Errorf("demo fixture %s must expose editable fields", relativePath)
	}
	editableFieldsJSON, err := editableFields.JSON()
	if err != nil {
		return demoEmail{}, err
	}

	bodyText := emailtext.HTMLToText(originalHTML)

	return demoEmail{
		Slug:           demoEmailSlug(stage, emailName, language),
		Title:          meta.Title,
		Subject:        meta.Subject,
		Preheader:      meta.Preheader,
		SendTiming:     meta.SendTiming,
		Stage:          stage,
		SortOrder:      stageOrder*100 + emailOrder,
		Language:       language,
		Variant:        "v1",
		BodyText:       bodyText,
		ContentParts:   emailtext.ExtractContentParts(originalHTML, meta.Subject, meta.Preheader, bodyText),
		OriginalHTML:   originalHTML,
		ReviewHTML:     reviewHTML,
		TemplateHTML:   reviewHTML,
		TemplateHash:   contentHash(reviewHTML),
		EditableFields: editableFieldsJSON,
	}, nil
}

func demoEmailSlug(stage string, emailName string, language string) string {
	return strings.Join([]string{demoBoardKey, stage, emailName, language}, "-")
}

func resetDemoData(ctx context.Context, tx pgx.Tx) error {
	rows, err := tx.Query(ctx, `
		SELECT id::text
		FROM emails
		WHERE sequence = $1 OR slug LIKE $2;
	`, demoBoardKey, demoBoardKey+"-%")
	if err != nil {
		return err
	}
	emailIDs := []string{}
	for rows.Next() {
		var id string
		if err := rows.Scan(&id); err != nil {
			rows.Close()
			return err
		}
		emailIDs = append(emailIDs, id)
	}
	if err := rows.Err(); err != nil {
		rows.Close()
		return err
	}
	rows.Close()

	if len(emailIDs) > 0 {
		if _, err := tx.Exec(ctx, `
			DELETE FROM email_events
			WHERE email_id = ANY($1)
				OR email_slug LIKE $2;
		`, emailIDs, demoBoardKey+"-%"); err != nil {
			return err
		}
	} else {
		if _, err := tx.Exec(ctx, `DELETE FROM email_events WHERE email_slug LIKE $1;`, demoBoardKey+"-%"); err != nil {
			return err
		}
	}

	if _, err := tx.Exec(ctx, `
		DELETE FROM emails
		WHERE sequence = $1 OR slug LIKE $2;
	`, demoBoardKey, demoBoardKey+"-%"); err != nil {
		return err
	}
	if _, err := tx.Exec(ctx, `DELETE FROM boards WHERE key = $1;`, demoBoardKey); err != nil {
		return err
	}
	if _, err := tx.Exec(ctx, `
		DELETE FROM sessions
		USING users
		WHERE sessions.user_id = users.id
			AND users.email = ANY($1);
	`, []string{demoAdminEmail, demoReviewerEmail}); err != nil {
		return err
	}

	return nil
}

func ensureDemoUsers(ctx context.Context, tx pgx.Tx) (demoActor, demoActor, error) {
	adminID, err := upsertDemoUser(ctx, tx, demoAdminEmail, "admin")
	if err != nil {
		return demoActor{}, demoActor{}, err
	}
	reviewerID, err := upsertDemoUser(ctx, tx, demoReviewerEmail, "reviewer")
	if err != nil {
		return demoActor{}, demoActor{}, err
	}

	return demoActor{ID: adminID, Email: demoAdminEmail}, demoActor{ID: reviewerID, Email: demoReviewerEmail}, nil
}

func upsertDemoUser(ctx context.Context, tx pgx.Tx, email string, role string) (string, error) {
	var id string
	err := tx.QueryRow(ctx, `
		INSERT INTO users (email, role)
		VALUES ($1, $2)
		ON CONFLICT (email) DO UPDATE SET
			role = EXCLUDED.role,
			updated_at = now()
		RETURNING id::text;
	`, email, role).Scan(&id)
	return id, err
}

func ensureDemoBoard(ctx context.Context, tx pgx.Tx) (string, error) {
	stagesJSON, err := json.Marshal(demoStages)
	if err != nil {
		return "", err
	}

	var id string
	err = tx.QueryRow(ctx, `
		INSERT INTO boards (key, name, stages)
		VALUES ($1, $2, $3::jsonb)
		ON CONFLICT (key) DO UPDATE SET
			name = EXCLUDED.name,
			stages = EXCLUDED.stages,
			updated_at = now()
		RETURNING id::text;
	`, demoBoardKey, demoBoardName, stagesJSON).Scan(&id)
	return id, err
}

func ensureDemoApprovalAreas(ctx context.Context, tx pgx.Tx, boardID string) error {
	areas := []struct {
		Key       string
		Name      string
		Required  bool
		SortOrder int
	}{
		{"product", "Product", true, 10},
		{"brand", "Brand", true, 20},
		{"legal", "Legal", true, 30},
		{"crm-ops", "CRM ops", true, 40},
	}

	for _, area := range areas {
		var areaID string
		if err := tx.QueryRow(ctx, `
			INSERT INTO approval_areas (key, default_name)
			VALUES ($1, $2)
			ON CONFLICT (key) DO UPDATE SET
				default_name = EXCLUDED.default_name,
				updated_at = now()
			RETURNING id::text;
		`, area.Key, area.Name).Scan(&areaID); err != nil {
			return err
		}

		if _, err := tx.Exec(ctx, `
			INSERT INTO board_approval_areas (
				board_id,
				approval_area_id,
				name,
				required,
				sort_order,
				archived_at
			)
			VALUES ($1, $2, $3, $4, $5, NULL)
			ON CONFLICT (board_id, approval_area_id) DO UPDATE SET
				name = EXCLUDED.name,
				required = EXCLUDED.required,
				sort_order = EXCLUDED.sort_order,
				archived_at = NULL,
				updated_at = now();
		`, boardID, areaID, area.Name, area.Required, area.SortOrder); err != nil {
			return err
		}
	}

	return nil
}

func upsertDemoEmail(ctx context.Context, tx pgx.Tx, email demoEmail) (string, error) {
	contentPartsJSON, err := json.Marshal(email.ContentParts)
	if err != nil {
		return "", err
	}

	reviewStatus := "in_review"
	if email.Slug == demoEmailSlug("activation", "complete-setup", "en") {
		reviewStatus = "changes_requested"
	}
	if email.Slug == demoEmailSlug("conversion", "upgrade-nudge", "en") {
		reviewStatus = "production_approved"
	}

	var id string
	err = tx.QueryRow(ctx, `
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
			editable_fields,
			review_status
		)
		VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, 'default', 'Default', $11, $12::jsonb, $13, $14, $15, $16, $17::jsonb, $18)
		ON CONFLICT (slug) DO UPDATE SET
			sequence = EXCLUDED.sequence,
			title = EXCLUDED.title,
			subject = EXCLUDED.subject,
			preheader = EXCLUDED.preheader,
			send_timing = EXCLUDED.send_timing,
			stage = EXCLUDED.stage,
			sort_order = EXCLUDED.sort_order,
			language = EXCLUDED.language,
			variant = EXCLUDED.variant,
			adaptation_key = EXCLUDED.adaptation_key,
			adaptation_label = EXCLUDED.adaptation_label,
			body_text = EXCLUDED.body_text,
			content_parts = EXCLUDED.content_parts,
			original_html = EXCLUDED.original_html,
			review_html = EXCLUDED.review_html,
			template_html = EXCLUDED.template_html,
			template_hash = EXCLUDED.template_hash,
			editable_fields = EXCLUDED.editable_fields,
			review_status = EXCLUDED.review_status,
			archived_at = NULL,
			archived_by = NULL,
			updated_at = now()
		RETURNING id::text;
	`, email.Slug, demoBoardKey, email.Title, email.Subject, email.Preheader, email.SendTiming, email.Stage, email.SortOrder, email.Language, email.Variant, email.BodyText, contentPartsJSON, email.OriginalHTML, email.ReviewHTML, email.TemplateHTML, email.TemplateHash, email.EditableFields, reviewStatus).Scan(&id)

	return id, err
}

func ensureInitialVersion(ctx context.Context, tx pgx.Tx, emailID string, email demoEmail) error {
	_, err := tx.Exec(ctx, `
		INSERT INTO email_versions (
			email_id,
			version_number,
			created_by_email,
			source,
			title,
			subject,
			preheader,
			original_html,
			template_html,
			editable_fields
		)
		VALUES ($1, 1, 'demo-seed', 'initial', $2, $3, $4, $5, $6, $7::jsonb)
		ON CONFLICT (email_id, version_number) DO UPDATE SET
			title = EXCLUDED.title,
			subject = EXCLUDED.subject,
			preheader = EXCLUDED.preheader,
			original_html = EXCLUDED.original_html,
			template_html = EXCLUDED.template_html,
			editable_fields = EXCLUDED.editable_fields;
	`, emailID, email.Title, email.Subject, email.Preheader, email.OriginalHTML, email.TemplateHTML, email.EditableFields)
	return err
}

func seedDemoScenario(ctx context.Context, tx pgx.Tx, emailIDs map[string]string, admin demoActor, reviewer demoActor) error {
	heroSlug := demoEmailSlug("activation", "complete-setup", "en")
	handoffSlug := demoEmailSlug("conversion", "upgrade-nudge", "en")

	heroID, ok := emailIDs[heroSlug]
	if !ok {
		return fmt.Errorf("hero email %s was not seeded", heroSlug)
	}
	handoffID, ok := emailIDs[handoffSlug]
	if !ok {
		return fmt.Errorf("handoff email %s was not seeded", handoffSlug)
	}

	if err := ensureDemoComment(ctx, tx, heroID, reviewer, demoComment{
		ReviewBlock:  "risk_copy",
		SelectedText: "reviewable copy",
		StartOffset:  52,
		EndOffset:    67,
		Body:         "Blocking: this paragraph needs a clearer user benefit before approval.",
		Status:       "open",
		Severity:     "blocking",
	}); err != nil {
		return err
	}
	if err := ensureDemoComment(ctx, tx, heroID, reviewer, demoComment{
		ReviewBlock:  "primary_cta",
		SelectedText: "Complete setup",
		StartOffset:  0,
		EndOffset:    14,
		Body:         "Resolved: CTA wording is specific enough for the activation step.",
		Status:       "resolved",
		Severity:     "suggestion",
		ResolvedBy:   admin.ID,
	}); err != nil {
		return err
	}

	if err := ensureDemoAreaApprovals(ctx, tx, heroID, admin, map[string]string{
		"product": "approved",
		"brand":   "stale",
		"legal":   "pending",
		"crm-ops": "pending",
	}); err != nil {
		return err
	}
	if err := ensureDemoAreaApprovals(ctx, tx, handoffID, admin, map[string]string{
		"product": "approved",
		"brand":   "approved",
		"legal":   "approved",
		"crm-ops": "approved",
	}); err != nil {
		return err
	}

	heroTitle := "Complete Setup"
	handoffTitle := "Upgrade Nudge"
	events := []demoEvent{
		{
			Key:        "hero-comment-created",
			Actor:      reviewer,
			Action:     "comment_created",
			EmailID:    heroID,
			EmailSlug:  heroSlug,
			EmailTitle: heroTitle,
			Metadata: map[string]any{
				"review_block": "risk_copy",
				"severity":     "blocking",
			},
			Changes: map[string]any{},
		},
		{
			Key:        "hero-brand-stale",
			Actor:      admin,
			Action:     "email_area_approval_updated",
			EmailID:    heroID,
			EmailSlug:  heroSlug,
			EmailTitle: heroTitle,
			Metadata: map[string]any{
				"area":   "brand",
				"status": "stale",
				"reason": "approval_stale_after_edit",
			},
			Changes: map[string]any{
				"area_approval_status": map[string]any{"before": "approved", "after": "stale"},
			},
		},
		{
			Key:        "hero-status-changes-requested",
			Actor:      admin,
			Action:     "email_review_status_updated",
			EmailID:    heroID,
			EmailSlug:  heroSlug,
			EmailTitle: heroTitle,
			Metadata: map[string]any{
				"reason": "approval_stale_after_edit",
			},
			Changes: map[string]any{
				"review_status": map[string]any{"before": "approved", "after": "changes_requested"},
			},
		},
		{
			Key:        "handoff-production-approved",
			Actor:      admin,
			Action:     "email_review_status_updated",
			EmailID:    handoffID,
			EmailSlug:  handoffSlug,
			EmailTitle: handoffTitle,
			Metadata: map[string]any{
				"reason": "demo_handoff_ready",
			},
			Changes: map[string]any{
				"review_status": map[string]any{"before": "approved", "after": "production_approved"},
			},
		},
	}

	for _, event := range events {
		if err := insertDemoEventIfMissing(ctx, tx, event); err != nil {
			return err
		}
	}

	return nil
}

type demoComment struct {
	ReviewBlock  string
	SelectedText string
	StartOffset  int
	EndOffset    int
	Body         string
	Status       string
	Severity     string
	ResolvedBy   string
}

func ensureDemoComment(ctx context.Context, tx pgx.Tx, emailID string, actor demoActor, comment demoComment) error {
	var existingID string
	err := tx.QueryRow(ctx, `
		SELECT id::text
		FROM comments
		WHERE email_id = $1
			AND review_block = $2
			AND body = $3
		LIMIT 1;
	`, emailID, comment.ReviewBlock, comment.Body).Scan(&existingID)
	if err != nil && err != pgx.ErrNoRows {
		return err
	}
	if err == nil {
		return nil
	}

	resolvedBy := any(nil)
	if comment.Status == "resolved" {
		resolvedBy = comment.ResolvedBy
	}

	var commentID string
	if comment.Status == "resolved" {
		err = tx.QueryRow(ctx, `
			INSERT INTO comments (
				email_id,
				user_id,
				review_block,
				selected_text,
				start_offset,
				end_offset,
				body,
				status,
				severity,
				resolved_by,
				resolved_at
			)
			VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, now())
			RETURNING id::text;
		`, emailID, actor.ID, comment.ReviewBlock, comment.SelectedText, comment.StartOffset, comment.EndOffset, comment.Body, comment.Status, comment.Severity, resolvedBy).Scan(&commentID)
	} else {
		err = tx.QueryRow(ctx, `
			INSERT INTO comments (
				email_id,
				user_id,
				review_block,
				selected_text,
				start_offset,
				end_offset,
				body,
				status,
				severity,
				resolved_by,
				resolved_at
			)
			VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, NULL, NULL)
			RETURNING id::text;
		`, emailID, actor.ID, comment.ReviewBlock, comment.SelectedText, comment.StartOffset, comment.EndOffset, comment.Body, comment.Status, comment.Severity).Scan(&commentID)
	}
	if err != nil {
		return err
	}

	_, err = tx.Exec(ctx, `
		INSERT INTO comment_messages (comment_id, user_id, body)
		VALUES ($1, $2, $3);
	`, commentID, actor.ID, comment.Body)
	return err
}

func ensureDemoAreaApprovals(ctx context.Context, tx pgx.Tx, emailID string, actor demoActor, statuses map[string]string) error {
	currentHash, err := emailApprovalSnapshotHash(ctx, tx, emailID)
	if err != nil {
		return err
	}
	for areaKey, status := range statuses {
		var boardApprovalAreaID string
		err := tx.QueryRow(ctx, `
			SELECT board_approval_areas.id::text
			FROM emails
			JOIN boards ON boards.key = emails.sequence
			JOIN board_approval_areas ON board_approval_areas.board_id = boards.id
				AND board_approval_areas.archived_at IS NULL
			JOIN approval_areas ON approval_areas.id = board_approval_areas.approval_area_id
			WHERE emails.id = $1
				AND approval_areas.key = $2;
		`, emailID, areaKey).Scan(&boardApprovalAreaID)
		if err != nil {
			return err
		}

		contentSnapshotHash := currentHash
		decidedAt := any(nil)
		decidedByUserID := any(nil)
		decidedByEmail := any(nil)
		decisionNote := any(nil)
		if status == "approved" || status == "stale" || status == "changes_requested" {
			decidedAt = "now()"
			decidedByUserID = actor.ID
			decidedByEmail = actor.Email
			decisionNote = demoDecisionNote(areaKey, status)
		}
		if status == "stale" {
			contentSnapshotHash = strings.Repeat("0", 64)
		}

		if decidedAt == nil {
			_, err = tx.Exec(ctx, `
				INSERT INTO email_area_approvals (
					email_id,
					board_approval_area_id,
					status,
					decided_by_user_id,
					decided_by_email,
					decision_note,
					content_snapshot_hash,
					decided_at
				)
				VALUES ($1, $2, $3, NULL, NULL, NULL, NULL, NULL)
				ON CONFLICT (email_id, board_approval_area_id) DO UPDATE SET
					status = EXCLUDED.status,
					decided_by_user_id = EXCLUDED.decided_by_user_id,
					decided_by_email = EXCLUDED.decided_by_email,
					decision_note = EXCLUDED.decision_note,
					content_snapshot_hash = EXCLUDED.content_snapshot_hash,
					decided_at = EXCLUDED.decided_at,
					updated_at = now();
			`, emailID, boardApprovalAreaID, status)
		} else {
			_, err = tx.Exec(ctx, `
				INSERT INTO email_area_approvals (
					email_id,
					board_approval_area_id,
					status,
					decided_by_user_id,
					decided_by_email,
					decision_note,
					content_snapshot_hash,
					decided_at
				)
				VALUES ($1, $2, $3, $4, $5, $6, $7, now())
				ON CONFLICT (email_id, board_approval_area_id) DO UPDATE SET
					status = EXCLUDED.status,
					decided_by_user_id = EXCLUDED.decided_by_user_id,
					decided_by_email = EXCLUDED.decided_by_email,
					decision_note = EXCLUDED.decision_note,
					content_snapshot_hash = EXCLUDED.content_snapshot_hash,
					decided_at = EXCLUDED.decided_at,
					updated_at = now();
			`, emailID, boardApprovalAreaID, status, decidedByUserID, decidedByEmail, decisionNote, contentSnapshotHash)
		}
		if err != nil {
			return err
		}
	}

	return nil
}

func demoDecisionNote(areaKey string, status string) string {
	if status == "stale" {
		return "Demo approval is stale after a content edit."
	}
	return fmt.Sprintf("Demo %s approval is ready.", areaKey)
}

func emailApprovalSnapshotHash(ctx context.Context, tx pgx.Tx, emailID string) (string, error) {
	var title string
	var subject *string
	var preheader *string
	var templateHash *string
	var templateHTML string
	var editableFieldsText string
	err := tx.QueryRow(ctx, `
		SELECT title, subject, preheader, template_hash, template_html, editable_fields::text
		FROM emails
		WHERE id = $1;
	`, emailID).Scan(&title, &subject, &preheader, &templateHash, &templateHTML, &editableFieldsText)
	if err != nil {
		return "", err
	}

	templateFingerprint := stringFromPointer(templateHash)
	if templateFingerprint == "" {
		templateFingerprint = contentHash(templateHTML)
	}
	editableFieldsHash := contentHash(editableFieldsText)
	return contentHash(strings.Join([]string{
		"approval-snapshot-v1",
		title,
		stringFromPointer(subject),
		stringFromPointer(preheader),
		templateFingerprint,
		editableFieldsHash,
	}, "\x00")), nil
}

type demoEvent struct {
	Key        string
	Actor      demoActor
	Action     string
	EmailID    string
	EmailSlug  string
	EmailTitle string
	Metadata   map[string]any
	Changes    map[string]any
}

func insertDemoEventIfMissing(ctx context.Context, tx pgx.Tx, event demoEvent) error {
	var exists bool
	err := tx.QueryRow(ctx, `
		SELECT EXISTS (
			SELECT 1
			FROM email_events
			WHERE metadata->>'demo_event_key' = $1
				AND email_slug = $2
		);
	`, event.Key, event.EmailSlug).Scan(&exists)
	if err != nil {
		return err
	}
	if exists {
		return nil
	}

	metadata := map[string]any{"demo_event_key": event.Key}
	for key, value := range event.Metadata {
		metadata[key] = value
	}
	metadataJSON, err := json.Marshal(metadata)
	if err != nil {
		return err
	}
	changesJSON, err := json.Marshal(event.Changes)
	if err != nil {
		return err
	}

	_, err = tx.Exec(ctx, `
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
		VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb, $8::jsonb);
	`, event.Actor.ID, event.Actor.Email, event.Action, event.EmailID, event.EmailSlug, event.EmailTitle, metadataJSON, changesJSON)
	return err
}

func parseOrderedName(name string) (int, string) {
	for i, char := range name {
		if !unicode.IsDigit(char) {
			if i > 0 && (char == '-' || char == '_') {
				order, err := strconv.Atoi(name[:i])
				if err == nil {
					return order, name[i+1:]
				}
			}

			return 0, name
		}
	}

	return 0, name
}

func stringFromPointer(value *string) string {
	if value == nil {
		return ""
	}
	return *value
}

func contentHash(value string) string {
	hash := sha256.Sum256([]byte(value))
	return hex.EncodeToString(hash[:])
}
