// ─── State ────────────────────────────────────────────────────────────────────
const state = {
  currentSection:  0,
  answers:         {},
  candidate:       {},
  timerInterval:   null,
  timeRemaining:   CONFIG.timerMinutes * 60,
  submitted:       false,
  submissionId:    null,
  token:           null,
  paused:          false,
  activityLog:     [],   // integrity tracking events
  answerStartTimes:{},   // when candidate first typed in each answer
};

// ─── Activity logging ─────────────────────────────────────────────────────────
function logEvent(type, detail = {}) {
  if (state.submitted) return;
  state.activityLog.push({
    type,
    t: Math.round((CONFIG.timerMinutes * 60 - state.timeRemaining)),  // seconds elapsed
    ts: new Date().toISOString(),
    ...detail,
  });
}

function initActivityTracking() {
  // Tab / window focus loss
  document.addEventListener('visibilitychange', () => {
    if (state.submitted || !state.candidate?.name) return;
    logEvent(document.hidden ? 'tab_hidden' : 'tab_visible');
  });

  window.addEventListener('blur',  () => { if (!state.submitted && state.candidate?.name) logEvent('window_blur');  });
  window.addEventListener('focus', () => { if (!state.submitted && state.candidate?.name) logEvent('window_focus'); });

  // Right-click disabled during test
  document.addEventListener('contextmenu', e => {
    if (state.candidate?.name && !state.submitted) e.preventDefault();
  });

  // DevTools open heuristic — size change
  let _devToolsTimer = null;
  const _threshold = 160;
  window.addEventListener('resize', () => {
    if (!state.candidate?.name || state.submitted) return;
    clearTimeout(_devToolsTimer);
    _devToolsTimer = setTimeout(() => {
      const widthDiff  = window.outerWidth  - window.innerWidth;
      const heightDiff = window.outerHeight - window.innerHeight;
      if (widthDiff > _threshold || heightDiff > _threshold) {
        logEvent('devtools_suspected');
      }
    }, 500);
  });
}

// ─── Init ─────────────────────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
  document.getElementById('reg-date').value = new Date().toLocaleDateString('en-ZA', {
    weekday: 'long', year: 'numeric', month: 'long', day: 'numeric',
  });

  // Pre-fill token from URL query param
  const urlToken = new URLSearchParams(window.location.search).get('token');
  if (urlToken) {
    document.getElementById('reg-token').value = urlToken.trim();
  }

  loadProgress();
});

// ─── Token validation ─────────────────────────────────────────────────────────
function clearTokenStatus() {
  const el = document.getElementById('token-status');
  el.style.display = 'none';
  el.textContent = '';
}

function showTokenStatus(msg, ok) {
  const el = document.getElementById('token-status');
  el.textContent = msg;
  el.style.display = 'block';
  el.style.background   = ok ? '#f0fbf4' : '#fef0f0';
  el.style.border       = `1px solid ${ok ? '#b3dfc3' : '#f0c0c0'}`;
  el.style.color        = ok ? '#1d6b45' : '#a03030';
  el.style.borderRadius = '7px';
  el.style.padding      = '10px 14px';
}

async function validateToken() {
  const raw = document.getElementById('reg-token').value.trim();
  if (!raw) { showTokenStatus('Please enter your invite token.', false); return; }

  const btn = document.getElementById('btn-validate');
  btn.textContent = 'Verifying…';
  btn.disabled = true;
  clearTokenStatus();

  try {
    const res = await fetch(
      `${CONFIG.supabaseUrl}/rest/v1/assessment_invites?token=eq.${encodeURIComponent(raw)}&select=*&limit=1`,
      { headers: { 'apikey': CONFIG.supabaseAnon, 'Authorization': `Bearer ${CONFIG.supabaseAnon}` } }
    );
    if (!res.ok) throw new Error('Network error');
    const rows = await res.json();

    if (!rows.length) {
      showTokenStatus('This token is not valid. Please check your invite and try again.', false);
      btn.textContent = 'Verify Token'; btn.disabled = false; return;
    }

    const invite = rows[0];

    if (invite.used_at) {
      showTokenStatus('This invite has already been used. Each invite can only be used once.', false);
      btn.textContent = 'Verify Token'; btn.disabled = false; return;
    }

    if (invite.expires_at && new Date(invite.expires_at) < new Date()) {
      showTokenStatus('This invite has expired. Please contact the hiring team.', false);
      btn.textContent = 'Verify Token'; btn.disabled = false; return;
    }

    // Valid — store token, pre-fill details
    state.token = raw;
    document.getElementById('token-check-panel').style.display = 'none';
    document.getElementById('reg-details-panel').style.display = 'block';

    if (invite.name) {
      document.getElementById('reg-name').value = invite.name;
    }
    if (invite.email) {
      const emailEl = document.getElementById('reg-email');
      emailEl.value    = invite.email;
      emailEl.readOnly = true;
      document.getElementById('email-locked-badge').style.display = 'inline-flex';
    }

    showToast('Token verified — please confirm your details.', 'success');

  } catch (e) {
    showTokenStatus('Could not verify token — check your connection and try again.', false);
    btn.textContent = 'Verify Token'; btn.disabled = false;
  }
}

