// ─── Session & state ──────────────────────────────────────────────────────────
const SESSION_KEY = 'pa_reviewer_session';

let session  = null;   // { accessToken, refreshToken, expiresAt, email }

const reviewer = {
  submissions: [],
  invites:     [],
  current:     null,
  lastInviteUrl: '',
};

// ─── Init ─────────────────────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
  ['auth-email','auth-password'].forEach(id => {
    document.getElementById(id)?.addEventListener('keydown', e => {
      if (e.key === 'Enter') signIn();
    });
  });
  ['new-password','confirm-password'].forEach(id => {
    document.getElementById(id)?.addEventListener('keydown', e => {
      if (e.key === 'Enter') setPassword();
    });
  });

  // ── Handle invite / password-reset callback from Supabase email link ────────
  // Supabase redirects to [site_url]#access_token=xxx&type=invite (or recovery)
  const hash        = new URLSearchParams(window.location.hash.replace(/^#/, ''));
  const accessToken = hash.get('access_token');
  const refreshToken= hash.get('refresh_token');
  const type        = hash.get('type');

  if (accessToken && (type === 'invite' || type === 'recovery')) {
    // Clear tokens from URL bar so they can't be copy-pasted
    window.history.replaceState(null, '', window.location.pathname);
    showSetPasswordForm(accessToken, refreshToken, type);
  } else {
    tryRestoreSession();
  }
});

// ─── Set password (invite / password reset callback) ─────────────────────────
let _pendingSession = null;

function showSetPasswordForm(accessToken, refreshToken, type) {
  _pendingSession = { accessToken, refreshToken };
  if (type === 'recovery') {
    document.getElementById('set-pw-heading').textContent = 'Reset Your Password';
    document.getElementById('set-pw-sub').textContent     = 'Enter a new password for your reviewer account.';
  }
  document.getElementById('auth-gate').style.display   = 'none';
  document.getElementById('set-pw-gate').style.display = 'flex';
  setTimeout(() => document.getElementById('new-password').focus(), 100);
}

async function setPassword() {
  const pw1   = document.getElementById('new-password').value;
  const pw2   = document.getElementById('confirm-password').value;
  const errEl = document.getElementById('set-pw-error');
  const btn   = document.getElementById('btn-set-pw');

  errEl.style.display = 'none';

  if (pw1.length < 8) {
    errEl.textContent = 'Password must be at least 8 characters.';
    errEl.style.display = 'block'; return;
  }
  if (pw1 !== pw2) {
    errEl.textContent = 'Passwords do not match.';
    errEl.style.display = 'block'; return;
  }

  btn.textContent = 'Setting password…'; btn.disabled = true;

  try {
    const res = await fetch(`${CONFIG.supabaseUrl}/auth/v1/user`, {
      method:  'PUT',
      headers: {
        'apikey':        CONFIG.supabaseAnon,
        'Authorization': `Bearer ${_pendingSession.accessToken}`,
        'Content-Type':  'application/json',
      },
      body: JSON.stringify({ password: pw1 }),
    });

    if (!res.ok) {
      const err = await res.json();
      throw new Error(err.message || 'Failed to set password');
    }

    // Save the session tokens we already have (no need to sign in again)
    saveSession(
      { access_token: _pendingSession.accessToken, refresh_token: _pendingSession.refreshToken, expires_in: 3600 },
      null
    );
    document.getElementById('set-pw-gate').style.display = 'none';
    showPortal();
    showToast('Password set — welcome to the Reviewer Portal.', 'success');

  } catch (e) {
    errEl.textContent   = e.message;
    errEl.style.display = 'block';
    btn.textContent = 'Set Password & Sign In →'; btn.disabled = false;
  }
}

// ─── Auth: sign in ────────────────────────────────────────────────────────────
async function signIn() {
  const email    = document.getElementById('auth-email').value.trim();
  const password = document.getElementById('auth-password').value;
  const errEl    = document.getElementById('auth-error');
  const loadEl   = document.getElementById('auth-loading');
  const btn      = document.getElementById('btn-signin');

  errEl.style.display  = 'none';
  loadEl.style.display = 'block';
  btn.disabled = true;

  try {
    const res = await fetch(
      `${CONFIG.supabaseUrl}/auth/v1/token?grant_type=password`,
      {
        method:  'POST',
        headers: { 'apikey': CONFIG.supabaseAnon, 'Content-Type': 'application/json' },
        body:    JSON.stringify({ email, password }),
      }
    );

    const data = await res.json();

    if (!res.ok) {
      throw new Error(data.error_description || data.msg || 'Invalid credentials');
    }

    saveSession(data, email);
    showPortal();

  } catch (e) {
    errEl.textContent    = e.message;
    errEl.style.display  = 'block';
    loadEl.style.display = 'none';
    btn.disabled = false;
    document.getElementById('auth-password').value = '';
    document.getElementById('auth-password').focus();
  }
}

