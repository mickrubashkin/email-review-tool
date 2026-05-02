# Partner Onboarding System

## 1. Overview

The partner onboarding system is designed to move partners from registration to stable revenue (Silver level).

Core logic:

- Registration = intent
- Training = readiness
- App installed = activation
- First sale = validation
- Second sale = retention
- Silver = stability

## 2. Funnel Stages

```
01_registered
02_qualified
03_approved
04_nfr-installed
05_training-completed
06_partner-app-installed
07_first-sale
08_second-sale
09_silver
```

**Attributes (Non-stage Signals)**

```
intro_call_completed (boolean)

approved_date // tbd
portal_joined (boolean) //tbd

kickstart_activated (boolean) //tbd
kickstart_expiry (date) //tbd

last_communication (date)

rejection_reason (list) //tbd
```

## 3. Email Playbook

**Core Principles:**

- One email = one action
- Focus on outcomes (clients, deals, revenue)
- Reduce friction before pressure
- Increase urgency over time
- Keep emails short and scannable

```
Training completion ≠ activation
Activation starts when:
- Partner App is installed
- First deal is closed

All emails must push toward this point.
```

---

### Stage: Registered → Qualified

**Goal**

Qualify incoming application (filter, validate intent)

<!-- Note: Это письмо-нотифтикация, с данными для логина в кабинет партнера. Это письмо не можем убрать, отправляется из админки с данными для входа. CTA опциональный, можем добавить - призыв загрузить сразу документы, для ускорения модерации. -->

**Email 1 — Application received**

- Trigger: form submitted
- Timing: immediately
- Goal: confirm submission and set expectations
- Message: “Your application is received — complete your profile to speed up review”
- CTA: Upload documents

---

### Stage: Qualified → Approved

**Goal**

Complete verification (upload documents) and approve partner (intro call)

---

**Email 1 — Next step**

- Trigger: qualified
- Timing: immediately
- Goal: move to verification
- Message: “Complete verification to join the partner program”
- CTA: Book a call

---

**Email 2 - Follow-up 1**

- Trigger: no progress
- Timing: +1 day
- Goal: push first action
- Message: “You’re one step away from approval”
- CTA: Continue verification

---

**Email 3 - Follow-up 2**

- Trigger: partial progress
- Timing: +3-4 days
- Goal: complete remaining step
- Message: “Finish the last step to get approved”
- CTA: Finish verification

---

**Email 4 - Last Call**

- Trigger: incomplete
- Timing: +7-9 days
- Goal: create urgency
- Message: “Your application is incomplete and cannot be approved”
- CTA: Complete verification

---

### Stage: Approved → NFR Installed

**Goal**

Activate product usage

---

**Email 1 — Next step**

- Trigger: approved
- Timing: immediately
- Goal: start product usage
- Message: “Set up your NFR to get ready for client work”
- CTA: Set up your NFR

---

**Email 2 - Follow-up 1**

- Trigger: no activity
- Timing: +2 days
- Goal: trigger first login
- Message: “You haven’t started yet”
- CTA: Set up your NFR

---

**Email 3 - Follow-up 2**

- Trigger: still no activity
- Timing: +4 days
- Goal: reinforce value
- Message: “Start using Bitrix24 to prepare for real clients”
- CTA: Set up your NFR

---

**Email 4 - Last Call**

- Trigger: no activity
- Timing: +7 days
- Goal: create urgency
- Message: “No setup means no progress toward working with clients”
- CTA: Set up your NFR

---

### Stage: NFR Installed → Training Completed

**Goal**

Unlock monetization and benefits

---

**Email 1 — Next step**

- Trigger: NFR installed
- Timing: immediately
- Goal: start training
- Message: “Complete training to start working with clients”
- CTA: Start training

---

**Email 2 - Follow-up 1**

- Trigger: not completed
- Timing: +4 days
- Goal: highlight benefits
- Message: “Unlock leads, commission, and Kickstart bonus”
- CTA: Complete training

---

**Email 3 - Follow-up 2**

- Trigger: not completed
- Timing: +5 days
- Goal: remove friction
- Message: “Without training, you won’t get access to leads”
- CTA: Complete training

---