// ─── Start test ───────────────────────────────────────────────────────────────
async function startTest() {
  const name  = document.getElementById('reg-name').value.trim();
  const email = document.getElementById('reg-email').value.trim();
  const errEl = document.getElementById('reg-error');

  if (!name || !email) {
    errEl.textContent = 'Please enter your full name and email address.';
    errEl.style.display = 'block'; return;
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    errEl.textContent = 'Please enter a valid email address.';
    errEl.style.display = 'block'; return;
  }
  errEl.style.display = 'none';

  // Double-check invite email matches (if locked)
  const emailEl = document.getElementById('reg-email');
  if (emailEl.readOnly) {
    // Email was pre-filled from invite — already validated
  }

  // Mark token as used in Supabase (this is the moment the invite expires)
  const btn = document.getElementById('btn-start');
  btn.textContent = 'Starting…';
  btn.disabled = true;

  try {
    const res = await fetch(
      `${CONFIG.supabaseUrl}/rest/v1/assessment_invites?token=eq.${encodeURIComponent(state.token)}`,
      {
        method: 'PATCH',
        headers: {
          'apikey':        CONFIG.supabaseAnon,
          'Authorization': `Bearer ${CONFIG.supabaseAnon}`,
          'Content-Type':  'application/json',
          'Prefer':        'return=minimal',
        },
        body: JSON.stringify({ used_at: new Date().toISOString() }),
      }
    );
    if (!res.ok) throw new Error('Could not mark invite as used');
  } catch (e) {
    // Non-fatal: let the test start anyway, log the error
    console.warn('Failed to mark invite as used:', e);
  }

  btn.textContent = 'Begin Assessment →';
  btn.disabled = false;

  state.candidate = {
    name,
    email,
    date:     document.getElementById('reg-date').value,
    position: document.getElementById('reg-position').value.trim(),
    employer: document.getElementById('reg-employer').value.trim(),
  };

  document.getElementById('badge-name').textContent = name;
  document.getElementById('candidate-badge-display').style.display = 'flex';
  document.getElementById('timer-display').style.display  = 'block';
  document.getElementById('btn-pause').style.display      = 'inline-flex';
  document.getElementById('section-nav').style.display    = 'flex';

  startTimer();
  initActivityTracking();
  logEvent('test_started');
  showSection(0);
  saveProgress();
  showToast('Assessment started — good luck!', 'success');
}

// ─── Pause / Resume ───────────────────────────────────────────────────────────
function pauseTest() {
  if (state.paused || state.submitted) return;
  state.paused = true;
  clearInterval(state.timerInterval);
  state.timerInterval = null;
  saveProgress();
  updatePauseClock();
  document.getElementById('pause-overlay').style.display = 'flex';
  showToast('Assessment paused. Your progress is saved.', '');
}

function resumeTest() {
  if (!state.paused) return;
  state.paused = false;
  document.getElementById('pause-overlay').style.display = 'none';
  saveProgress();
  startTimer();
  showToast('Assessment resumed.', 'success');
}

function updatePauseClock() {
  const m = Math.floor(state.timeRemaining / 60);
  const s = state.timeRemaining % 60;
  document.getElementById('pause-clock-display').textContent =
    `${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}`;
}

// ─── Timer ────────────────────────────────────────────────────────────────────
function startTimer() {
  updateTimerDisplay();
  state.timerInterval = setInterval(() => {
    state.timeRemaining--;
    updateTimerDisplay();
    if (state.timeRemaining % 30 === 0) saveProgress(); // save every 30s
    if (state.timeRemaining <= 0) {
      clearInterval(state.timerInterval);
      showToast('Time is up! Submitting automatically…', 'error');
      submitAssessment();
    }
  }, 1000);
}

