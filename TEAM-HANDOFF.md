# Team handoff

Repository: https://github.com/saulpatinojr/SimplySoph-Quince
Draft review: https://github.com/saulpatinojr/SimplySoph-Quince/pull/1
Branch: feature/complete-quince-site

Use README.md, PAGE-SCOPE.md and DEPLOYMENT.md as the current implementation contract. Earlier five-page/demo proposals are superseded.

## Collaborating

Invite developers to GitHub, let each work on a separate branch, and review pull requests before merging. Node 24 CI runs install, build, tests and dependency audit. One maintainer coordinates cloud changes and updates the cleanup inventory. A shared ChatGPT project is useful for approved requirements and discussion, but does not share a local checkout or authorize provider access automatically.

Give content editors the relevant Notion pages; grant deployment access separately and narrowly. Keep secrets in Google Secret Manager. Never upload the real guest list, private invitation links, credentials or private test exports to GitHub/ChatGPT project files.

## Work streams

- Content: bilingual biography, parent message, court/padrinos, confirmed venue/attire details, gifts, travel, photography permission and retention decision.
- Website: inspect all guest routes at desktop/mobile widths, translations, keyboard navigation and real API errors.
- Integrations: finish restricted Notion credential, Google OAuth client, private runtime/storage and mailbox-scoped Microsoft application; complete the live acceptance checklist.
- Operations: record every resource/grant and creation baseline; run cleanup review, never delete shared resources or original invitation data.

Current tests cover the API through fixtures. Production provider setup and acceptance evidence must be added to VALIDATION.md before calling RSVP/email live.
