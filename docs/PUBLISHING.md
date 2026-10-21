# Publishing Ghadi to GitHub

This repository was prepared locally. **Nothing has been pushed anywhere.** Follow these steps when you are ready.

## 1. Check locally

```bash
npm ci
npm run check          # lint + typecheck + unit tests + build
npm run build
npm run test:e2e       # needs Chromium: `npx playwright install chromium`
```

## 2. Create an empty repository

On GitHub: **New repository** → name `ghadi-ai` → _do not_ add a README, licence or .gitignore (they already exist) → Create.

## 3. Initialise git and push

```bash
git init -b main
git add .
git status             # confirm no .env files or node_modules are staged
git commit -m "Initial commit: Ghadi v0.1.0"
git remote add origin https://github.com/<your-username>/ghadi-ai.git
git push -u origin main
```

(or with the GitHub CLI: `gh repo create ghadi-ai --public --source=. --remote=origin --push`)

## 4. Replace placeholders

Search for `<your-username>` and replace it with your GitHub user or organisation:

```bash
grep -rn "<your-username>" --exclude-dir=node_modules --exclude-dir=.next .
```

Files affected: `README.md`, `CONTRIBUTING.md`, `.github/ISSUE_TEMPLATE/config.yml`, `public/.well-known/security.txt`. In `security.txt`, also check the `Expires` date and renew it each year.

## 5. Repository settings

- **Description:** `Free, open-source, local-first AI study platform. Turn documents into notes, quizzes and flashcards. Learn Smarter. Remember More. Stay Free.`
- **Topics:** `study`, `flashcards`, `spaced-repetition`, `quiz`, `local-first`, `nextjs`, `typescript`, `indexeddb`, `openai`, `education`, `open-source`
- **Security → Private vulnerability reporting:** enable (SECURITY.md relies on it).
- **Security → Dependabot alerts / security updates:** enable.
- **Branch protection on `main`:** require the `CI` checks (`check`, `e2e`) before merging.
- **Actions → General:** allow GitHub Actions.

## 6. First release (optional)

Tag and publish release notes from `CHANGELOG.md`:

```bash
git tag v0.1.0
git push origin v0.1.0
```

Then create a release from the tag on GitHub.