function updateTimerDisplay() {
  const el = document.getElementById('timer-display');
  const m  = Math.floor(state.timeRemaining / 60);
  const s  = state.timeRemaining % 60;
  el.textContent = `${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}`;
  el.classList.remove('warning', 'danger');
  if      (state.timeRemaining <= 300) el.classList.add('danger');
  else if (state.timeRemaining <= 900) el.classList.add('warning');
}

// ─── Section rendering ────────────────────────────────────────────────────────
function showSection(idx) {
  state.currentSection = idx;
  updateSectionNav(idx);
  updateProgressBar();

  const sec  = SECTIONS[idx];
  const wrap = document.getElementById('screen-section');
  wrap.innerHTML = '';

  const hdr = document.createElement('div');
  hdr.className = 'section-header';
  hdr.innerHTML = `
    <div class="section-icon">${sec.id}</div>
    <div class="section-info">
      <h2>Section ${sec.id}: ${sec.title}</h2>
      <p>${sec.description}</p>
    </div>
    <div class="section-marks"><span class="big">${sec.totalMarks}</span>marks</div>
  `;
  wrap.appendChild(hdr);

  sec.questions.forEach(q => {
    const card = document.createElement('div');
    card.className = 'question-card' + (state.answers[q.id] ? ' answered' : '');
    card.id = 'card-' + q.id;
    card.innerHTML = `
      <div class="q-header">
        <div class="q-num">${q.num}</div>
        <div class="q-body">
          <div class="q-text">${q.text}</div>
          ${q.sub     ? `<div class="q-sub">${q.sub}</div>`             : ''}
          ${q.context ? `<div class="q-context-box">${q.context}</div>` : ''}
          <div class="form-group" style="margin-bottom:0">
            <textarea id="ans-${q.id}"
              placeholder="${q.placeholder || 'Type your answer here…'}"
              rows="5"
              oninput="saveAnswer('${q.id}', this.value)">${state.answers[q.id] || ''}</textarea>
          </div>
        </div>
        <div class="q-marks-badge">${q.marks} mark${q.marks !== 1 ? 's' : ''}</div>
      </div>
    `;
    wrap.appendChild(card);
    // Attach paste + focus tracking after card is in DOM
    const ta = document.getElementById('ans-' + q.id);
    if (ta) attachPasteDetection(q.id, ta);
  });

  const isFirst   = idx === 0;
  const isLast    = idx === SECTIONS.length - 1;
  const answered  = countAnswered(idx);
  const total     = sec.questions.length;

  const footer = document.createElement('div');
  footer.className = 'section-nav-footer';
  footer.innerHTML = `
    <span class="nav-progress-text">${answered} of ${total} answered in this section</span>
    <div style="display:flex;gap:10px;align-items:center;">
      ${!isFirst ? `<button class="btn btn-outline" onclick="goSection(${idx - 1})">← Previous</button>` : ''}
      ${!isLast
        ? `<button class="btn btn-primary" onclick="goSection(${idx + 1})">Next Section →</button>`
        : `<button class="btn btn-gold" onclick="confirmSubmit()">Submit Assessment ✓</button>`}
    </div>
  `;
  wrap.appendChild(footer);

  showScreen('screen-section');
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

function goSection(idx) {
  saveAllAnswers();
  saveSectionProgress();   // incremental save to Supabase
  showSection(idx);
}

function saveAnswer(id, val) {
  // Track when they first started typing an answer
  if (val.trim() && !state.answerStartTimes[id]) {
    state.answerStartTimes[id] = Math.round(CONFIG.timerMinutes * 60 - state.timeRemaining);
  }
  state.answers[id] = val;
  document.getElementById('card-' + id)?.classList.toggle('answered', val.trim().length > 0);
  saveProgress();
}

function attachPasteDetection(qId, el) {
  el.addEventListener('paste', () => {
    logEvent('paste', { question: qId });
  });
  el.addEventListener('focus', () => {
    if (!state.answerStartTimes[qId]) {
      state.answerStartTimes[qId] = Math.round(CONFIG.timerMinutes * 60 - state.timeRemaining);
    }
  });
}

function saveAllAnswers() {
  SECTIONS.forEach(sec => sec.questions.forEach(q => {
    const el = document.getElementById('ans-' + q.id);
    if (el) state.answers[q.id] = el.value;
  }));
}

function countAnswered(secIdx) {
  return SECTIONS[secIdx].questions.filter(q => state.answers[q.id]?.trim()).length;
}

function updateSectionNav(active) {
  document.querySelectorAll('.section-tab').forEach((tab, i) => {
    tab.classList.toggle('active', i === active);
    const done = SECTIONS[i].questions.every(q => state.answers[q.id]?.trim());
    tab.classList.toggle('done', done && i !== active);
    const tick = tab.querySelector('.tick');
    if (done && i !== active) { if (!tick) tab.insertAdjacentHTML('beforeend', '<span class="tick">✓</span>'); }
    else tick?.remove();
    tab.onclick = () => { if (i !== state.currentSection) goSection(i); };
  });
}

function updateProgressBar() {
  const total = SECTIONS.reduce((s, sec) => s + sec.questions.length, 0);
  const done  = Object.keys(state.answers).filter(k => state.answers[k]?.trim()).length;
  document.getElementById('progress-bar').style.width = Math.round((done / total) * 100) + '%';
}

// ─── Submit ───────────────────────────────────────────────────────────────────
function confirmSubmit() {
  saveAllAnswers();
  const total      = SECTIONS.reduce((s, sec) => s + sec.questions.length, 0);
  const unanswered = total - Object.keys(state.answers).filter(k => state.answers[k]?.trim()).length;
  const msg = unanswered > 0
    ? `You have ${unanswered} unanswered question(s). Submit anyway?`
    : 'Submit your assessment? This cannot be undone.';
  if (!confirm(msg)) return;
  submitAssessment();
}

function submitAssessment() {
  state.submitted = true;
  state.paused    = false;
  clearInterval(state.timerInterval);
  document.getElementById('timer-display').style.display   = 'none';
  document.getElementById('btn-pause').style.display       = 'none';
  document.getElementById('section-nav').style.display     = 'none';
  document.getElementById('pause-overlay').style.display   = 'none';
  document.getElementById('progress-bar').style.width      = '100%';
  saveProgress();
  showScreen('screen-complete');
  setTimeout(() => saveToSupabase(true), 400);
}

// ─── Supabase incremental save ────────────────────────────────────────────────
// Saves after every section and on final submit.
// Uses upsert keyed on email — one record per candidate, updated in place.

let _retryInterval = null;
let _retryCount    = 0;
const MAX_RETRIES  = 20;
const RETRY_DELAY  = 30000;

async function saveToSupabase(isComplete = false) {
  if (isComplete) {
    setCompletionStep('step-save', 'active', 'Saving your responses…');
  }

  const success = await attemptSave(isComplete);

  if (!success && isComplete) {
    showCompleteFallback();
    startRetryQueue();
  }

  return success;
}

async function attemptSave(isComplete = false) {
  const answered = Object.keys(state.answers).filter(k => state.answers[k]?.trim()).length;
  const total    = SECTIONS.reduce((s, sec) => s + sec.questions.length, 0);

  const payload = {
    name:            state.candidate.name,
    email:           state.candidate.email,
    position:        state.candidate.position || null,
    employer:        state.candidate.employer || null,
    answers:         state.answers,
    answered_count:  answered,
    total_questions: total,
    activity_log:    state.activityLog      || [],
    answer_times:    state.answerStartTimes || {},
    completed:       isComplete,
    last_section:    state.currentSection,
    last_saved_at:   new Date().toISOString(),
  };

  try {
    const res = await fetch(
      // Upsert on email — updates existing row if email matches, inserts if not
      `${CONFIG.supabaseUrl}/rest/v1/${CONFIG.supabaseTable}`,
      {
        method:  'POST',
        headers: {
          'apikey':        CONFIG.supabaseAnon,
          'Authorization': `Bearer ${CONFIG.supabaseAnon}`,
          'Content-Type':  'application/json',
          'Prefer':        'return=representation,resolution=merge-duplicates',
        },
        body: JSON.stringify(payload),
      }
    );

    if (!res.ok) throw new Error(await res.text());

    const rows = await res.json();
    state.submissionId = rows[0]?.id || state.submissionId || null;
    saveProgress();

    if (isComplete) {
      stopRetryQueue();
      setCompletionStep('step-save',    'done', 'Responses saved ✓');
      setCompletionStep('step-confirm', 'done', `Ref: ${(state.submissionId || '').slice(0,8) || 'confirmed'}`);
      showCompleteSuccess();
    }

    return true;

  } catch (e) {
    console.warn(`Save attempt failed (retry ${_retryCount}):`, e);
    return false;
  }
}

// ─── Section save (called on Next / Previous) ─────────────────────────────────
async function saveSectionProgress() {
  if (!state.candidate?.name || !state.candidate?.email) return;
  // Try up to 3 times silently — doesn't block navigation
  for (let i = 0; i < 3; i++) {
    const ok = await attemptSave(false);
    if (ok) return;
    await new Promise(r => setTimeout(r, 2000 * (i + 1))); // 2s, 4s, 6s
  }
  // Silent failure — answers are still in localStorage, submit retry queue will catch it
  console.warn('Section progress save failed after 3 attempts — answers preserved in localStorage.');
}

// ─── Retry queue (used only when final submit fails) ──────────────────────────
function startRetryQueue() {
  if (_retryInterval) return;
  _retryCount = 0;

  _retryInterval = setInterval(async () => {
    _retryCount++;
    updateRetryStatus();

    if (_retryCount >= MAX_RETRIES) {
      stopRetryQueue();
      updateRetryStatus(true);
      return;
    }

    const success = await attemptSave(true);
    if (success) {
      document.getElementById('export-panel')?.remove();
      document.getElementById('retry-status')?.remove();
    }
  }, RETRY_DELAY);
}

function stopRetryQueue() {
  clearInterval(_retryInterval);
  _retryInterval = null;
}

function updateRetryStatus(gaveUp = false) {
  const el = document.getElementById('retry-status');
  if (!el) return;
  if (gaveUp) {
    el.textContent = 'Auto-retry stopped after 10 minutes. Please send your files to the hiring team.';
    el.style.color = '#c0272d';
  } else {
    el.textContent = `Auto-retrying — attempt ${_retryCount} of ${MAX_RETRIES}. Keep this tab open.`;
  }
}

// ─── Completion UI ────────────────────────────────────────────────────────────
function setCompletionStep(id, status, text) {
  const el    = document.getElementById(id);
  const txtEl = el?.querySelector('p');
  if (!el) return;
  el.className = 'completion-step ' + ({ active: 'action-step', done: 'done-step' }[status] || '');
  if (txtEl && text) txtEl.textContent = text;
}

function showCompleteSuccess() {
  stopRetryQueue();
  document.getElementById('complete-icon').textContent      = '✓';
  document.getElementById('complete-icon').style.background = 'linear-gradient(135deg,#1d8a5e,#27ae60)';
  document.getElementById('complete-heading').textContent   = 'Submitted Successfully';
  document.getElementById('complete-sub').textContent       = `Thank you, ${state.candidate.name}. Your assessment has been received.`;
  document.getElementById('saving-spinner').style.display   = 'none';
  document.getElementById('btn-retry').style.display        = 'none';
  document.getElementById('btn-export-json').style.display  = 'none';
  document.getElementById('export-panel')?.remove();
  document.getElementById('retry-status')?.remove();
  document.getElementById('complete-actions').style.display = 'flex';
  showToast('Assessment submitted successfully!', 'success');
}

function showCompleteFallback() {
  document.getElementById('complete-icon').textContent      = '⚠';
  document.getElementById('complete-icon').style.background = 'linear-gradient(135deg,#c0392b,#e74c3c)';
  document.getElementById('complete-heading').textContent   = 'Submission Error';
  document.getElementById('complete-sub').innerHTML         =
    'Could not reach the database. <strong>Your answers have not been lost</strong> — follow the steps below.';
  document.getElementById('saving-spinner').style.display   = 'none';
  document.getElementById('btn-retry').style.display        = 'inline-flex';
  document.getElementById('btn-export-json').style.display  = 'inline-flex';
  document.getElementById('complete-actions').style.display = 'flex';

  // Auto-trigger downloads
  setTimeout(() => {
    downloadMyPDF();
    setTimeout(() => downloadExportFile(), 800);
  }, 400);

  // Build and show export code panel
  buildExportPanel();
  showToast('Answers saved locally — please follow the recovery steps.', 'error');
}

// ─── Export / recovery ────────────────────────────────────────────────────────
function buildExportPayload() {
  const answered = Object.keys(state.answers).filter(k => state.answers[k]?.trim()).length;
  const total    = SECTIONS.reduce((s, sec) => s + sec.questions.length, 0);
  return {
    name:            state.candidate.name,
    email:           state.candidate.email,
    position:        state.candidate.position || null,
    employer:        state.candidate.employer || null,
    answers:         state.answers,
    answered_count:  answered,
    total_questions: total,
    activity_log:    state.activityLog    || [],
    answer_times:    state.answerStartTimes || {},
    exported_at:     new Date().toISOString(),
    _export_version: 1,
  };
}

function downloadExportFile() {
  try {
    const payload  = buildExportPayload();
    const json     = JSON.stringify(payload, null, 2);
    const blob     = new Blob([json], { type: 'application/json' });
    const safeName = (state.candidate.name || 'Candidate').replace(/[^a-zA-Z0-9 ]/g,'').replace(/\s+/g,'_');
    const url      = URL.createObjectURL(blob);
    const a        = Object.assign(document.createElement('a'), {
      href: url, download: `PayrollAssessment_${safeName}_EXPORT.json`
    });
    document.body.appendChild(a); a.click(); document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(url), 5000);
    showToast('Export file downloaded.', 'success');
  } catch (e) { console.error('Export failed:', e); }
}

