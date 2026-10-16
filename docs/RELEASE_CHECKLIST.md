# Release checklist (nothing below is complete unless ticked with evidence)

## Must be done before ANY real child uses this
- [ ] Legal review per launch market (children's privacy, consent, data residency). Replace draft consent text and policy version.
- [ ] Educational review of every lesson; record reviewer in `lesson_versions.approved_by`; remove the "developer-approved" wording.
- [ ] Native-speaker review of French and Arabic strings and any lesson content before enabling those languages.
- [ ] Decide and document the teacher: either keep the labelled demo script, or implement and evaluate an LLM adapter (schema-validated output, safety evaluation with adversarial prompts, cost/latency limits).
- [ ] Configure and TEST a real mail provider (Resend adapter) and SMS provider (Twilio adapter); consider MFA for guardians.
- [ ] Choose and integrate a payment provider that supports the launch region (none connected); implement a verified webhook calling `recordPayment`.
- [ ] Test the Anthropic teacher adapter with a real key and run an adversarial-prompt safety evaluation, or keep the demo teacher.
- [ ] Replace the draft privacy notice and terms with lawyer-reviewed text; complete operator sections.
- [ ] Decide trial abuse policy (multiple accounts) and install FR/AR OCR language packs if offering them.
- [ ] Child-mode lock so a child cannot reach the parent area on a signed-in device.
- [ ] Usability testing with caregivers and children aged 3–5 on real tablets (touch targets, audio-first flow, break prompts).
- [ ] Accessibility audit (keyboard, screen reader, RTL) beyond the colour-contrast unit test.
- [ ] Automated retention schedule and a tested backup/restore plan that also honours deletions.

## Engineering
- [ ] Set `BETTER_AUTH_SECRET`, `BETTER_AUTH_URL`, `DATABASE_URL` from a secret manager; `NODE_ENV=production`; demo entry off.
- [ ] Run `pnpm db:migrate` against the production database; verify with a restore drill.
- [ ] Shared rate-limit store when running more than one instance.
- [ ] Structured logging sink and error reporting with PII redaction (today: minimal JSON logs, no stack/message on API errors).
- [ ] Dependency audit and a CI pipeline running lint, typecheck, test, build and smoke.
- [ ] Move uploads from PostgreSQL to private object storage with signed URLs; add malware scanning and a real job queue for OCR.
- [ ] Load test the session endpoints (each answer takes a row lock and several queries).