// ─── Auth: sign out ───────────────────────────────────────────────────────────
async function signOut() {
  // Best-effort server-side sign out
  if (session?.accessToken) {
    fetch(`${CONFIG.supabaseUrl}/auth/v1/logout`, {
      method:  'POST',
      headers: authHeaders(),
    }).catch(() => {});
  }
  clearSession();
  showAuthGate();
}

// ─── Auth: token refresh ──────────────────────────────────────────────────────
async function refreshSession() {
  if (!session?.refreshToken) return false;
  try {
    const res = await fetch(
      `${CONFIG.supabaseUrl}/auth/v1/token?grant_type=refresh_token`,
      {
        method:  'POST',
        headers: { 'apikey': CONFIG.supabaseAnon, 'Content-Type': 'application/json' },
        body:    JSON.stringify({ refresh_token: session.refreshToken }),
      }
    );
    if (!res.ok) return false;
    const data = await res.json();
    saveSession(data, session.email);
    return true;
  } catch {
    return false;
  }
}

// ─── Auth: session persistence ────────────────────────────────────────────────
function saveSession(data, email) {
  session = {
    accessToken:  data.access_token,
    refreshToken: data.refresh_token,
    expiresAt:    Date.now() + (data.expires_in * 1000),
    email:        email || session?.email || '',
  };
  localStorage.setItem(SESSION_KEY, JSON.stringify(session));
}

function clearSession() {
  session = null;
  localStorage.removeItem(SESSION_KEY);
}

function tryRestoreSession() {
  try {
    const saved = JSON.parse(localStorage.getItem(SESSION_KEY));
    if (!saved?.accessToken) return;
    session = saved;

    // If token expires within 60 seconds, try to refresh now
    if (session.expiresAt < Date.now() + 60_000) {
      refreshSession().then(ok => {
        if (ok) showPortal();
        else    showAuthGate();
      });
    } else {
      showPortal();
    }
  } catch {
    showAuthGate();
  }
}

// ─── Auth: headers & fetch wrapper ───────────────────────────────────────────
function authHeaders(extra = {}) {
  return {
    'apikey':        CONFIG.supabaseAnon,
    'Authorization': `Bearer ${session.accessToken}`,
    'Content-Type':  'application/json',
    ...extra,
  };
}

// Authenticated fetch — auto-refreshes on 401
async function authFetch(url, options = {}) {
  // Proactively refresh if within 60s of expiry
  if (session && session.expiresAt < Date.now() + 60_000) {
    const ok = await refreshSession();
    if (!ok) { signOut(); throw new Error('Session expired. Please sign in again.'); }
  }

  options.headers = { ...authHeaders(), ...(options.headers || {}) };
  let res = await fetch(url, options);

  // If 401, try one refresh and retry
  if (res.status === 401) {
    const ok = await refreshSession();
    if (!ok) { signOut(); throw new Error('Session expired. Please sign in again.'); }
    options.headers = { ...authHeaders(), ...(options.headers || {}) };
    res = await fetch(url, options);
  }

  return res;
}

// ─── UI: show / hide portal ───────────────────────────────────────────────────
function showPortal() {
  document.getElementById('auth-gate').style.display         = 'none';
  document.getElementById('set-pw-gate').style.display       = 'none';
  document.getElementById('review-topbar').style.display     = 'flex';
  document.getElementById('reviewer-tab-nav').style.display  = 'block';
  document.getElementById('reviewer-wrap').style.display     = 'block';
  showTab('submissions');
}