function buildExportPanel() {
  // Remove existing panel if any
  document.getElementById('export-panel')?.remove();

  const payload    = buildExportPayload();
  const compressed = btoa(JSON.stringify(payload));  // base64 encode
  const code       = compressed.match(/.{1,60}/g).join('\n'); // wrap for readability

  const panel = document.createElement('div');
  panel.id    = 'export-panel';
  panel.style.cssText = `
    margin-top:24px; padding:20px 24px;
    background:#fff8f8; border:2px solid #c0272d;
    border-radius:10px; text-align:left; width:100%;
    max-width:520px; margin-left:auto; margin-right:auto;
  `;
  panel.innerHTML = `
    <div style="font-size:14px;font-weight:700;color:#c0272d;margin-bottom:12px;">
      ⚠ Recovery Instructions
    </div>
    <div style="font-size:13px;color:#333;line-height:1.7;margin-bottom:16px;">
      Two files have been downloaded automatically:
      <ul style="margin:8px 0 8px 20px;">
        <li><strong>PDF</strong> — your answer sheet</li>
        <li><strong>JSON export file</strong> — for the reviewer to upload</li>
      </ul>
      Please email <strong>both files</strong> to the hiring team. If the files did not download, use the buttons above to download them again.
    </div>
    <div style="font-size:12px;font-weight:600;color:#666;text-transform:uppercase;letter-spacing:.5px;margin-bottom:6px;">
      Last resort — Export Code
    </div>
    <div style="font-size:11px;color:#666;margin-bottom:8px;line-height:1.5;">
      If you cannot send the files, copy this code and paste it into your email:
    </div>
    <textarea readonly
      style="width:100%;height:90px;font-family:monospace;font-size:10px;padding:8px;
             border:1px solid #ddd;border-radius:6px;resize:none;background:#f8f8f8;color:#333;"
      id="export-code-box">${code}</textarea>
    <button onclick="copyExportCode()" class="btn btn-outline btn-sm"
      style="margin-top:8px;width:100%;justify-content:center;">
      📋 Copy Export Code
    </button>
  `;

  // Insert after complete-actions
  const actions = document.getElementById('complete-actions');
  actions.insertAdjacentElement('afterend', panel);
}

