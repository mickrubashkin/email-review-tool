#!/bin/sh
set -ex

echo "Running migrations"
goose -dir /app/db/migrations postgres "$DATABASE_URL" up

echo "Running seed"
/app/seed

echo "Starting server"
exec /app/server
