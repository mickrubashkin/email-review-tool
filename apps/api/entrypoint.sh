#!/bin/sh
set -ex

echo "Running migrations"
migration_attempt=1
max_migration_attempts=12
until goose -dir /app/db/migrations postgres "$DATABASE_URL" up; do
  if [ "$migration_attempt" -ge "$max_migration_attempts" ]; then
    echo "Migrations failed after $migration_attempt attempts"
    exit 1
  fi

  echo "Migrations failed on attempt $migration_attempt; retrying in 5 seconds"
  migration_attempt=$((migration_attempt + 1))
  sleep 5
done

echo "Running seed"
/app/seed

echo "Starting server"
exec /app/server