function copyExportCode() {
  const box = document.getElementById('export-code-box');
  navigator.clipboard.writeText(box.value).then(() => {
    showToast('Export code copied — paste it into your email.', 'success');
  }).catch(() => {
    box.select();
    document.execCommand('copy');
    showToast('Export code copied.', 'success');
  });
}

function showCompleteFallback() {
  document.getElementById('complete-icon').textContent      = '⚠';
  document.getElementById('complete-icon').style.background = 'linear-gradient(135deg,#c0392b,#e74c3c)';
  document.getElementById('complete-heading').textContent   = 'Submission Error';
  document.getElementById('complete-sub').innerHTML         =
    'Could not reach the database. <strong>Your answers have not been lost</strong> — the page will keep retrying automatically.';
  document.getElementById('saving-spinner').style.display   = 'none';
  document.getElementById('btn-retry').style.display        = 'inline-flex';
  document.getElementById('btn-export-json').style.display  = 'inline-flex';
  document.getElementById('complete-actions').style.display = 'flex';

  // Show retry status line
  let statusEl = document.getElementById('retry-status');
  if (!statusEl) {
    statusEl = document.createElement('p');
    statusEl.id = 'retry-status';
    statusEl.style.cssText = 'font-size:13px;color:var(--muted);margin-top:8px;';
    document.getElementById('complete-actions').insertAdjacentElement('afterend', statusEl);
  }
  statusEl.textContent = 'Auto-retrying in 30s — keep this tab open.';

  // Auto-trigger downloads
  setTimeout(() => {
    downloadMyPDF();
    setTimeout(() => downloadExportFile(), 800);
  }, 400);

  buildExportPanel();
  showToast('Connection failed — retrying automatically. Keep this tab open.', 'error');
}