function showAuthGate() {
  clearSession();
  document.getElementById('auth-gate').style.display         = 'flex';
  document.getElementById('review-topbar').style.display     = 'none';
  document.getElementById('reviewer-tab-nav').style.display  = 'none';
  document.getElementById('reviewer-wrap').style.display     = 'none';
  document.getElementById('auth-error').style.display        = 'none';
  document.getElementById('auth-loading').style.display      = 'none';
  document.getElementById('btn-signin').disabled             = false;
  document.getElementById('auth-email').focus();
}

// ─── Tab navigation ───────────────────────────────────────────────────────────
function showTab(tab) {
  document.getElementById('tab-btn-submissions').classList.toggle('active', tab === 'submissions');
  document.getElementById('tab-btn-invites').classList.toggle('active', tab === 'invites');

  document.getElementById('view-submissions').style.display = 'none';
  document.getElementById('view-review').style.display      = 'none';
  document.getElementById('view-invites').style.display     = 'none';

  document.getElementById('btn-back').style.display = 'none';
  document.getElementById('btn-pdf').style.display  = 'none';
  document.getElementById('review-candidate-name-top').textContent = '';
  document.getElementById('review-live-score').textContent         = '';

  if (tab === 'submissions') {
    document.getElementById('view-submissions').style.display = 'block';
    loadSubmissions();
  } else {
    document.getElementById('view-invites').style.display = 'block';
    loadInvites();
  }
}

// ─── Submissions ──────────────────────────────────────────────────────────────
async function loadSubmissions() {
  document.getElementById('sub-loading').style.display      = 'block';
  document.getElementById('sub-empty').style.display        = 'none';
  document.getElementById('sub-error').style.display        = 'none';
  document.getElementById('submissions-list').style.display = 'none';

  try {
    const res = await authFetch(
      `${CONFIG.supabaseUrl}/rest/v1/${CONFIG.supabaseTable}?select=*&order=submitted_at.desc`
    );
    if (!res.ok) throw new Error(await res.text());
    reviewer.submissions = await res.json();

    document.getElementById('sub-loading').style.display = 'none';
    document.getElementById('sub-count').textContent =
      `${reviewer.submissions.length} submission${reviewer.submissions.length !== 1 ? 's' : ''}`;

    if (!reviewer.submissions.length) {
      document.getElementById('sub-empty').style.display = 'block'; return;
    }
    document.getElementById('submissions-list').style.display = 'block';
    renderSubmissions();

  } catch (e) {
    document.getElementById('sub-loading').style.display = 'none';
    document.getElementById('sub-error').style.display   = 'block';
    document.getElementById('sub-error').textContent     = `Failed to load: ${e.message}`;
  }
}

function renderSubmissions() {
  const list = document.getElementById('submissions-list');
  list.innerHTML = '';
  reviewer.submissions.forEach(row => {
    const pct      = Math.round((row.answered_count / row.total_questions) * 100);
    const date     = new Date(row.submitted_at).toLocaleString('en-ZA', { dateStyle: 'medium', timeStyle: 'short' });
    const initials = row.name.split(' ').map(w => w[0]).join('').slice(0,2).toUpperCase();
    const hasReview = row.review_data?.total != null;
    const savedTotal = row.review_data?.total ?? '—';
    const grandMax   = SECTIONS.reduce((s, sec) => s + sec.totalMarks, 0);

    const card = document.createElement('div');
    card.className = 'sub-card';
    card.innerHTML = `
      <div class="sub-avatar">${initials}</div>
      <div class="sub-info">
        <div class="sub-name">${esc(row.name)}</div>
        <div class="sub-meta">${esc(row.email)}${row.position ? ' · ' + esc(row.position) : ''}${row.employer ? ' · ' + esc(row.employer) : ''}</div>
        <div class="sub-meta" style="margin-top:3px;">Submitted: ${date}</div>
      </div>
      <div class="sub-stat">
        <div class="sub-pct">${pct}%</div>
        <div class="sub-pct-lbl">${row.answered_count}/${row.total_questions} answered</div>
        ${hasReview
          ? `<div style="margin-top:4px;font-family:var(--font-mono);font-size:13px;color:var(--navy);font-weight:600;">${savedTotal}/${grandMax}</div>
             <div style="margin-top:4px"><span class="sub-badge reviewed">Reviewed ✓</span></div>`
          : `<div style="margin-top:6px"><span class="sub-badge new">Review →</span></div>`
        }
      </div>
    `;
    card.onclick = () => openReview(row);
    list.appendChild(card);
  });
}

