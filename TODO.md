# TODO

## 1. Project setup

- [ ] Create monorepo structure
- [ ] Create `apps/web`
- [ ] Create `apps/api`
- [ ] Install Mantine in `apps/web`
- [ ] Add `MantineProvider`
- [ ] Configure basic Mantine theme
- [ ] Add basic README / project notes
- [ ] Add `agents.md`

---

## 2. Backend - Go API

- [ ] Initialize Go project
- [ ] Add Chi router
- [ ] Add PostgreSQL connection
- [ ] Create basic health endpoint
- [ ] Add database migrations

---

## 3. Database

- [ ] Create `users` table
- [ ] Create `emails` table
- [ ] Create `email_blocks` table
- [ ] Create `comments` table
- [ ] Create `thread_messages` table

---

---

## 4. Email import / export

- [ ] Add admin form for creating an email
- [ ] Add metadata fields: sequence, title, subject, preheader, order/stage
- [ ] Add `email.html` file upload
- [ ] Store uploaded original HTML in the database
- [ ] Parse review blocks from uploaded HTML
- [ ] Use `data-review-block` as the block marker attribute
- [ ] Store parsed blocks in `email_blocks`
- [ ] Show import errors if no review blocks are found
- [ ] Preview uploaded HTML
- [ ] Add download original HTML action
- [ ] Add copy original HTML action

## 5. Email preview

- [ ] Add test email data
- [ ] Render email blocks from backend
- [ ] Add `data-block-id` to each block
- [ ] Display email preview in frontend

---

## 6. Comments

- [ ] Detect selected text
- [ ] Detect selected block
- [ ] Send comment to backend
- [ ] Save comment in database
- [ ] Show comments in right sidebar
- [ ] Highlight commented text
- [ ] Resolve comment

---

## 7. Discussion thread

- [ ] Add message input
- [ ] Save message in database
- [ ] Show message list
- [ ] Add basic author/date display

---

## 8. Realtime

- [ ] Add WebSocket endpoint
- [ ] Subscribe user to current email room
- [ ] Emit `comment.created`
- [ ] Emit `comment.resolved`
- [ ] Emit `thread.message.created`
- [ ] Update UI from WebSocket events

---

## 9. Frontend UI

- [ ] Create three-column layout
- [ ] Use Mantine components for app shell / layout
- [ ] Left: email list / flow
- [ ] Center: email preview
- [ ] Right: comments + discussion
- [ ] Use Mantine components for upload form
- [ ] Use Mantine components for comments and discussion UI
- [ ] Add loading/error states
- [ ] Use Mantine feedback components for notifications and errors
- [ ] Add basic responsive behavior

---

## 10. MVP polish

- [ ] Add seed data
- [ ] Add simple demo scenario
- [ ] Add basic error handling
- [ ] Add empty states
- [ ] Test full flow end-to-end

---

## Out of scope for now

- Email editing
- Drag-and-drop flow
- React Flow
- User roles / permissions
- Version history
- AI suggestions