**Email 4 - Last Call**

- Trigger: deadline approaching
- Timing: +14 days
- Goal: enforce deadline
- Message: “Training is required to stay in the program”
- CTA: Complete training

---

### Stage: Training Completed → Partner App Installed

**Goal**

Reach activation (start working with leads)

---

**Email 1 — Next step**

- Trigger: training completed
- Timing: immediately
- Goal: move to activation
- Message: “Install the Partner App to start receiving leads”
- CTA: Install Partner App

---

**Email 2 - Follow-up 1**

- Trigger: no app
- Timing: +2–3 days
- Goal: reinforce next step
- Message: “You’re one step away from working with clients”
- CTA: Install Partner App

---

**Email 3 - Follow-up 2**

- Trigger: still no app
- Timing: +5–7 days
- Goal: remove friction
- Message: “Not sure how to start? We’ll guide you”
- CTA: Install Partner App

---

**Email 4 - Last Call**

- Trigger: no activation
- Timing: +10–14 days
- Goal: create urgency
- Message: “Without activation, you won’t receive any leads”
- CTA: Install Partner App

---

### Stage: Partner App Installed → First Sale

**Goal**

Convert activation into revenue

---

**Email 1 — Next step**

- Trigger: app installed
- Timing: immediately
- Goal: start revenue activity
- Message: “Start receiving leads and work with your first client”
- CTA: Start receiving leads

---

**Email 2 - Follow-up 1**

- Trigger: no leads
- Timing: +2–3 days
- Goal: trigger first action
- Message: “Take your first lead to start working with clients”
- CTA: Close your first deal

---

**Email 3 - Follow-up 2**

- Trigger: no deal
- Timing: +5–7 days
- Goal: convert leads into deal
- Message: “Turn your first lead into a deal”
- CTA: Close your first deal

---

**Email 4 - Last Call**

- Trigger: no sales
- Timing: +10–14 days
- Goal: push to revenue
- Message: “You’re missing real opportunities to close your first deal”
- CTA: Close your first deal

---

### Stage: First Sale → Second Sale

**Goal**

Build consistency

---

**Email 1 — Next step**

- Trigger: first sale
- Timing: immediately
- Goal: reinforce success
- Message: “Repeat your success with the next client”
- CTA: Get more leads

---

**Email 2 - Follow-up 1**

- Trigger: no second sale
- Timing: +5 days
- Goal: keep momentum
- Message: “Consistency leads to growth”
- CTA: Work with more clients

---

**Email 3 - Follow-up 2**

- Trigger: still no second sale
- Timing: +10–14 days
- Goal: increase volume
- Message: “Close your next deal faster or increase deal size”
- CTA: Close next deal

---

**Email 4 - Last Call**

- Trigger: inactivity
- Timing: +21–30 days
- Goal: prevent drop-off
- Message: “Don’t stop after your first success”
- CTA: Continue working

---

### Stage: Second Sale → Silver

**Goal**

Achieve Silver status: at least USD 2,500 net in sales and at least 2 sales to 2 different clients.

---

**Email 1 — Next step**

- Trigger: second sale
- Timing: immediately
- Goal: push toward target
- Message: “You’re on track to reach Silver”
- CTA: Get more leads

---

**Email 2 - Follow-up 1**

- Trigger: below target
- Timing: +7 days
- Goal: highlight gap
- Message: “You’re close to Silver — keep going”
- CTA: Work with leads

---

**Email 3 - Follow-up 2**

- Trigger: still below target
- Timing: +14–21 days
- Goal: accelerate revenue
- Message: “Increase deal size to reach Silver faster”
- CTA: Close next deal

---

**Email 4 - Last Call**

- Trigger: still below target
- Timing: +30 days
- Goal: create urgency
- Message: “You’re close — don’t miss Silver status”
- CTA: Push final deals

---

### Stage: Silver Prequalified (deal won stage)

**Email 1 - Next Step**

- Trigger: sales target completed
- Timing: immediately
- Goal: finalize transition to Silver
- Message: “You’ve reached the requirements — let’s finalize your Silver status”
- CTA: Book a call

### Stage: Rejected (deal lost stage)

**Email 1 - Application Rejected**
