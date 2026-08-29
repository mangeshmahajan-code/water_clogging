# Water Log Reporter — Complete Codebase Audit

**Scope:** `app.py`, `config.py`, `form.py`, `verification.py`, `test.py`, `index.html`, `form.html`, `header.html`, `footer.html`, `verification.html`, `style.css`, `map.js`, `app.js`

**How this app works (confirmed by tracing the code):** A Flask app where users register → receive a 1-hour email verification link (itsdangerous token) → verify → log in (Flask-Login) → submit a water-clogging report (photo → Supabase Storage, cause, description, browser-geolocation lat/lng) → the report is saved to a SQLite DB (SQLAlchemy) → the homepage renders every report as a marker on a Leaflet map, built from Jinja-rendered JSON consumed by inline JS.

---

## Executive Summary

| Dimension | Score | Why |
|---|---|---|
| Overall code quality | 5/10 | Functional and reasonably organized for its size, but has one critical XSS, several unhandled-exception paths, and a large amount of dead/vestigial front-end code. |
| Security | 3/10 | A confirmed, easily-reachable stored XSS; `debug=True`; unrestricted-content-type file uploads; user enumeration on login. |
| Reliability | 5/10 | Several unguarded `db.session.commit()` calls and a signup race condition can produce unhandled 500s; users can be permanently locked out of unverified accounts. |
| Performance | 6/10 | Works fine at small scale; the homepage has a classic N+1 query that will degrade as reports grow. |
| Maintainability | 6/10 | Consistent structure, but `app.js` is ~85% dead code left over from an earlier prototype, and static asset paths are inconsistent. |
| Production readiness | 3/10 | Debug mode, no security headers, no dependency manifest, hardcoded SQLite URI, no migrations — needs work before a real deploy. |

The single most important finding is a **stored XSS in the homepage map popups** (report description / username are concatenated unescaped into HTML and handed to Leaflet). The second most important is that **`debug=True`** is combined with **multiple realistic ways to trigger an unhandled server exception**, which is a dangerous combination if this file is ever what actually serves production traffic.

---

## 🔴 Critical Issues