async function retrySubmit() {
  const btn = document.getElementById('btn-retry');
  btn.textContent = '⏳ Retrying…';
  btn.disabled = true;

  // Reset UI
  document.getElementById('complete-icon').textContent      = '⏳';
  document.getElementById('complete-icon').style.background = 'linear-gradient(135deg,#c9993a,#e8b84b)';
  document.getElementById('complete-heading').textContent   = 'Saving your assessment…';
  document.getElementById('complete-sub').innerHTML         = 'Please wait…';
  document.getElementById('saving-spinner').style.display   = 'flex';
  document.getElementById('complete-actions').style.display = 'none';
  setCompletionStep('step-save',    'active', 'Retrying…');
  setCompletionStep('step-confirm', '',       'Waiting…');

  const success = await attemptSave();

  if (!success) {
    showCompleteFallback();
    if (!_retryInterval) startRetryQueue();
  } else {
    document.getElementById('export-panel')?.remove();
    document.getElementById('retry-status')?.remove();
  }

  btn.textContent = '↻ Try Again';
  btn.disabled = false;
}

function downloadMyPDF() {
  try {
    const result = buildPDF({ candidate: state.candidate, answers: state.answers });
    triggerPdfDownload(result);
    showToast('PDF downloaded.', 'success');
  } catch (e) { showToast('PDF generation failed.', 'error'); }
}