// ─── Review panel ─────────────────────────────────────────────────────────────
function openReview(submission) {
  reviewer.current = submission;
  document.getElementById('view-submissions').style.display = 'none';
  document.getElementById('view-review').style.display      = 'block';
  document.getElementById('btn-back').style.display         = 'inline-flex';
  document.getElementById('btn-pdf').style.display          = 'inline-flex';
  document.getElementById('review-candidate-name-top').textContent = submission.name;
  buildReviewPanel(submission);
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

function backToList() {
  clearTimeout(_saveTimer);
  document.getElementById('view-review').style.display      = 'none';
  document.getElementById('view-submissions').style.display = 'block';
  document.getElementById('btn-back').style.display         = 'none';
  document.getElementById('btn-pdf').style.display          = 'none';
  document.getElementById('review-candidate-name-top').textContent = '';
  document.getElementById('review-live-score').textContent         = '';
  // Remove save bar so it's freshly created next time
  document.getElementById('review-save-bar')?.remove();
}

function buildReviewPanel(sub) {
  const saved = sub.review_data || {};

  document.getElementById('review-cand-info').innerHTML = `
    <div class="rcand-card"><div class="label">Candidate</div><div class="value">${esc(sub.name)}</div></div>
    <div class="rcand-card"><div class="label">Email</div><div class="value">${esc(sub.email)}</div></div>
    <div class="rcand-card"><div class="label">Position</div><div class="value">${esc(sub.position || '—')}</div></div>
    <div class="rcand-card"><div class="label">Submitted</div><div class="value">${new Date(sub.submitted_at).toLocaleString('en-ZA',{dateStyle:'medium',timeStyle:'short'})}</div></div>
  `;

  buildSectionScoreCards();

  const container = document.getElementById('review-questions-container');
  container.innerHTML = '';

  SECTIONS.forEach((sec, si) => {
    const isFirst = si === 0;

    // ── Section header (clickable toggle) ──────────────────────────────────
    const hdr = document.createElement('div');
    hdr.className = 'review-section-header';
    hdr.dataset.section = si;
    hdr.innerHTML = `
      <h3>Section ${sec.id}: ${sec.title}</h3>
      <div class="review-section-meta">
        <span class="review-section-score-pill" id="sec-hdr-marks-${si}">
          0 / ${sec.totalMarks}
        </span>
        <span class="section-toggle-icon ${isFirst ? 'open' : ''}" id="sec-toggle-icon-${si}">▼</span>
      </div>
    `;
    hdr.onclick = () => toggleSection(si);
    container.appendChild(hdr);

    // ── Section body (collapsible) ──────────────────────────────────────────
    const body = document.createElement('div');
    body.className = `review-section-body ${isFirst ? 'open' : ''}`;
    body.id = `sec-body-${si}`;

    sec.questions.forEach((q, qi) => {
      const candidateAns = (sub.answers  || {})[q.id] || '';
      const memoAns      = MEMO[q.id] || '(No memo answer defined)';
      const savedScore   = (saved.scores   || {})[q.id] ?? 0;
      const savedComment = (saved.comments || {})[q.id] || '';

      const card = document.createElement('div');
      card.className = 'review-q-card';
      card.innerHTML = `
        <div class="review-q-text">Q${q.num}: ${q.text}${q.sub ? ' ' + q.sub : ''}</div>
        ${q.context ? `<div class="q-context-box" style="margin-bottom:10px;font-size:13px;">${q.context}</div>` : ''}
        <div class="review-columns">
          <div class="review-answer-box answer-candidate">
            <div class="answer-label">Candidate's Answer</div>
            <div class="answer-text ${!candidateAns.trim() ? 'empty' : ''}">${esc(candidateAns.trim()) || '(No answer provided)'}</div>
          </div>
          <div class="review-answer-box answer-memo">
            <div class="answer-label">Memorandum / Model Answer</div>
            <div class="answer-text">${esc(memoAns)}</div>
          </div>
        </div>
        <div class="review-scoring">
          <label>Marks awarded:</label>
          <input type="number" class="score-input" id="score-${q.id}"
            min="0" max="${q.marks}" value="${savedScore}"
            oninput="onScoreInput()">
          <span class="score-max">/ ${q.marks}</span>
          <textarea class="reviewer-comment" id="comment-${q.id}"
            placeholder="Reviewer comment…" rows="1"
            oninput="onScoreInput()">${savedComment}</textarea>
        </div>
      `;
      body.appendChild(card);

      if (qi < sec.questions.length - 1) {
        const div = document.createElement('div');
        div.className = 'review-divider';
        body.appendChild(div);
      }
    });

    container.appendChild(body);
  });

  // Overall notes
  const notesWrap = document.createElement('div');
  notesWrap.style.marginTop = '32px';
  notesWrap.innerHTML = `
    <div class="form-group">
      <label>Overall Reviewer Notes</label>
      <textarea id="reviewer-overall-notes"
        placeholder="Overall assessment, observations, recommendation…"
        style="min-height:120px;"
        oninput="onScoreInput()">${esc(saved.notes || '')}</textarea>
    </div>
  `;
  container.appendChild(notesWrap);

  // Save bar
  let saveBar = document.getElementById('review-save-bar');
  if (!saveBar) {
    saveBar = document.createElement('div');
    saveBar.id = 'review-save-bar';
    saveBar.className = 'save-bar';
    saveBar.innerHTML = `
      <div class="save-status" id="save-status">
        <div class="dot"></div>
        <span id="save-status-text">No unsaved changes</span>
      </div>
      <button class="btn btn-primary btn-sm" id="btn-save-review" onclick="saveReview()">
        Save Review
      </button>
    `;
    document.getElementById('view-review').appendChild(saveBar);
  }

  updateScores();
  setSaveStatus('idle');
}

function toggleSection(si) {
  const body = document.getElementById(`sec-body-${si}`);
  const icon = document.getElementById(`sec-toggle-icon-${si}`);
  const isOpen = body.classList.contains('open');
  body.classList.toggle('open', !isOpen);
  icon.classList.toggle('open', !isOpen);
}

function buildSectionScoreCards() {
  const grid = document.getElementById('section-scores-grid');
  grid.innerHTML = '';
  SECTIONS.forEach((sec, i) => {
    const card = document.createElement('div');
    card.className = 'section-score-card';
    card.innerHTML = `
      <div class="sname">Section ${sec.id}: ${sec.title}</div>
      <div><span class="sval" id="sec-score-val-${i}">0</span><span class="sdenom"> / ${sec.totalMarks}</span></div>
      <div class="sbar"><div class="sbar-fill" id="sec-score-bar-${i}" style="width:0%"></div></div>
    `;
    grid.appendChild(card);
  });
}

function updateScores() {
  let grandTotal = 0, grandMax = 0;
  SECTIONS.forEach((sec, si) => {
    let secTotal = 0;
    sec.questions.forEach(q => {
      const el = document.getElementById('score-' + q.id);
      if (el) {
        const val = Math.max(0, Math.min(parseInt(el.value) || 0, q.marks));
        el.value = val;
        secTotal += val;
      }
    });
    grandTotal += secTotal;
    grandMax   += sec.totalMarks;
    const v = document.getElementById(`sec-score-val-${si}`);
    const b = document.getElementById(`sec-score-bar-${si}`);
    const h = document.getElementById(`sec-hdr-marks-${si}`);
    if (v) v.textContent = secTotal;
    if (b) b.style.width = Math.round((secTotal / sec.totalMarks) * 100) + '%';
    if (h) h.textContent = `${secTotal} / ${sec.totalMarks}`;
  });
  document.getElementById('total-score-val').textContent   = grandTotal;
  document.getElementById('total-score-max').textContent   = grandMax;
  document.getElementById('total-score-pct').textContent   = `${Math.round((grandTotal / grandMax) * 100)}%`;
  document.getElementById('review-live-score').textContent = `Score: ${grandTotal} / ${grandMax}`;
}

// ─── Save status ──────────────────────────────────────────────────────────────
function setSaveStatus(status, msg) {
  const el   = document.getElementById('save-status');
  const text = document.getElementById('save-status-text');
  const btn  = document.getElementById('btn-save-review');
  if (!el) return;
  el.className = `save-status ${status}`;
  const labels = {
    idle:    'No unsaved changes',
    unsaved: 'Unsaved changes',
    saving:  'Saving…',
    saved:   'All changes saved',
    error:   msg || 'Save failed — try again',
  };
  if (text) text.textContent = labels[status] || '';
  if (btn)  btn.disabled = (status === 'saving');
}

// ─── Debounced auto-save ──────────────────────────────────────────────────────
let _saveTimer = null;

function onScoreInput() {
  updateScores();
  setSaveStatus('unsaved');
  clearTimeout(_saveTimer);
  _saveTimer = setTimeout(() => saveReview(), 1500);
}

// ─── Save review to Supabase ──────────────────────────────────────────────────
async function saveReview() {
  if (!reviewer.current) return;
  clearTimeout(_saveTimer);
  setSaveStatus('saving');

  const scores   = {};
  const comments = {};
  let   total    = 0;

  SECTIONS.forEach(sec => {
    sec.questions.forEach(q => {
      const scoreEl   = document.getElementById('score-'   + q.id);
      const commentEl = document.getElementById('comment-' + q.id);
      const val = Math.max(0, Math.min(parseInt(scoreEl?.value) || 0, q.marks));
      scores[q.id]   = val;
      comments[q.id] = commentEl?.value || '';
      total += val;
    });
  });

  const review_data = {
    scores,
    comments,
    notes:       document.getElementById('reviewer-overall-notes')?.value || '',
    total,
    reviewed_at: new Date().toISOString(),
    reviewed_by: session?.email || '',
  };

  try {
    const res = await authFetch(
      `${CONFIG.supabaseUrl}/rest/v1/${CONFIG.supabaseTable}?id=eq.${reviewer.current.id}`,
      {
        method:  'PATCH',
        headers: { 'Prefer': 'return=minimal' },
        body:    JSON.stringify({ review_data }),
      }
    );
    if (!res.ok) throw new Error(await res.text());

    // Update local cache so re-opening doesn't lose data
    reviewer.current.review_data = review_data;
    const idx = reviewer.submissions.findIndex(s => s.id === reviewer.current.id);
    if (idx > -1) reviewer.submissions[idx].review_data = review_data;

    setSaveStatus('saved');
    // Fade back to idle after 3s
    setTimeout(() => setSaveStatus('idle'), 3000);

  } catch (e) {
    console.error('Save failed:', e);
    setSaveStatus('error', `Save failed: ${e.message}`);
  }
}

function downloadReviewPDF() {
  if (!reviewer.current) return;
  try {
    const result = buildPDF({ candidate: reviewer.current, answers: reviewer.current.answers || {} });
    triggerPdfDownload(result);
    showToast('PDF downloaded.', 'success');
  } catch (e) { showToast('PDF generation failed.', 'error'); }
}

// ─── Invite management ────────────────────────────────────────────────────────
async function loadInvites() {
  document.getElementById('invite-loading').style.display = 'block';
  document.getElementById('invite-empty').style.display   = 'none';
  document.getElementById('invites-list').innerHTML       = '';

  try {
    const res = await authFetch(
      `${CONFIG.supabaseUrl}/rest/v1/assessment_invites?select=*&order=created_at.desc`
    );
    if (!res.ok) throw new Error(await res.text());
    reviewer.invites = await res.json();

    document.getElementById('invite-loading').style.display = 'none';
    document.getElementById('invite-count').textContent =
      `${reviewer.invites.length} invite${reviewer.invites.length !== 1 ? 's' : ''}`;

    if (!reviewer.invites.length) {
      document.getElementById('invite-empty').style.display = 'block'; return;
    }
    renderInvites();

  } catch (e) {
    document.getElementById('invite-loading').innerHTML =
      `<span style="color:var(--red)">Failed to load invites: ${e.message}</span>`;
  }
}

function renderInvites() {
  const list = document.getElementById('invites-list');
  list.innerHTML = '';
  reviewer.invites.forEach(inv => {
    const isUsed    = !!inv.used_at;
    const isExpired = inv.expires_at && new Date(inv.expires_at) < new Date();
    const status    = isUsed ? 'used' : isExpired ? 'expired' : 'pending';
    const statusLabel = isUsed
      ? `Used ${new Date(inv.used_at).toLocaleDateString('en-ZA')}`
      : isExpired ? 'Expired' : 'Pending';
    const created = new Date(inv.created_at).toLocaleString('en-ZA', { dateStyle: 'medium', timeStyle: 'short' });
    const url     = buildInviteUrl(inv.token);

    const card = document.createElement('div');
    card.className = `invite-card ${status}`;
    card.innerHTML = `
      <div class="invite-info">
        <div class="invite-name">${esc(inv.name || 'Unnamed Candidate')}</div>
        <div class="invite-email">${esc(inv.email)}</div>
        <div class="invite-meta">Created: ${created}${inv.note ? ' · ' + esc(inv.note) : ''}</div>
      </div>
      <div style="display:flex;flex-direction:column;align-items:flex-end;gap:8px;flex-shrink:0;">
        <span class="invite-status ${status}">${statusLabel}</span>
        ${!isUsed ? `<button class="btn btn-sm btn-outline" style="font-size:11px;"
          onclick="copyUrl('${escAttr(url)}', this)">Copy Link</button>` : ''}
        <button class="btn btn-sm btn-outline"
          style="font-size:11px;color:var(--red);border-color:var(--red);"
          onclick="revokeInvite('${inv.id}', this)">Revoke</button>
      </div>
    `;
    list.appendChild(card);
  });
}

async function createInvite() {
  const name  = document.getElementById('invite-name').value.trim();
  const email = document.getElementById('invite-email').value.trim();
  const note  = document.getElementById('invite-note').value.trim();

  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    showToast('Please enter a valid candidate email.', 'error'); return;
  }

  const btn = document.getElementById('btn-create-invite');
  btn.textContent = 'Creating…'; btn.disabled = true;

  try {
    const res = await authFetch(
      `${CONFIG.supabaseUrl}/rest/v1/assessment_invites`,
      {
        method:  'POST',
        headers: { 'Prefer': 'return=representation' },
        body:    JSON.stringify({ name: name || null, email, note: note || null }),
      }
    );
    if (!res.ok) throw new Error(await res.text());
    const rows = await res.json();
    const url  = buildInviteUrl(rows[0].token);
    reviewer.lastInviteUrl = url;

    document.getElementById('invite-url-display').textContent = url;
    document.getElementById('invite-result').style.display    = 'block';
    document.getElementById('invite-name').value  = '';
    document.getElementById('invite-email').value = '';
    document.getElementById('invite-note').value  = '';

    showToast(`Invite created for ${email}.`, 'success');
    loadInvites();

  } catch (e) {
    showToast(`Failed to create invite: ${e.message}`, 'error');
  }
  btn.textContent = '+ Create Invite'; btn.disabled = false;
}

