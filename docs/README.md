# CareBridge documentation

Start here. Everything about how CareBridge is built, run and changed lives in this folder.

| Document | Read it when you… |
|---|---|
| [CONVENTIONS.md](CONVENTIONS.md) | …write any code. The binding rules for both apps. |
| [architecture.md](architecture.md) | …need the big picture: components, request flow, auth model. |
| [development.md](development.md) | …set up a machine, run the apps, seed data, run tests. |
| [api.md](api.md) | …call or change an API endpoint. |
| [data-model.md](data-model.md) | …touch the database: tables, relationships, status machines. |
| [migrations.md](migrations.md) | …change the schema: creating, applying, rolling back, troubleshooting. |
| [deployment.md](deployment.md) | …run CareBridge on a server: Docker, env vars, launch checklist. |
| [notifications.md](notifications.md) | …set up SMS/email (Termii, SMTP) or add another provider. |
| [security.md](security.md) | …handle patient data, auth, or anything privacy-related. |
| [roadmap.md](roadmap.md) | …want to know what's left to build and what blocks launch. |
| [decisions/](decisions/) | …want to know *why* something is the way it is (ADRs). |
| [product/](product/) | …need the product vision (`CareBridge_Product_Design_v1.2.docx`) or the original UX prototype. |

## Decisions so far

- [0001 — API foundation and conventions](decisions/0001-foundation.md)
- [0002 — Web app stack and structure](decisions/0002-web-app.md)
- [0003 — Migration strategy](decisions/0003-migrations.md)
- [0004 — Notifications](decisions/0004-notifications.md)
