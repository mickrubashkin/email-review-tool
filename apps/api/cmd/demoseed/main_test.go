package main

import (
	"os"
	"strings"
	"testing"
)

func TestValidateDemoSeedEnvRequiresEnabled(t *testing.T) {
	t.Setenv("DEMO_SEED_ENABLED", "")

	err := validateDemoSeedEnv(false)
	if err == nil || !strings.Contains(err.Error(), "DEMO_SEED_ENABLED=true") {
		t.Fatalf("expected demo seed enabled error, got %v", err)
	}
}

func TestValidateDemoSeedEnvRequiresResetConfirmation(t *testing.T) {
	t.Setenv("DEMO_SEED_ENABLED", "true")
	t.Setenv("DEMO_RESET_CONFIRM", "")

	err := validateDemoSeedEnv(true)
	if err == nil || !strings.Contains(err.Error(), "DEMO_RESET_CONFIRM=demo") {
		t.Fatalf("expected reset confirmation error, got %v", err)
	}
}

func TestValidateDemoSeedEnvAllowsSeedWithoutResetConfirmation(t *testing.T) {
	t.Setenv("DEMO_SEED_ENABLED", "true")
	t.Setenv("DEMO_RESET_CONFIRM", "")

	if err := validateDemoSeedEnv(false); err != nil {
		t.Fatalf("expected seed without reset confirmation to pass, got %v", err)
	}
}

func TestDemoEmailSlugUsesDemoBoardPrefix(t *testing.T) {
	slug := demoEmailSlug("activation", "complete-setup", "en")
	if slug != "demo-onboarding-activation-complete-setup-en" {
		t.Fatalf("unexpected demo slug %q", slug)
	}
	if strings.HasPrefix(slug, "onboarding-") {
		t.Fatalf("demo slug must not collide with production seed prefix: %q", slug)
	}
}

func TestLoadDemoEmailsParseReviewAndEditableFields(t *testing.T) {
	root, err := findDemoFixtureDir()
	if err != nil {
		t.Fatal(err)
	}

	emails, err := loadDemoEmails(root)
	if err != nil {
		t.Fatal(err)
	}
	if len(emails) < 4 {
		t.Fatalf("expected at least 4 demo fixtures, got %d", len(emails))
	}

	foundHero := false
	for _, email := range emails {
		if !strings.HasPrefix(email.Slug, demoBoardKey+"-") {
			t.Fatalf("expected demo slug prefix, got %q", email.Slug)
		}
		if !strings.Contains(email.ReviewHTML, "data-review-block") {
			t.Fatalf("expected review blocks in %s", email.Slug)
		}
		if len(email.EditableFields) == 0 || string(email.EditableFields) == "{}" {
			t.Fatalf("expected editable fields in %s", email.Slug)
		}
		if email.Slug == demoEmailSlug("activation", "complete-setup", "en") {
			foundHero = true
		}
	}
	if !foundHero {
		t.Fatal("expected activation complete-setup hero fixture")
	}
}

func TestFindDemoFixtureDirCanUseEnvOverride(t *testing.T) {
	tempDir := t.TempDir()
	t.Setenv(demoFixtureRootEnv, tempDir)

	dir, err := findDemoFixtureDir()
	if err != nil {
		t.Fatal(err)
	}
	if dir != tempDir {
		t.Fatalf("expected env fixture dir %q, got %q", tempDir, dir)
	}
}

func TestFindDemoFixtureDirEnvOverrideDoesNotNeedExistingDefault(t *testing.T) {
	tempDir := t.TempDir()
	t.Setenv(demoFixtureRootEnv, tempDir)

	if _, err := os.Stat(tempDir); err != nil {
		t.Fatal(err)
	}
	if _, err := findDemoFixtureDir(); err != nil {
		t.Fatal(err)
	}
}
