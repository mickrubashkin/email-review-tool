# agents.md

## Project

Email Review Tool

---

## MVP

- Upload email (`email.html`)
- View email
- Select text
- Add comment
- Resolve comment
- Discussion (chat)
- Realtime updates
- Download / copy HTML

No email editing.

---

## Stack

Frontend: React (Vite) + Mantine + TanStack Query
Backend: Go (Chi)
DB: PostgreSQL
Realtime: WebSocket

---

## Core rules

- Backend = source of truth
- Save to DB first, then send realtime events
- Keep original HTML unchanged
- Comments attach to `data-review-block` + text range

---

## Email Import

- Emails are uploaded as HTML files
- Metadata is provided via UI (title, subject, etc.)
- HTML must contain `data-review-block` attributes
- Original HTML is used for preview and export

---

## Review blocks

Only meaningful email sections should have `data-review-block`.

Do not mark every table cell
Do not add wrappers only for comments

---

## Rules

### Do

- Keep it simple
- Write small functions
- Follow existing structure

### Don't

- No overengineering
- No new libraries without need
- No features outside MVP
- Do not modify original email HTML

---

## Frontend

- Functional components
- Minimal state
- Use TanStack Query for API
- Use Mantine for base UI components, forms, layout, and feedback states
- No business logic
- Use Mantine v9
- When implementing or reviewing Mantine UI, check:
  https://mantine.dev/llms.txt

---

## Backend

- Thin handlers
- Logic in services
- Simple SQL (no heavy ORM)

---

## Realtime

- Use WebSocket
- Emit events after DB write
- Do not store state only in memory

---

## Security

Uploaded HTML is untrusted input.

Preview in isolation (iframe)
Do not execute scripts

---

## AI collaboration mode

Use AI as a mentor and reviewer.

Prefer:

- explaining options
- small examples
- discussing trade-offs
- reviewing my code

Avoid:

- generating full solutions without request
- adding abstractions too early

Default:

- explain → example → I implement → review

---

## Principle

Working > perfect
Simple > flexible
Understanding > automation