// ─── Screen switching ─────────────────────────────────────────────────────────
function showScreen(id) {
  document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
  document.getElementById(id)?.classList.add('active');
}

// ─── Persistence ─────────────────────────────────────────────────────────────
function saveProgress() {
  try {
    localStorage.setItem('payroll_assessment', JSON.stringify({
      answers:        state.answers,
      candidate:      state.candidate,
      timeRemaining:  state.timeRemaining,
      submitted:      state.submitted,
      submissionId:   state.submissionId,
      token:          state.token,
      paused:         state.paused,
      currentSection: state.currentSection,
    }));
  } catch (e) {}
}

function loadProgress() {
  try {
    const saved = JSON.parse(localStorage.getItem('payroll_assessment'));
    if (!saved) return;

    Object.assign(state, {
      answers:        saved.answers        || {},
      candidate:      saved.candidate      || {},
      timeRemaining:  saved.timeRemaining  || CONFIG.timerMinutes * 60,
      submitted:      saved.submitted      || false,
      submissionId:   saved.submissionId   || null,
      token:          saved.token          || null,
      paused:         saved.paused         || false,
      currentSection: saved.currentSection || 0,
    });

    if (state.submitted) {
      showCompleteSuccess();
      showScreen('screen-complete');

    } else if (state.token && state.candidate?.name) {
      // Resume in-progress test — skip token re-validation
      document.getElementById('badge-name').textContent = state.candidate.name;
      document.getElementById('candidate-badge-display').style.display = 'flex';
      document.getElementById('timer-display').style.display  = 'block';
      document.getElementById('btn-pause').style.display      = 'inline-flex';
      document.getElementById('section-nav').style.display    = 'flex';

      showSection(state.currentSection);

      if (state.paused) {
        updatePauseClock();
        document.getElementById('pause-overlay').style.display = 'flex';
      } else {
        startTimer();
      }

      showToast(`Welcome back, ${state.candidate.name}. Your progress has been restored.`, '');
    }
  } catch (e) {}
}

// ─── Toast ────────────────────────────────────────────────────────────────────
function showToast(msg, type = '') {
  const el = document.getElementById('toast');
  el.textContent = msg;
  el.className = 'toast' + (type ? ' ' + type : '');
  el.classList.add('show');
  setTimeout(() => el.classList.remove('show'), 3500);
}
