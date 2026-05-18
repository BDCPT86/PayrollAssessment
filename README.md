# Payroll Administrator Assessment Platform

A self-contained web-based assessment platform for screening Payroll Administrator candidates. Candidates complete a timed test via a unique invite link; reviewers score submissions against a built-in memorandum through a separate password-protected portal.

---

## Table of Contents

- [Overview](#overview)
- [HR & Reviewer Guide](#hr--reviewer-guide)
  - [Accessing the Reviewer Portal](#accessing-the-reviewer-portal)
  - [Creating an Invite](#creating-an-invite)
  - [Reviewing a Submission](#reviewing-a-submission)
  - [Scoring](#scoring)
  - [Downloading a PDF Report](#downloading-a-pdf-report)
  - [Managing Invites](#managing-invites)
- [Developer Guide](#developer-guide)
  - [File Structure](#file-structure)
  - [Tech Stack](#tech-stack)
  - [First-Time Setup](#first-time-setup)
  - [Configuration](#configuration)
  - [Supabase Schema](#supabase-schema)
  - [RLS Policy Summary](#rls-policy-summary)
  - [Reviewer Authentication](#reviewer-authentication)
  - [Updating Questions](#updating-questions)
  - [Updating Memo Answers](#updating-memo-answers)
  - [Deployment](#deployment)
  - [Security Notes](#security-notes)

---

## Overview

| | |
|---|---|
| **Assessment length** | 23 questions across 6 sections |
| **Time limit** | 90 minutes |
| **Total marks** | 70 (+ 10 bonus) |
| **Access model** | Invite-only — each candidate receives a unique single-use link |
| **Reviewer access** | Separate page (`reviewer.html`) — Supabase Auth login required |
| **Data storage** | Supabase (PostgreSQL) |
| **Hosting** | Any static host — GitHub Pages, Cloudflare Pages, Netlify, etc. |

**Sections:**

| Section | Title | Marks |
|---|---|---|
| A | General Knowledge | 15 |
| B | Payroll Calculations | 15 |
| C | Labour Law & Compliance | 12 |
| D | Scenario-Based Questions | 15 |
| E | Excel & Systems Knowledge | 13 |
| ★ | Bonus Questions | 10 |

---

## HR & Reviewer Guide

### Accessing the Reviewer Portal

1. Navigate to `reviewer.html` on the hosted site.
2. Enter your reviewer email address and password.
3. If this is your first time logging in, follow the [First Login](#first-login) steps below.

#### First Login

Your account is created by the system administrator via Supabase. You will receive an invite email with a link. Clicking that link takes you back to `reviewer.html` where you will be prompted to set your password. After setting it, you are logged in immediately.

> **Session:** Your login persists for 1 hour and refreshes automatically while you are active. Closing the browser and reopening will restore your session without needing to log in again.

---

### Creating an Invite

Each candidate requires a unique invite link before they can start the assessment.

1. Log in to the Reviewer Portal.
2. Click the **Invites** tab.
3. Fill in the candidate's **name** and **email address**. The note field is optional (e.g. "Referred by HR").
4. Click **+ Create Invite**.
5. A unique URL will appear — copy it and send it to the candidate via email or WhatsApp.

> **Important:** Each invite can only be used once. The moment the candidate clicks **Begin Assessment**, the invite is permanently marked as used. A second attempt with the same link will be blocked.

---

### Reviewing a Submission

1. Log in to the Reviewer Portal.
2. Click the **Submissions** tab.
3. Each card shows the candidate's name, email, position, submission time, and completion percentage.
4. Click any card to open the full review panel.
5. Each question shows:
   - **Left column** — the candidate's answer
   - **Right column** — the memorandum / model answer

---

### Scoring

- Each question has a marks input field at the bottom.
- Enter the marks awarded (between 0 and the question maximum).
- The **Score Summary** at the top updates in real time as you score.
- Section subtotals and a percentage are calculated automatically.
- Use the **Reviewer Comment** field next to each question for notes.
- An **Overall Reviewer Notes** text area is available at the bottom of the review panel.

> Scores are **not saved to the database** — they exist for the current session only. Use the PDF Report to preserve a scored copy.

---

### Downloading a PDF Report

- While viewing a candidate's review panel, click **⬇ PDF Report** in the top bar.
- The PDF contains the candidate's details, all their answers, and can be printed or filed.

> The memorandum answers are **not included** in the PDF — it contains candidate answers only.

---

### Managing Invites

In the **Invites** tab you can see all created invites and their status:

| Status | Meaning |
|---|---|
| **Pending** | Not yet used — candidate has not started the test |
| **Used** | Candidate has started (and presumably completed) the test |
| **Expired** | The invite's expiry date has passed |

- Click **Copy Link** on any pending invite to copy the URL again.
- Click **Revoke** to cancel an invite before it is used. The candidate's link will stop working immediately.

---

## Developer Guide

### File Structure

```
assessment/
├── index.html                        Candidate assessment page
├── reviewer.html                     Reviewer portal
├── css/
│   ├── main.css                      Shared styles (candidate + reviewer)
│   └── reviewer.css                  Reviewer-only styles
├── js/
│   ├── config.js                     Supabase credentials (single config point)
│   ├── questions.js                  Question data — no memo answers
│   ├── memo.js                       Memo answers — loaded by reviewer.html ONLY
│   ├── assessment.js                 Candidate logic (timer, sections, Supabase save)
│   ├── pdf.js                        Shared PDF generation (jsPDF)
│   └── reviewer.js                   Reviewer logic (auth, submissions, invites)
├── assessment_migration.sql          Creates assessment_submissions table
├── assessment_invites_migration.sql  Creates assessment_invites table
└── reviewer_rls_migration.sql        Locks down RLS to authenticated reviewer
```

> **Security note:** `memo.js` is intentionally only loaded in `reviewer.html`. It is never referenced in `index.html`, so memo answers are never sent to a candidate's browser.

---

### Tech Stack

| Layer | Technology |
|---|---|
| Frontend | Vanilla HTML, CSS, JavaScript (no framework) |
| Database | Supabase (PostgreSQL) |
| Auth | Supabase Auth (email + password) |
| PDF | [jsPDF](https://github.com/parallax/jsPDF) via CDN |
| Fonts | Google Fonts (Cormorant Garamond, DM Sans, DM Mono) |
| Hosting | GitHub Pages (static) |

---

### First-Time Setup

#### 1. Supabase — create tables

Run the three SQL migration files in order in your Supabase SQL Editor
(**Dashboard → SQL Editor → New Query**):

```
1. assessment_migration.sql
2. assessment_invites_migration.sql
3. reviewer_rls_migration.sql
```

#### 2. Configure the project

Edit `js/config.js`:

```js
const CONFIG = {
  supabaseUrl:   'https://YOUR_PROJECT.supabase.co',
  supabaseAnon:  'YOUR_ANON_KEY',
  supabaseTable: 'assessment_submissions',
  timerMinutes:  90,
};
```

Both values are found in **Supabase Dashboard → Settings → API**.

#### 3. Create a reviewer account

In **Supabase Dashboard → Authentication → Users → Invite User**, enter the reviewer's email address. They will receive an email — clicking the link takes them to `reviewer.html` where they set their password.

#### 4. Set the Site URL

In **Supabase Dashboard → Authentication → URL Configuration**, set the **Site URL** to the deployed URL of your site (e.g. `https://yourorg.github.io/assessment`). This ensures invite and password-reset links redirect correctly.

#### 5. Restrict allowed origins (recommended)

In **Supabase Dashboard → Settings → API → Allowed origins**, add your deployed domain. This prevents the anon key from being used from other origins.

#### 6. Deploy

Push the folder to your static host. No build step required.

---

### Configuration

All configurable values live in `js/config.js`:

| Key | Description |
|---|---|
| `supabaseUrl` | Your Supabase project URL |
| `supabaseAnon` | Your Supabase anon/public key |
| `supabaseTable` | Table name for submissions (default: `assessment_submissions`) |
| `timerMinutes` | Assessment time limit in minutes (default: `90`) |

---

### Supabase Schema

#### `assessment_submissions`

| Column | Type | Description |
|---|---|---|
| `id` | uuid | Primary key, auto-generated |
| `submitted_at` | timestamptz | Submission timestamp, auto-set |
| `name` | text | Candidate full name |
| `email` | text | Candidate email |
| `position` | text | Position applied for |
| `employer` | text | Previous employer |
| `answers` | jsonb | All answers keyed by question ID (e.g. `{"q1": "...", "q2": "..."}`) |
| `answered_count` | int | Number of questions answered |
| `total_questions` | int | Total questions in the assessment |

#### `assessment_invites`

| Column | Type | Description |
|---|---|---|
| `id` | uuid | Primary key, auto-generated |
| `email` | text | Candidate email (must match on test start) |
| `name` | text | Candidate name (optional, pre-fills the form) |
| `note` | text | Internal reviewer note |
| `token` | text | Unique invite token (UUID), used in the invite URL |
| `created_at` | timestamptz | When the invite was created |
| `used_at` | timestamptz | Set the moment the candidate clicks Begin — null if unused |
| `expires_at` | timestamptz | Optional hard expiry date |

---

### RLS Policy Summary

| Table | Role | Operations | Purpose |
|---|---|---|---|
| `assessment_submissions` | anon | INSERT | Candidate submits |
| `assessment_submissions` | authenticated | SELECT | Reviewer reads |
| `assessment_invites` | anon | SELECT, UPDATE | Candidate validates token + marks used |
| `assessment_invites` | authenticated | SELECT, INSERT, DELETE | Reviewer manages invites |

---

### Reviewer Authentication

The reviewer portal uses **Supabase Auth** (email + password). There is no hardcoded password anywhere in the codebase.

**Session flow:**
1. Reviewer enters email + password → Supabase returns a JWT access token and refresh token
2. Tokens are stored in `localStorage` under `pa_reviewer_session`
3. Access token expires after 1 hour — `reviewer.js` refreshes it automatically before expiry
4. On page load, the saved session is restored if still valid
5. Sign Out clears localStorage and calls the Supabase logout endpoint

**Adding a new reviewer:**
Supabase Dashboard → Authentication → Users → Invite User → enter their email.

**Removing a reviewer:**
Supabase Dashboard → Authentication → Users → find the user → Delete.

**Resetting a reviewer password:**
Supabase Dashboard → Authentication → Users → find the user → Send password reset. The link in the email will redirect to `reviewer.html` and prompt for a new password.

---

### Updating Questions

Questions live in `js/questions.js`. Each question object:

```js
{
  id:          'q1',          // unique ID — must match the key in memo.js
  num:         1,             // display number
  marks:       3,             // maximum marks
  text:        'Question...',
  sub:         '<ul>...</ul>',// optional HTML sub-text (e.g. a list)
  context:     '<strong>...</strong>', // optional scenario box
  placeholder: 'Type your answer here…',
}
```

> If you add or remove questions, update the `info-stat` counts in `index.html` (questions, minutes, total marks) and add a corresponding entry to `memo.js`.

---

### Updating Memo Answers

Memo answers live in `js/memo.js` as a plain object:

```js
const MEMO = {
  q1: `Your model answer for question 1...`,
  q2: `Your model answer for question 2...`,
  // ...
};
```

Keys must match the `id` fields in `questions.js`. This file is **only loaded by `reviewer.html`** — never by `index.html`.

---

### Deployment

The project is a fully static site — no server, no build step.

#### GitHub Pages

1. Push the `assessment/` folder contents to a GitHub repository.
2. Go to **Repository → Settings → Pages**.
3. Set **Source** to `Deploy from a branch`, select `main`, folder `/` (root) or `/docs` depending on your repo structure.
4. Update **Supabase Site URL** to the GitHub Pages URL.

#### Cloudflare Pages

1. Connect the repository in **Cloudflare Pages → Create application**.
2. No build command needed — set the output directory to the root.
3. Update **Supabase Site URL** to the Cloudflare Pages URL.

---

### Security Notes

| Concern | Mitigation |
|---|---|
| Memo answers exposed to candidates | `memo.js` is only loaded in `reviewer.html` — never referenced in `index.html` |
| Supabase anon key in source | Intentional — Supabase's security model. The anon key is public by design; RLS policies enforce access control |
| No service role key in code | Correct — never put the service role key in client-side code |
| Reviewer password in source | Removed — auth is handled entirely by Supabase Auth (JWT) |
| Candidates reading other submissions | Blocked by RLS — anon role has no SELECT on `assessment_submissions` |
| Repeat test attempts | Blocked at two levels: invite token marked used on test start; email checked against existing submissions |
| Invite link reuse | Token is marked `used_at` the moment Begin is clicked — subsequent attempts are rejected |
| Session hijacking | Tokens stored in localStorage — acceptable for this use case; access tokens expire after 1 hour |
