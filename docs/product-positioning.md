# ReviewDesk Product Positioning

This document captures the product direction beyond the current internal email review workflow.

## Core Thesis

ReviewDesk should not become an omnichannel marketing platform. It should be the review and approval layer for communication journeys before they are implemented or published in CRM, ESP, messaging, or ad systems.

The strongest product boundary is:

> ReviewDesk helps teams review, edit, approve, and hand off multi-channel communication journeys without losing context between content, comments, stakeholders, versions, and final approvals.

## Best Initial External Customer

The most promising first external ICP is CRM, lifecycle, and email marketing agencies that build customer journeys for multiple clients.

These teams often combine:

- marketer or strategist;
- copywriter;
- designer;
- CRM platform specialist;
- analyst;
- account manager;
- client stakeholder;
- legal, brand, or compliance reviewer.

They frequently work across distributed teams and many clients, and they need a clear Kanban-style process for moving communication assets from brief to copy, design, implementation, QA, approval, launch, and reporting.

## Why Agencies Are A Strong Fit

Agencies have repeated workflow pain that maps directly to ReviewDesk:

- many clients require workspace or board separation;
- approval context is often scattered across Google Docs, Figma, Slack, spreadsheets, screenshots, and ESP previews;
- different stakeholders review different parts of the same journey;
- client approvals need to be explicit and auditable;
- version confusion can create rework or launch the wrong content;
- Kanban status, blockers, due dates, and owners are natural agency workflows;
- a clear approval record helps prevent scope creep and protects the agency when decisions change.

## Product Scope

ReviewDesk should focus on communication journeys, not just standalone emails.

Examples:

- onboarding journey;
- activation journey;
- partner activation journey;
- abandoned cart journey;
- winback journey;
- renewal journey;
- churn prevention journey;
- post-purchase journey.

Each journey can contain multiple communication items:

- email;
- SMS;
- WhatsApp;
- Telegram;
- push notification;
- in-app notification;
- LinkedIn InMail;
- retargeting ad copy;
- banner copy.

The first external version should stay narrower:

- keep email as the strongest rich-content channel;
- add text-message style channels first, such as SMS, WhatsApp, Telegram, and push;
- defer banners, ads, InMail, and deeper analytics until the core review workflow is strong.

## What ReviewDesk Should Not Replace

ReviewDesk should not try to replace:

- CRM platforms;
- ESPs;
- customer engagement platforms;
- Figma;
- project management tools;
- analytics platforms;
- Slack or Teams.

The useful boundary is before launch:

> This is where the journey is reviewed, edited, approved, versioned, and handed off.

Implementation and sending can still happen in Braze, Customer.io, Iterable, HubSpot, Klaviyo, Salesforce Marketing Cloud, or another platform.

## High-Value Capabilities

For agencies, the most valuable capabilities are likely:

- client workspaces or boards;
- journeys with ordered communication items;
- email plus short-form message review in one flow;
- comments attached to stable review blocks or message fields;
- role-based review and approvals;
- required approvers by area;
- versioned content and stale approvals after edits;
- activity history for comments, edits, status changes, and approvals;
- export or handoff packages with HTML, text copy, links, UTM values, implementation notes, and approval state;
- AI quick start for creating journey structure, review rules, checklists, and consistency checks.

## Review Roles

Useful project-level or journey-level roles:

- owner: owns the journey and moves work through the process;
- editor: updates content and prepares revisions;
- reviewer: comments and requests changes in a specific area;
- approver: approves an area or final production readiness;
- viewer: can inspect content, comments, and history without changing state.

Useful review areas:

- strategy;
- copy;
- design;
- brand;
- legal;
- compliance;
- CRM ops;
- analytics;
- localization;
- client approval.

## MVP Direction

The pragmatic MVP for this broader direction:

- keep the current email review foundation;
- introduce a generic communication item model;
- add one short-form message item type;
- keep all comments, statuses, approvals, and activity history working across item types;
- present boards as communication journeys rather than only email boards;
- avoid platform integrations at first;
- support manual export and handoff before building automated publishing.

This keeps the product narrow enough to build while proving the larger positioning.

## Validation Questions

Before investing heavily, validate with CRM and lifecycle agencies:

- Where do you currently review and approve multi-channel journeys?
- Which tools are involved between brief and launch?
- What gets lost between copy, design, build, QA, and client approval?
- Who has final approval authority?
- How often do approvals become stale after content changes?
- Have you ever launched the wrong version or had a client dispute what was approved?
- Would you pay per agency seat, per client workspace, or per active journey?
- Which channel beyond email would be most valuable first: SMS, WhatsApp, push, or in-app?

Strong validation signal:

- at least several agencies can name an active project where they would use it immediately;
- they already feel pain around approvals, versioning, and handoff;
- they do not frame the problem as only project management;
- they are willing to test it with a real client workflow.

## Naming Direction

If the product expands beyond email, the name should probably move away from pure email review.

Good naming themes:

- journey;
- sequence;
- message;
- comms;
- touchpoint;
- flow;
- approval.

Potential names:

- JourneyDesk;
- SequenceDesk;
- MessageDesk;
- MessageReview;
- CommsReview;
- ReviewFlow;
- TouchpointReview.

The strongest fit for the broader product is likely JourneyDesk or SequenceDesk because they cover email, messaging, and lifecycle flows without implying a full sending platform.