async function revokeInvite(id, btn) {
  if (!confirm('Revoke this invite? The candidate will no longer be able to use it.')) return;
  btn.textContent = '…'; btn.disabled = true;
  try {
    const res = await authFetch(
      `${CONFIG.supabaseUrl}/rest/v1/assessment_invites?id=eq.${id}`,
      { method: 'DELETE' }
    );
    if (!res.ok) throw new Error(await res.text());
    showToast('Invite revoked.', '');
    loadInvites();
  } catch (e) {
    showToast(`Failed to revoke: ${e.message}`, 'error');
    btn.textContent = 'Revoke'; btn.disabled = false;
  }
}

function copyInviteUrl() {
  copyUrl(reviewer.lastInviteUrl, null);
  const flash = document.getElementById('copied-flash');
  flash.classList.add('show');
  setTimeout(() => flash.classList.remove('show'), 2000);
}

function copyUrl(url, btn) {
  navigator.clipboard.writeText(url).then(() => {
    showToast('Link copied to clipboard.', 'success');
    if (btn) { btn.textContent = 'Copied!'; setTimeout(() => btn.textContent = 'Copy Link', 2000); }
  }).catch(() => prompt('Copy this link:', url));
}

function buildInviteUrl(token) {
  return window.location.href.replace(/reviewer\.html.*$/, '') + `index.html?token=${token}`;
}

// ─── Utilities ────────────────────────────────────────────────────────────────
function esc(str) {
  return String(str || '')
    .replace(/&/g,'&amp;').replace(/</g,'&lt;')
    .replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}
function escAttr(str) {
  return String(str || '').replace(/'/g,"&#39;").replace(/"/g,'&quot;');
}
function showToast(msg, type = '') {
  const el = document.getElementById('toast');
  el.textContent = msg;
  el.className = 'toast' + (type ? ' ' + type : '');
  el.classList.add('show');
  setTimeout(() => el.classList.remove('show'), 3500);
}
