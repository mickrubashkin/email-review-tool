FROM golang:1.25-bookworm AS builder
WORKDIR /repo

COPY . .
WORKDIR /repo/apps/api

RUN go mod download
RUN GOBIN=/out go install github.com/pressly/goose/v3/cmd/goose@latest

RUN CGO_ENABLED=0 GOOS=linux go build -o /out/server ./cmd/server
RUN CGO_ENABLED=0 GOOS=linux go build -o /out/seed ./cmd/seed

FROM debian:bookworm-slim
WORKDIR /app

RUN apt-get update && apt-get install -y ca-certificates && rm -rf /var/lib/apt/lists/*

COPY --from=builder /out/server /app/server
COPY --from=builder /out/seed /app/seed
COPY --from=builder /out/goose /usr/local/bin/goose
COPY db /app/db
COPY apps/api/entrypoint.sh /app/entrypoint.sh

RUN chmod +x /app/entrypoint.sh

ENV PORT=8080
ENV SEED_EMAILS_DIR=/app/db/seeds/emails
EXPOSE 8080

CMD ["/app/entrypoint.sh"]
