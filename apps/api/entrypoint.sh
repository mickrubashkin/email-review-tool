#!/bin/sh
set -e

goose -dir /app/db/migrations postgres "$DATABASE_URL" up
/app/seed
exec /app/server
