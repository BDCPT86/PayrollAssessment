// ─── PDF Generation ───────────────────────────────────────────────────────────
// Called with: buildPDF({ candidate, answers })
// Returns: { base64, blob, filename }

function buildPDF({ candidate, answers }) {
  const { jsPDF } = window.jspdf;
  const doc = new jsPDF({ unit: 'mm', format: 'a4', orientation: 'portrait' });
  const PW = 210, PH = 297, ML = 18, MR = 18, CW = PW - ML - MR, MB = 20;
  let y = 0;

  function newPage() {
    doc.addPage();
    y = 18;
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8);
    doc.setTextColor(180);
    doc.text(`Payroll Administrator Assessment  |  ${candidate.name}  |  CONFIDENTIAL`, ML, PH - 8);
    doc.setTextColor(30);
  }

  function checkY(needed) {
    if (y + needed > PH - MB) newPage();
  }

  // ── Cover page ──────────────────────────────────────────────────────────────
  doc.setFillColor(13, 34, 64);
  doc.rect(0, 0, PW, 52, 'F');
  doc.setFillColor(201, 153, 58);
  doc.rect(0, 52, PW, 3, 'F');

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(22);
  doc.setTextColor(255, 255, 255);
  doc.text('Payroll Administrator', ML, 22);
  doc.text('Assessment', ML, 33);
  doc.setFontSize(10);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(200, 210, 230);
  doc.text('CANDIDATE ANSWER SHEET  |  CONFIDENTIAL', ML, 44);

  y = 72;
  doc.setFillColor(240, 243, 248);
  doc.roundedRect(ML, y, CW, 52, 3, 3, 'F');
  doc.setDrawColor(220, 227, 238);
  doc.roundedRect(ML, y, CW, 52, 3, 3, 'S');

  const c1 = ML + 6, c2 = ML + CW / 2 + 4;
  doc.setFont('helvetica', 'bold'); doc.setFontSize(9); doc.setTextColor(90, 106, 130);
  doc.text('CANDIDATE NAME',   c1, y + 10);
  doc.text('EMAIL ADDRESS',    c2, y + 10);
  doc.text('POSITION APPLIED', c1, y + 28);
  doc.text('DATE',             c2, y + 28);
  doc.setFont('helvetica', 'normal'); doc.setFontSize(11); doc.setTextColor(26, 35, 50);
  doc.text(candidate.name     || '—', c1, y + 19);
  doc.text(candidate.email    || '—', c2, y + 19);
  doc.text(candidate.position || 'Payroll Administrator', c1, y + 37);
  doc.text(candidate.date     || new Date().toLocaleDateString('en-ZA'), c2, y + 37);
  y += 62;

  // Summary table
  doc.setFont('helvetica', 'bold'); doc.setFontSize(10); doc.setTextColor(13, 34, 64);
  doc.text('Assessment Summary', ML, y); y += 6;

  const tW = [18, 80, 28, 28];
  let tx = ML;
  doc.setFillColor(13, 34, 64); doc.rect(ML, y, CW, 7, 'F');
  doc.setFont('helvetica', 'bold'); doc.setFontSize(8.5); doc.setTextColor(255, 255, 255);
  ['Section', 'Title', 'Questions', 'Max Marks'].forEach((h, i) => { doc.text(h, tx + 2, y + 5); tx += tW[i]; });
  y += 7;

  SECTIONS.forEach((sec, si) => {
    tx = ML;
    doc.setFillColor(si % 2 === 0 ? 248 : 255, si % 2 === 0 ? 249 : 255, si % 2 === 0 ? 252 : 255);
    doc.rect(ML, y, CW, 6.5, 'F');
    doc.setDrawColor(220, 227, 238); doc.rect(ML, y, CW, 6.5, 'S');
    doc.setFont('helvetica', 'normal'); doc.setFontSize(8.5); doc.setTextColor(26, 35, 50);
    [sec.id, sec.title, String(sec.questions.length), String(sec.totalMarks)].forEach((cell, i) => { doc.text(cell, tx + 2, y + 4.5); tx += tW[i]; });
    y += 6.5;
  });

  tx = ML;
  doc.setFillColor(13, 34, 64); doc.rect(ML, y, CW, 7, 'F');
  doc.setFont('helvetica', 'bold'); doc.setFontSize(8.5); doc.setTextColor(255, 255, 255);
  ['', 'TOTAL', String(SECTIONS.reduce((s, sec) => s + sec.questions.length, 0)),
    String(SECTIONS.reduce((s, sec) => s + sec.totalMarks, 0))
  ].forEach((cell, i) => { doc.text(cell, tx + 2, y + 5); tx += tW[i]; });
  y += 14;

  // Declaration
  doc.setDrawColor(220, 227, 238); doc.setFillColor(255, 253, 245);
  doc.roundedRect(ML, y, CW, 28, 2, 2, 'FD');
  doc.setFont('helvetica', 'bold'); doc.setFontSize(9); doc.setTextColor(13, 34, 64);
  doc.text('Declaration', ML + 4, y + 7);
  doc.setFont('helvetica', 'normal'); doc.setFontSize(8.5); doc.setTextColor(60, 70, 90);
  const decl = `I, ${candidate.name}, confirm that all answers submitted in this assessment are my own work.`;
  doc.splitTextToSize(decl, CW - 8).forEach((ln, i) => doc.text(ln, ML + 4, y + 13 + i * 5));
  y += 36;
  doc.setDrawColor(180);
  doc.line(ML, y, ML + 70, y); doc.line(ML + 90, y, ML + 130, y);
  doc.setFontSize(8); doc.setTextColor(130);
  doc.text('Signature', ML, y + 4); doc.text('Date', ML + 90, y + 4);

  // ── Answer pages ────────────────────────────────────────────────────────────
  SECTIONS.forEach(sec => {
    newPage();

    doc.setFillColor(13, 34, 64); doc.rect(ML, y, CW, 14, 'F');
    doc.setFillColor(201, 153, 58); doc.rect(ML, y + 14, CW, 1.5, 'F');
    doc.setFont('helvetica', 'bold'); doc.setFontSize(12); doc.setTextColor(255, 255, 255);
    doc.text(`Section ${sec.id}: ${sec.title}`, ML + 4, y + 9.5);
    doc.setFont('helvetica', 'normal'); doc.setFontSize(8.5); doc.setTextColor(160, 180, 210);
    doc.text(`${sec.questions.length} questions  ·  ${sec.totalMarks} marks`, PW - MR - 36, y + 9.5);
    y += 20;

    sec.questions.forEach((q, qi) => {
      checkY(22);

      doc.setFillColor(240, 243, 248);
      doc.roundedRect(ML, y, CW, 8, 1, 1, 'F');
      doc.setFont('helvetica', 'bold'); doc.setFontSize(9); doc.setTextColor(13, 34, 64);
      doc.text(`Q${q.num}.`, ML + 3, y + 5.5);

      const qPlain = stripHTML(`${q.text} ${q.sub || ''}`);
      const qLines = doc.splitTextToSize(qPlain, CW - 24);
      doc.text(qLines[0] || '', ML + 12, y + 5.5);
      doc.setFont('helvetica', 'normal'); doc.setFontSize(8); doc.setTextColor(100, 110, 130);
      doc.text(`[${q.marks} mark${q.marks !== 1 ? 's' : ''}]`, PW - MR - 2, y + 5.5, { align: 'right' });
      y += 8;

      if (qLines.length > 1) {
        doc.setFont('helvetica', 'normal'); doc.setFontSize(8.5); doc.setTextColor(40, 50, 70);
        qLines.slice(1).forEach(ln => { checkY(5); doc.text(ln, ML + 12, y + 4); y += 5; });
      }

      if (q.context) {
        const ctxLines = doc.splitTextToSize(stripHTML(q.context), CW - 8);
        const ctxH = ctxLines.length * 4.5 + 5;
        checkY(ctxH);
        doc.setFillColor(252, 249, 240); doc.setDrawColor(220, 200, 150);
        doc.roundedRect(ML, y, CW, ctxH, 1, 1, 'FD');
        doc.setFont('helvetica', 'italic'); doc.setFontSize(8); doc.setTextColor(80, 60, 20);
        ctxLines.forEach((ln, li) => doc.text(ln, ML + 3, y + 4 + li * 4.5));
        y += ctxH + 3;
      }

      const rawAns  = answers[q.id] || '';
      const ansText = rawAns.trim() || '(No answer provided)';
      const ansLines = doc.splitTextToSize(ansText, CW - 8);
      const ansH = Math.max(18, ansLines.length * 4.8 + 8);

      checkY(ansH);
      doc.setFillColor(rawAns.trim() ? 255 : 252, 255, 255);
      doc.setDrawColor(200, 210, 230);
      doc.roundedRect(ML, y, CW, ansH, 1, 1, 'FD');
      doc.setFont('helvetica', 'bold'); doc.setFontSize(7.5); doc.setTextColor(60, 90, 150);
      doc.text("CANDIDATE'S ANSWER", ML + 3, y + 4.5);
      doc.setFont('helvetica', rawAns.trim() ? 'normal' : 'italic');
      doc.setFontSize(9);
      doc.setTextColor(rawAns.trim() ? 26 : 130, rawAns.trim() ? 35 : 130, rawAns.trim() ? 50 : 130);
      ansLines.forEach((ln, li) => doc.text(ln, ML + 3, y + 9 + li * 4.8));
      y += ansH + 6;

      if (qi < sec.questions.length - 1) {
        checkY(4); doc.setDrawColor(220, 227, 238); doc.line(ML, y, ML + CW, y); y += 5;
      }
    });
  });

  // ── Footer page ─────────────────────────────────────────────────────────────
  checkY(30); y += 6;
  doc.setFont('helvetica', 'bold'); doc.setFontSize(10); doc.setTextColor(13, 34, 64);
  doc.text('End of Assessment', ML, y); y += 6;
  doc.setFont('helvetica', 'normal'); doc.setFontSize(8.5); doc.setTextColor(90, 100, 120);
  doc.text(`Submission timestamp: ${new Date().toLocaleString('en-ZA')}`, ML, y); y += 5;
  doc.text(`Candidate: ${candidate.name}  |  ${candidate.email}`, ML, y); y += 5;
  doc.text(`Questions answered: ${Object.keys(answers).filter(k => answers[k]?.trim()).length} / ${SECTIONS.reduce((s, sec) => s + sec.questions.length, 0)}`, ML, y);

  // Page numbers
  const totalPages = doc.internal.getNumberOfPages();
  for (let p = 1; p <= totalPages; p++) {
    doc.setPage(p);
    doc.setFont('helvetica', 'normal'); doc.setFontSize(8); doc.setTextColor(160);
    doc.text(`Page ${p} of ${totalPages}`, PW - MR, PH - 8, { align: 'right' });
  }

  const safeName = (candidate.name || 'Candidate').replace(/[^a-zA-Z0-9 ]/g, '').replace(/\s+/g, '_');
  const filename = `PayrollAssessment_${safeName}.pdf`;
  const dataUri  = doc.output('datauristring');
  const base64   = dataUri.split(',')[1];
  const binary   = atob(base64);
  const bytes    = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  const blob = new Blob([bytes], { type: 'application/pdf' });

  return { base64, blob, filename };
}

function triggerPdfDownload({ blob, filename }) {
  const url = URL.createObjectURL(blob);
  const a   = Object.assign(document.createElement('a'), { href: url, download: filename });
  document.body.appendChild(a); a.click(); document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 5000);
}

function stripHTML(html) {
  return (html || '')
    .replace(/<br\s*\/?>/gi, '\n').replace(/<li>/gi, '• ').replace(/<\/li>/gi, '\n')
    .replace(/<[^>]+>/g, '').replace(/&amp;/g, '&').replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>').replace(/&nbsp;/g, ' ').replace(/\n{3,}/g, '\n\n').trim();
}