| # | File | Line | Issue | Impact | Fix |
|---|------|------|-------|--------|-----|
| 1 | `index.html` | 209, 213, 220, 252 | `report.author`, `report.cause`, `report.description` are concatenated into an HTML string (`popupContent`) with template literals and passed straight to `marker.bindPopup(popupContent)`, which renders it as live HTML. | **Stored XSS.** `report.description` (free-text `StringField`, no validator) and `report.author` (username, free-text at signup, no validator) are fully attacker-controllable by any *registered and verified* user. A payload like `<img src=x onerror=...>` in a report description executes for **every visitor** to the homepage. | Never build HTML by string-interpolating user data. Either (a) set popup content via DOM APIs (`document.createElement`, `textContent`) instead of an HTML string, or (b) HTML-escape every interpolated field before building `popupContent`. Do this for `author`, `cause` (defense in depth), and `description`. |
| 2 | `app.py` | 232 | `app.run(debug=True)` — and there are multiple unguarded paths that can throw (see High #5, #9). | Werkzeug's interactive debugger is a documented **remote-code-execution** vector when reachable. Combined with the missing `try/except` around `db.session.commit()` calls (a duplicate concurrent signup will raise an `IntegrityError`), it's realistic — not hypothetical — that an unhandled exception fires while debug mode is on. Even without RCE, `debug=True` in production leaks full stack traces (source code, local variables, possibly `SECRET_KEY`-derived state) to any visitor who triggers a 500. | Never hardcode `debug=True`. Use `app.run(debug=os.environ.get("FLASK_DEBUG") == "1")`, and in real production run behind Gunicorn/uWSGI with debug off entirely. |

## 🟠 High Priority Issues

| # | File | Line | Issue | Impact | Fix |
|---|------|------|-------|--------|-----|
| 3 | `form.py` / `app.py` | `form.py:19`, `app.py:119-133` | `FileAllowed(["jpg","jpeg","png"])` only checks the filename extension. The actual bytes are never verified (e.g. with Pillow), and the Content-Type stored in Supabase is taken directly from the client-supplied `image_file.mimetype` (`app.py:130`), which is attacker-controllable. | A file can be uploaded with a `.jpg` name but arbitrary content and an arbitrary declared Content-Type (e.g. `text/html`). Anyone who navigates directly to the object's public Supabase URL could have that content rendered as HTML by their browser — a stored-content risk on your storage bucket, and a phishing/abuse vector even though it wouldn't directly execute against your app's own cookies (different origin). | Re-encode/verify the image server-side (e.g. `PIL.Image.open(...).verify()`) before upload, and set the storage Content-Type from the verified image type, never from client input. |
| 4 | `app.py` | 168, 178, 180 | Login shows a different flash message for "email not found" vs "wrong password", and only hashes/compares a password when a user *is* found (line 168 is skipped entirely otherwise). | **User enumeration**: an attacker can determine which emails are registered, both from the message text and from the response-time difference (hash comparison only happens when the account exists). | Use one generic message ("Invalid email or password") for both cases, and consider running `check_password_hash` against a dummy hash even when no user is found, to equalize timing. |
| 5 | `app.py` | 150, 200, 219 | No `try/except` around any of the three `db.session.commit()` calls (report submission, registration, email verification). | An `IntegrityError` (e.g. two concurrent signups with the same email — see Medium #13) or any other DB error propagates as an unhandled exception → 500, with no `db.session.rollback()`. Combined with Critical #2, this is a concrete crash/information-disclosure path, not just theoretical. | Wrap each commit in `try/except`, call `db.session.rollback()` on failure, flash a friendly message, and log the real error server-side. |

## 🟡 Medium Priority Issues

| # | File | Line | Issue | Impact | Fix |
|---|------|------|-------|--------|-----|
| 6 | `app.py` | 71-93 | `index()` loads all reports in one query, then accesses `r.author.name` inside the loop — a lazy-loaded relationship, so this is one query **per report** (classic N+1). | Homepage load time degrades linearly with report count; this is the app's most-visited page. | `db.select(Report).options(joinedload(Report.author))` (or `selectinload`) so the author is loaded in one extra query total, not N. |
| 7 | `app.py` | 110, 117, 138 vs. 155 | The three error-path re-renders of `form.html` in `report()` omit `img=image_path`, unlike the successful GET render at line 155. | `form.html:5` reads `{{ img }}` for the background image — on any validation/upload error, `img` is undefined and the background silently disappears. Not a crash (Jinja default `Undefined` renders as empty string), but a visible UI regression exactly when the user needs clear feedback. | Add `img=image_path` to all three `render_template("form.html", ...)` calls in the error branches. |
| 8 | `app.js` / `index.html` | `app.js:107-181`, `index.html:46` | Verified by cross-checking every `getElementById(...)` in `app.js` against every `id="..."` that actually exists in the templates: **14 of the 19 IDs `app.js` references don't exist anywhere** (`landing-page`, `reporting-page`, `form-address`, `reports-list-container`, `submit-button`, `toast`, etc. — this is leftover code from an earlier client-only/localStorage prototype). The one exception that *does* wire up to a real element, `#total-reports-badge`, is populated by `updateStats()` from **mock/localStorage data** (`mockReports`), completely disconnected from the real `Report` table. | The "Reports Submitted" counter on the homepage (`index.html:46`) shows a **fabricated number** to every visitor — it does not reflect real data in the database at all. | Remove the dead prototype code (everything except `initSidebar()`), and if a real submitted-reports count is wanted, compute it server-side in `index()` (`len(reports)` / a `COUNT(*)` query) and pass it into the template. |
| 9 | `form.py` | 10 | `password = PasswordField(..., validators=[DataRequired()])` — no minimum length or complexity check. | A user can register with a 1-character password. | Add `Length(min=8)` (and consider a complexity check) to the signup password field. |
| 10 | `app.py` / `verification.py` | `app.py:172-173, 191-193`; `verification.py:14` (`expiration=3600`) | Verification links expire after 1 hour. If a user misses that window, `/register` with the same email just says "already signed up, log in instead" (`app.py:192`), and `/login` just flashes "please verify your email" (`app.py:172`) — there is **no route anywhere that resends a verification email**. | Users who don't click the link within an hour are **permanently locked out** of an account they can never verify, with no self-service recovery path. | Add a "resend verification email" action (e.g. on the login page, or a dedicated route that re-generates a token for an unverified account). |
| 11 | `verification.py` | 45-51 | `send_verification_email()` catches **all** exceptions internally and only logs them — it never signals failure back to the caller. | `register()` (`app.py:204`) always shows the "check your email" page even if sending demonstrably failed (bad SMTP creds, network issue), leaving the user with an account they can never verify and no indication anything went wrong. Compounds issue #10. | Let `send_verification_email` return a success/failure boolean (or raise), and have `register()` flash a warning / offer a retry if sending failed. |
| 12 | `app.py` / `config.py` | `app.py:125`; `config.py` (no `MAX_CONTENT_LENGTH`) | The uploaded file is fully read into memory (`image_file.read()`) with no size cap configured anywhere. | A large upload consumes server memory proportional to file size; with concurrent requests this is a low-effort DoS vector. | Set `app.config['MAX_CONTENT_LENGTH']` (e.g. 5 MB) in `config.py`, matching whatever your Supabase plan/UX expects. |
| 13 | `app.py` | 190-200 | `register()` checks for an existing user, then inserts, as two separate, non-atomic steps. | Two concurrent signups with the same email can both pass the "does this email exist" check before either commits; the second `db.session.commit()` then raises an `IntegrityError` (email is `unique=True`) — unhandled per High #5, so it surfaces as a raw 500 instead of a friendly "email already taken" message. | Catch `IntegrityError` around the commit and convert it into the same "already signed up" flash message used for the non-race case. |
| 14 | `config.py` | 29 | `SQLALCHEMY_DATABASE_URI = "sqlite:///water_clogging.db"` is hardcoded — not read from an environment variable. | Deploying against Postgres/MySQL in production requires a code change rather than a config change; also, SQLite is generally not recommended for concurrent production web workloads. | Read from `DATABASE_URL` env var with a SQLite fallback for local dev, e.g. `_get_clean_env("DATABASE_URL", "sqlite:///water_clogging.db")`. |
| 15 | `header.html` | 11, 15, 33 | `lucide@latest` (line 11) and an **unpinned** `unpkg.com/leaflet/dist/leaflet.css` (line 15) are loaded from CDN with no version pin — and line 15 is a **duplicate** of the already-pinned `leaflet@1.9.4` stylesheet on line 33. | Unpinned CDN dependencies can silently break the site on an upstream breaking release with zero code changes on your end. The duplicate Leaflet CSS is also just wasted bandwidth/an extra request. | Pin Lucide to a specific version like Leaflet already is; delete the duplicate unpinned Leaflet `<link>` on line 15. |
| 16 | `header.html` | 10, 32 | The **Tailwind Play CDN** (`cdn.tailwindcss.com`) is loaded alongside a full **Bootstrap 5** stylesheet (used by `flask_bootstrap`'s `render_form` for every form). | Tailwind's own docs state the Play CDN is not intended for production (it compiles CSS in the browser at runtime — slower, and generates a console warning). Running two full CSS frameworks side-by-side on the same pages also risks class/reset conflicts between Bootstrap's form styling and Tailwind's utility classes. | For production, compile Tailwind via its CLI/PostCSS instead of the Play CDN; consider whether both frameworks are actually needed, or scope Bootstrap's styles to just the form components. |
| 17 | `header.html` / `footer.html` | `header.html:16,43`; `footer.html:1,8` | Several asset references use a hardcoded relative path (`../static/...`) instead of Flask's `url_for('static', filename=...)`, while other tags in the *same files* correctly use `url_for` (e.g. `footer.html:3`). | Works today only because every route happens to be one path segment deep. It will silently break the moment a route gets nested, or the app is deployed behind a URL prefix/reverse-proxy subpath. | Replace every hardcoded `../static/...` reference with `url_for('static', filename='...')` for consistency and portability. |
| 18 | `config.py` / `app.py` | whole file | No `SESSION_COOKIE_SECURE`, `SESSION_COOKIE_SAMESITE`, or any security headers (CSP, X-Frame-Options, etc.) are configured anywhere. | Session cookies aren't explicitly forced to HTTPS-only, and there's no defense-in-depth against clickjacking/XSS beyond what's fixed in Critical #1. | Set `SESSION_COOKIE_SECURE=True` / `SESSION_COOKIE_SAMESITE="Lax"` in `config.py` for production, and consider `flask-talisman` for headers. |

## 🔵 Low Priority / Cleanup

| # | File | Line | Issue | Recommendation |
|---|------|------|-------|-----------------|
| 19 | `app.py` | 26-27 | Debug `print()` of `MAIL_USERNAME` (via `repr()`) and `MAIL_PASSWORD` length runs on **every app start**, ending up in whatever logs production uses. | Remove, or gate behind a `DEBUG`/logging-level check; never print credential-adjacent values even partially. |
| 20 | `app.py` | 101, 160, 185, 208 | `currne_page` is a consistent typo for `current_page` (a local variable, not user-facing — harmless but sloppy). | Rename for readability; no functional risk since it's passed correctly as `current_page=currne_page`. |
| 21 | `form.py` | 3, 5 | `URL` (from `wtforms.validators`) and `CKEditorField` (from `flask_ckeditor`) are imported but never referenced anywhere in the file. | Remove both unused imports; also means `flask-ckeditor` may be an unused dependency (see Dependency section). |
| 22 | `test.py` | whole file | Not a real test (no assertions, not part of any test framework), sends a real email, and hardcodes what looks like a personal Gmail address as the recipient. Not imported by `app.py`, so it's dead weight in the deployed codebase. | Remove from the repo or move to a clearly-marked `scripts/` folder with the recipient parameterized via env var/arg. |
| 23 | `app.py` / `config.py` | `app.py:16`, `config.py:4` | `load_dotenv()` is called once directly in `app.py` and again inside `config.py` when it's loaded via `app.config.from_pyfile`. | Harmless (idempotent) but redundant — call it once. |
| 24 | `app.py` | 83-84 | `except Exception as e: img_path = None` — the exception `e` is caught but never logged. | At minimum log it, matching the pattern already used at line 136. |
| 25 | `app.py` | 214 | Invalid/expired verification link returns a raw string (`"Invalid or expired verification link."`), not a styled template. | Render a proper templated page consistent with the rest of the site. |
| 26 | `form.html` | 102 | Every flashed message is styled `color: red`, including non-error messages like "Account already verified. Try to login." | Categorize flashes (`flash(msg, "error")` / `"info"`) and style accordingly. |
| 27 | `app.py` | 216 | `User.query.filter_by(...)` (legacy Flask-SQLAlchemy style) is used here, while every other query in the file uses `db.session.execute(db.select(...))`. Both work; just inconsistent. | Standardize on one query style. |
| 28 | `app.py` / `form.py` | `app.py:50` (`String(20)`) | `User.name` is capped at 20 chars in the DB, but `signupform.username` has no matching `Length(max=20)` validator. SQLite won't currently enforce the cap, so this is latent rather than active. | Add `Length(max=20)` to the form field so it fails validation gracefully instead of relying on (or breaking against) DB-level enforcement on other database engines. |
| 29 | `app.py` | 52, 168 | `User.password` is `nullable=True`, but `login()` calls `check_password_hash(user.password, password)` unconditionally — this would raise if a user ever had a null password. No current code path creates one, so this is latent, not active. | Either make the column `nullable=False` (since every current signup path always sets it) or guard the login check for `None`. |
| 30 | `app.py` | 58 | `Report.author_id` has no `ondelete` behavior specified on its foreign key, and no user-deletion route exists yet. | Not exploitable today; if user deletion is ever added, decide explicitly between cascade-delete or `SET NULL` for that user's reports. |
| 31 | `app.py` | 66-67 | `db.create_all()` runs at import time with no migration tool (Alembic/Flask-Migrate). | Fine for a fresh dev DB; won't apply schema changes to an existing DB file once there's real data. Add Flask-Migrate before this matters. |
| 32 | `app.py` | 226-229 | `/logout` is a plain `GET` route. | Minor CSRF nuisance (a third party could force-logout a visitor via `<img src="/logout">`); low impact, but a POST-based logout is the stricter pattern. |
| 33 | `app.py` | 222-224 | If a verification token is valid but no matching user exists at all, the code takes the same branch as "already verified" and shows that message — slightly misleading for that (currently theoretical) case. | Differentiate the message, or leave as-is since it's not currently reachable through normal use. |

---

## 🗑️ Unnecessary Code

| File | Line(s) | Purpose | Why unnecessary | Safe to delete? |
|---|---|---|---|---|
| `app.js` | 1-181, 254-495 (all mock-data/prototype logic: `mockReports`, `categoryLabels`, `categoryBadgeColors`, `navigateTo`, `processImageUpload`, `removeUploadedImage`, `handleFormSubmit`, `toggleComments`, `handleAddComment`, `renderReports`, `showToast`, most of `initApp`) | Leftover from an earlier client-only/localStorage prototype of this app. | Confirmed by grepping every `getElementById` call against every real `id=` in the templates: 14 of 19 target elements don't exist anywhere in the actual Flask templates. This code never executes meaningfully against the live app. | **Yes** — keep only `initSidebar()` and its `DOMContentLoaded` wiring, plus the scroll-header logic at the bottom of the file. |
| `header.html` | 15 | `<link rel="stylesheet" href="https://unpkg.com/leaflet/dist/leaflet.css" />` (unpinned) | Duplicate of the pinned `leaflet@1.9.4` stylesheet already loaded on line 33. | Yes |
| `form.py` | 3 | `URL` imported from `wtforms.validators` | Never used in any field definition. | Yes |
| `form.py` | 5 | `CKEditorField` imported from `flask_ckeditor` | Never used; no field in the file is a `CKEditorField`. | Yes (also re-evaluate whether `flask-ckeditor` needs to stay a dependency at all). |
| `test.py` | whole file | One-off manual SMTP test script | Not part of the app or any test suite; not imported anywhere; hardcodes a personal email address. | Yes (or relocate/parameterize, per Low #22). |
| `app.py` | 24 | `# app['SECRET_KEY'] = os.environ.get("SECRET_KEY")` — commented-out dead code | Superseded by `app.config.from_pyfile('config.py')` on the next line, which already sets `SECRET_KEY`. | Yes |

---

## 🐛 Bugs

**1. Missing `img` context var on error re-renders — `app.py:110,117,138`.** Reproduction: submit `/report` without allowing geolocation (or with an invalid image). The form re-renders correctly (validation message shows), but the background image silently vanishes because `img` is undefined in that template render, while the initial GET (`app.py:155`) does pass it. Not a crash, but a real, easily reproduced UI defect.

**2. Homepage "Reports Submitted" counter is fake — `app.js:170-181`, `index.html:46`.** Reproduction: load the homepage fresh (empty `localStorage`). `initApp()` seeds `state.reports` from `mockReports` (2 hardcoded fake entries) and `updateStats()` computes `1234 + (totalCount - mockReports.length)`, i.e. always **1,234+** regardless of how many real reports exist in the database. The number shown has no connection to the `Report` table at all.

**3. Signup race condition — `app.py:190-200`.** Reproduction: fire two `/register` POSTs for the same email at (nearly) the same time. Both read "no existing user" before either commits; the second `db.session.commit()` raises an unhandled `IntegrityError` (500) instead of the friendly "already signed up" message the first request would have gotten on a non-concurrent retry.

**4. Permanent lockout for unverified accounts — `app.py:172-173,191-193`; `verification.py:14`.** Reproduction: register, let the 1-hour token expire without clicking it. `/login` says "please verify your email" with no link to get a new one; `/register` with the same email says "you've already signed up, log in instead." There is no code path anywhere that issues a second verification token for an existing unverified account.

**5. `index()` never actually converts stored paths to public URLs in practice — `app.py:78-84`.** `report()` (`app.py:134,142`) always stores the **full public URL** returned by `get_public_url()` as `image_path`. But `index()` checks `if img_path and img_path.startswith('reports/')` before calling `get_public_url` again — a full URL never starts with `reports/`, so this branch is effectively unreachable given how data is actually written. It doesn't currently cause incorrect output (the already-complete URL is used as-is), but it's dead/misleading logic that suggests a data-format mismatch the code was written to guard against and no longer needs to (or needs to, for some other write path that doesn't currently exist). Worth cleaning up so the intent is unambiguous.

---

## 🔐 Security Vulnerabilities

**Confirmed:**
- **Stored XSS** (Critical #1) — the headline finding. Verified by tracing `form.description`/`form.username` (no validators beyond `DataRequired`) all the way through the DB, into `Report.tojson` in `index.html:188`, into unescaped template-literal HTML in `index.html:209-221`, into `marker.bindPopup()`.
- **User enumeration** on login (High #4), by message content and by response timing.
- **Debug mode** (Critical #2) reachable in combination with multiple unhandled-exception paths (High #5).

**Potential / needs more context to confirm:**
- **Unrestricted file upload / content-type trust** (High #3) — extension-only validation plus client-supplied Content-Type. Real-world severity depends on how Supabase's bucket is configured (public bucket serving arbitrary content-types is the risky configuration; this can't be fully verified from the code alone).
- **Missing security headers / cookie flags** (Medium #18) — standard hardening gap, not an active exploit by itself.
- I looked specifically for SQL injection: **not found**. Every query goes through SQLAlchemy's `db.select(...).where(...)` with bound parameters (`app.py:71,164,190,216`) — no raw string-built SQL anywhere. This is solid.
- I looked for CSRF gaps: Flask-WTF's `FlaskForm` auto-issues/validates CSRF tokens for every POST form in this app (register/login/report all go through `render_form`), so standard form CSRF looks covered, contingent on `SECRET_KEY` actually being set in the environment (I can't verify `.env` contents — flagging as "verify this exists," since a missing `SECRET_KEY` would break sessions/CSRF entirely rather than silently disable them).
- Secrets: no hardcoded API keys, passwords, or tokens found in any file — all credentials are correctly sourced from environment variables via `os.environ.get`/`_get_clean_env`. Good practice already in place.

---

## ⚡ Performance Issues

Ranked by impact:

1. **N+1 query on the homepage** (Medium #6, `app.py:71-93`) — biggest impact, because `/` is the highest-traffic route and the query count scales with total reports, not a fixed number.
2. **Full in-memory file read for every upload with no size cap** (Medium #12, `app.py:125`) — memory pressure under concurrent large uploads.
3. **Two full CSS frameworks + several unpinned/duplicate CDN assets** (Medium #15, #16) — extra page weight and requests, though minor at this app's current scale.

---

## 🗄️ Database Issues

- **N+1 relationship loading** — see Performance #1 / Medium #6.
- **`author_id` has no explicit `nullable=False`** and no `ondelete` policy (Low #30) — not currently exploitable (no delete-user route exists), but worth deciding explicitly before adding one.
- **No migration tooling** — `db.create_all()` only creates tables that don't yet exist; it will not alter an existing table if you add/change a column later (Low #31).
- **`User.password` nullable=True** creates a latent crash path in `login()` if a null-password user ever exists (Low #29) — currently unreachable through the app's own code paths.
- **Race condition on unique email** — see Medium #13; the DB's `unique=True` constraint is correct and does its job, but the app doesn't handle the resulting `IntegrityError` gracefully.
- Foreign keys, relationships (`User.report` ↔ `Report.author`), and the overall schema shape are otherwise sound and correctly wired (`back_populates` on both sides is correct).

---

## 📦 Dependency Issues

No `requirements.txt`, `pyproject.toml`, or lockfile exists anywhere in the provided files, so dependency **versions cannot be verified or audited for known vulnerabilities** — this needs an external check (e.g. `pip-audit`) once a manifest exists. Based solely on what's actually imported across the codebase, the project depends on: `flask`, `flask-bootstrap` (Bootstrap5), `flask-sqlalchemy`, `flask-login`, `flask-wtf`, `flask-mail`, `flask-ckeditor`, `sqlalchemy`, `werkzeug`, `supabase`, `python-dotenv`, `itsdangerous`.

- **`flask-ckeditor` appears to be an unused dependency** — only `CKEditorField` is imported (`form.py:5`), and it's never used in any form field (see Unnecessary Code). Worth removing if a manifest exists, or simply never adding it to one.
- I cannot verify whether any of these have known CVEs without knowing exact installed versions — recommend adding a proper dependency manifest and running a vulnerability scanner as a follow-up.

---

## 🏗️ Architecture Issues

- **`app.js` mixes a dead client-only prototype with the two functions that are actually live** (sidebar + scroll header) in a single 500+ line file. This makes the file misleading to anyone who reads it expecting it to reflect current behavior (see Unnecessary Code / Bug #2).
- **Two CSS frameworks loaded simultaneously** (Medium #16) is a structural choice worth revisiting, not just a performance nit — it affects long-term styling maintainability (specificity fights between Bootstrap's form component styles and Tailwind utilities).
- Everything else — single `app.py` entry point, forms in `form.py`, email/token logic in `verification.py`, templates with a shared `header.html`/`footer.html` — is a reasonable, simple structure for the current size of this app. I'm not recommending a blueprint/factory-pattern restructure; the app is small enough that it isn't solving a real problem yet.

---

## ✅ What's Already Good

- **No SQL injection surface** — every query uses SQLAlchemy's parameterized `select()`/`where()`, never raw/string-built SQL.
- **No hardcoded secrets** anywhere in the reviewed files — all credentials are correctly sourced from environment variables, with a thoughtful `_get_clean_env` helper (`config.py:6-10`) that strips stray quotes from `.env` values, a real (if small) papercut many projects don't bother handling.
- **Passwords are hashed properly** with `pbkdf2:sha256` and a salt (`app.py:197`), and compared via `check_password_hash`, not manual comparison.
- **CSRF is wired up correctly** through Flask-WTF's `FlaskForm` on every state-changing form.
- **Server-side geolocation validation** in `report()` (`app.py:108-117`) — the app doesn't trust the client blindly; it checks presence and validates the values actually parse as floats before using them.
- **Random, collision-resistant filenames** for uploads (`uuid.uuid4()`, `app.py:121`) — avoids path traversal and filename-collision issues entirely, a common file-upload mistake this code doesn't make.
- **`FileRequired()`/`FileAllowed()`** are present and correctly wired on the upload field — the gap identified (High #3) is about content verification, not that validation is missing altogether.
- **`SelectField.cause` correctly constrains submitted values** to the predefined choice list (WTForms validates against `choices` by default), so — unlike `description`/`author` — it isn't itself an XSS injection vector.
- Route structure and `login_required`/`current_user` usage are correctly applied where they matter (`/report` is properly gated; ownership of new reports is always taken from `current_user.id`, never from client input, so there's no IDOR on report creation).

---

## 🎯 Recommended Fix Order

**1. Fix immediately (before this touches real users):**
- Fix the stored XSS (Critical #1).
- Turn off `debug=True` / make it environment-driven (Critical #2).
- Wrap the three `db.session.commit()` calls in try/except with rollback (High #5).

**2. Fix before deployment:**
- Generic login error message + timing fix (High #4).
- Server-side image content verification (High #3).
- Add a resend-verification path (Medium #10, #11).
- Fix the N+1 query on the homepage (Medium #6).
- Set `MAX_CONTENT_LENGTH`, `SESSION_COOKIE_SECURE` (Medium #12, #18).
- Make the DB URI environment-configurable (Medium #14).

**3. Fix soon:**
- Remove the dead `app.js` prototype code / fix the fake stats counter (Medium #8).
- Handle the signup race condition (Medium #13).
- Fix the missing `img` param on error re-renders (Medium #7).
- Pin/dedupe CDN assets, fix hardcoded static paths (Medium #15, #17).
- Add a password length validator (Medium #9).

**4. Cleanup when convenient:**
- Everything in 🔵 Low Priority / Cleanup and 🗑️ Unnecessary Code.

---

## Top 10 Things I Should Fix First

1. **Stored XSS in map popups** (`index.html:209-221,252`) — escape/DOM-build the popup content instead of interpolating raw user data into HTML.
2. **`app.run(debug=True)`** (`app.py:232`) — make it environment-driven, off by default.
3. **No error handling around `db.session.commit()`** (`app.py:150,200,219`) — add try/except + rollback everywhere it's called.
4. **User enumeration on login** (`app.py:168-180`) — one generic error message for bad email vs. bad password.
5. **Unrestricted file-upload content validation** (`app.py:119-133`, `form.py:19`) — verify actual image bytes; don't trust client-supplied MIME type for storage Content-Type.
6. **No way to resend a verification email** (`app.py:172-173,191-193`) — real users will get permanently stuck on an expired token.
7. **N+1 query on the homepage** (`app.py:71-93`) — eager-load `Report.author`.
8. **Fake "Reports Submitted" counter + ~85% dead code in `app.js`** — remove the prototype leftovers; compute the real count server-side.
9. **Signup race condition** (`app.py:190-200`) — catch the `IntegrityError` instead of letting it 500.
10. **Missing `img` param on `report()` error re-renders** (`app.py:110,117,138`) — small, but a real, easily reproduced UI bug.

---

*Nothing in this codebase was modified. All line numbers reference the current state of the files as provided.*
