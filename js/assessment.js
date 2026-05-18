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

function goSection(idx) { saveAllAnswers(); showSection(idx); }

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
  setTimeout(() => saveToSupabase(), 400);
}

// ─── Supabase save ────────────────────────────────────────────────────────────
async function saveToSupabase() {
  setCompletionStep('step-save', 'active', 'Saving your responses…');

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
    activity_log:    state.activityLog,
    answer_times:    state.answerStartTimes,
  };

  try {
    const res = await fetch(`${CONFIG.supabaseUrl}/rest/v1/${CONFIG.supabaseTable}`, {
      method:  'POST',
      headers: {
        'apikey':        CONFIG.supabaseAnon,
        'Authorization': `Bearer ${CONFIG.supabaseAnon}`,
        'Content-Type':  'application/json',
        'Prefer':        'return=representation',
      },
      body: JSON.stringify(payload),
    });
    if (!res.ok) throw new Error(await res.text());

    const rows = await res.json();
    state.submissionId = rows[0]?.id || null;
    saveProgress();

    setCompletionStep('step-save',    'done', 'Responses saved ✓');
    setCompletionStep('step-confirm', 'done', `Ref: ${(state.submissionId || '').slice(0,8) || 'confirmed'}`);
    showCompleteSuccess();

  } catch (e) {
    console.error('Supabase save error:', e);
    setCompletionStep('step-save', 'error', 'Save failed — use PDF fallback below');
    showCompleteFallback();
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
  document.getElementById('complete-icon').textContent      = '✓';
  document.getElementById('complete-icon').style.background = 'linear-gradient(135deg,#1d8a5e,#27ae60)';
  document.getElementById('complete-heading').textContent   = 'Submitted Successfully';
  document.getElementById('complete-sub').textContent       = `Thank you, ${state.candidate.name}. Your assessment has been received.`;
  document.getElementById('saving-spinner').style.display   = 'none';
  document.getElementById('complete-actions').style.display = 'flex';
  showToast('Assessment submitted successfully!', 'success');
}

function showCompleteFallback() {
  document.getElementById('complete-icon').textContent      = '⚠';
  document.getElementById('complete-icon').style.background = 'linear-gradient(135deg,#c0392b,#e74c3c)';
  document.getElementById('complete-heading').textContent   = 'Submission Error';
  document.getElementById('complete-sub').textContent       = 'Could not reach the database. Please download your answer sheet and contact the company.';
  document.getElementById('saving-spinner').style.display   = 'none';
  document.getElementById('complete-actions').style.display = 'flex';
  showToast('Save failed. Please download your PDF.', 'error');
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
