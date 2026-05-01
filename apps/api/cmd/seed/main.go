package main

import (
	"context"
	"encoding/json"
	"fmt"
	"io/fs"
	"os"
	"path/filepath"
	"strconv"
	"strings"
	"unicode"

	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/joho/godotenv"
)

const (
	sequence = "onboarding"
	seedDir  = "../../db/seeds/emails"
)

type seedEmail struct {
	Slug         string
	Sequence     string
	Title        string
	Subject      *string
	Preheader    *string
	SendTiming   *string
	Stage        string
	SortOrder    int
	Language     string
	OriginalHTML string
}

type seedEmailMeta struct {
	Title      *string `json:"title"`
	Subject    *string `json:"subject"`
	Preheader  *string `json:"preheader"`
	SendTiming *string `json:"send_timing"`
}

func main() {
	_ = godotenv.Load("../../.env")

	databaseURL := os.Getenv("DATABASE_URL")
	if databaseURL == "" {
		fmt.Fprintln(os.Stderr, "DATABASE_URL is required")
		os.Exit(1)
	}

	ctx := context.Background()
	dbpool, err := pgxpool.New(ctx, databaseURL)
	if err != nil {
		fmt.Fprintf(os.Stderr, "Unable to create connection pool: %v\n", err)
		os.Exit(1)
	}
	defer dbpool.Close()

	if err := dbpool.Ping(ctx); err != nil {
		fmt.Fprintf(os.Stderr, "Unable to ping database: %v\n", err)
		os.Exit(1)
	}

	emails, err := loadSeedEmails(seedDir)
	if err != nil {
		fmt.Fprintf(os.Stderr, "Unable to load seed emails: %v\n", err)
		os.Exit(1)
	}

	for _, email := range emails {
		if err := upsertEmail(ctx, dbpool, email); err != nil {
			fmt.Fprintf(os.Stderr, "Unable to seed %s: %v\n", email.Slug, err)
			os.Exit(1)
		}
	}

	fmt.Printf("Seeded %d emails\n", len(emails))
}

func loadSeedEmails(root string) ([]seedEmail, error) {
	emails := []seedEmail{}

	metaByKey, err := loadSeedEmailMeta(root)
	if err != nil {
		return nil, err
	}

	err = filepath.WalkDir(root, func(path string, entry fs.DirEntry, err error) error {
		if err != nil {
			return err
		}

		if entry.IsDir() || filepath.Ext(path) != ".html" {
			return nil
		}

		email, err := parseSeedEmail(root, path, metaByKey)
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

func loadSeedEmailMeta(root string) (map[string]seedEmailMeta, error) {
	metaPath := filepath.Join(root, "meta.json")
	metaBytes, err := os.ReadFile(metaPath)
	if err != nil {
		if os.IsNotExist(err) {
			return map[string]seedEmailMeta{}, nil
		}

		return nil, err
	}

	metaByKey := map[string]seedEmailMeta{}
	if err := json.Unmarshal(metaBytes, &metaByKey); err != nil {
		return nil, err
	}

	return metaByKey, nil
}

func parseSeedEmail(root string, path string, metaByKey map[string]seedEmailMeta) (seedEmail, error) {
	relativePath, err := filepath.Rel(root, path)
	if err != nil {
		return seedEmail{}, err
	}

	parts := strings.Split(filepath.ToSlash(relativePath), "/")
	if len(parts) != 3 {
		return seedEmail{}, fmt.Errorf("expected {stage}/{email}/{language}.html, got %s", relativePath)
	}

	stageOrder, stage := parseOrderedName(parts[0])
	emailOrder, emailName := parseOrderedName(parts[1])
	language := strings.TrimSuffix(parts[2], filepath.Ext(parts[2]))
	metaKey := strings.Join([]string{sequence, stage, emailName, language}, "/")
	emailMeta := metaByKey[metaKey]
	title := titleFromName(emailName)
	if emailMeta.Title != nil {
		title = *emailMeta.Title
	}

	htmlBytes, err := os.ReadFile(path)
	if err != nil {
		return seedEmail{}, err
	}

	return seedEmail{
		Slug:         strings.Join([]string{sequence, stage, emailName, language}, "-"),
		Sequence:     sequence,
		Title:        title,
		Subject:      emailMeta.Subject,
		Preheader:    emailMeta.Preheader,
		SendTiming:   emailMeta.SendTiming,
		Stage:        stage,
		SortOrder:    stageOrder*100 + emailOrder,
		Language:     language,
		OriginalHTML: string(htmlBytes),
	}, nil
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

func titleFromName(name string) string {
	words := strings.FieldsFunc(name, func(char rune) bool {
		return char == '-' || char == '_'
	})

	for i, word := range words {
		words[i] = capitalize(word)
	}

	return strings.Join(words, " ")
}

func capitalize(word string) string {
	if word == "" {
		return word
	}

	runes := []rune(word)
	runes[0] = unicode.ToUpper(runes[0])
	return string(runes)
}

func upsertEmail(ctx context.Context, dbpool *pgxpool.Pool, email seedEmail) error {
	_, err := dbpool.Exec(ctx, `
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
			original_html
		)
		VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
		ON CONFLICT (slug) DO UPDATE SET
			sequence = EXCLUDED.sequence,
			title = EXCLUDED.title,
			subject = EXCLUDED.subject,
			preheader = EXCLUDED.preheader,
			send_timing = EXCLUDED.send_timing,
			stage = EXCLUDED.stage,
			sort_order = EXCLUDED.sort_order,
			language = EXCLUDED.language,
			original_html = EXCLUDED.original_html,
			updated_at = now();
	`, email.Slug, email.Sequence, email.Title, email.Subject, email.Preheader, email.SendTiming, email.Stage, email.SortOrder, email.Language, email.OriginalHTML)

	return err
}
