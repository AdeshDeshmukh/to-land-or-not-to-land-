# 🛡️ Mandatory Engineering & Pre-Push Verification Protocol

Every AI agent working in this repository MUST strictly adhere to this protocol before pushing any code or opening/updating any Pull Request (PR):

---

### 1. Pre-Flight Sync & Rebase Check
* **Always verify upstream status**: Fetch the latest commits from `upstream/main` (`https://github.com/AdeshDeshmukh/to-land-or-not-to-land-`).
* **Check for divergence**: Check if the working branch needs rebasing against `upstream/main`.
* **Clean rebase**: Rebase cleanly (`git rebase upstream/main`) to eliminate any potential merge conflicts before pushing.

---

### 2. Mandatory Local Build Verification
* **Execute build**: Always run `cd client && npm run build` (`tsc && vite build`).
* **Zero tolerance**: The build must pass with **0 TypeScript compiler errors**, **0 unresolved imports**, and **0 bundling warnings**.
* **Never push unverified code**: Never push code or open a PR without a successful, clean local build execution.

---

### 3. Local Runtime & Visual Verification
* **Run dev server**: Start the server locally and verify on `http://127.0.0.1:5173/`.
* **Visual inspection**: Launch the browser (or automated browser agent) to visually inspect the live UI.
* **Verify layout integrity**:
  * Ensure zero button overlap or colliding overlay elements.
  * Check that responsive drawers, maps, sliders, and canvas viewports render cleanly.
* **Behavior & Edge Cases**:
  * Test user interactions (drag sliders, click toggles, switch sites).
  * Check for edge cases, caveats, and console warnings/errors.

---

### 4. Security & Hygiene Check
* **No secrets**: Verify that no API keys, credentials, tokens, or `.env` files are tracked.
* **No binary bloat**: Ensure no large raw datasets, GeoTIFFs, or DEMs are committed to git.
* **Clean commits**: Follow Conventional Commits format (`feat(scope):`, `fix(scope):`, `docs(scope):`, `style(scope):`).

---

### 5. Open & Update Pull Requests
* Only after Steps 1–4 are 100% verified:
  1. Push branch to `origin`: `git push -u origin <branch-name>`
  2. Open or update PR targeting `AdeshDeshmukh:main`.
  3. Complete all checklist items in `.github/PULL_REQUEST_TEMPLATE.md`.
  4. Notify the tech lead / reviewer (`@AdeshDeshmukh`).
