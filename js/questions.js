// ─── Assessment Sections & Questions ─────────────────────────────────────────
// Memo answers are intentionally absent. They live in memo.js (reviewer only).

const SECTIONS = [
  {
    id: 'A', title: 'General Knowledge',
    description: 'Foundational payroll concepts, terminology, and procedures.',
    totalMarks: 15,
    questions: [
      {
        id: 'q1', num: 1, marks: 3,
        text: 'What is the difference between the following?',
        sub: '<ul><li>a) Gross salary</li><li>b) Net salary</li><li>c) Cost to Company (CTC)</li></ul>',
        placeholder: 'Explain each term clearly…',
      },
      {
        id: 'q2', num: 2, marks: 4,
        text: 'Explain the purpose of the following deductions:',
        sub: '<ul><li>PAYE / Income Tax</li><li>UIF / Unemployment Insurance</li><li>Pension Fund</li><li>Medical Aid</li></ul>',
        placeholder: 'Describe the purpose of each deduction…',
      },
      {
        id: 'q3', num: 3, marks: 2,
        text: 'Why is payroll confidentiality important?',
        placeholder: 'Discuss the key reasons payroll information must remain confidential…',
      },
      {
        id: 'q4', num: 4, marks: 3,
        text: 'What documents are typically required when onboarding a new employee onto payroll?',
        placeholder: 'List and briefly explain the required documents…',
      },
      {
        id: 'q5', num: 5, marks: 3,
        text: "Explain what would happen if an employee's overtime is processed incorrectly.",
        placeholder: 'Describe the potential consequences…',
      },
    ],
  },
  {
    id: 'B', title: 'Payroll Calculations',
    description: 'Show all workings clearly for each calculation.',
    totalMarks: 15,
    questions: [
      {
        id: 'q6', num: 6, marks: 6,
        text: 'Monthly Salary Calculation',
        context: '<strong>An employee earns:</strong><br>• Basic Salary: R18,500<br>• Travel Allowance: R2,000<br>• Cell Phone Allowance: R500<br>• Overtime Worked: 12 hours at 1.5× normal hourly rate<br>• Ordinary hours per month: 195<br><br><strong>Calculate:</strong><br>1. Hourly rate &nbsp; 2. Overtime pay &nbsp; 3. Gross earnings before deductions',
        placeholder: 'Show all workings step-by-step…\n\n1. Hourly rate:\n\n2. Overtime pay:\n\n3. Gross earnings:',
      },
      {
        id: 'q7', num: 7, marks: 3,
        text: 'Leave Pay Calculation',
        context: 'An employee earning <strong>R24,000 per month</strong> resigns with <strong>8 days annual leave owing</strong>.<br>Calculate the leave payout and show all workings.',
        placeholder: 'Show all workings…\n\nDaily rate:\n\nLeave payout:',
      },
      {
        id: 'q8', num: 8, marks: 3,
        text: 'UIF Contribution Calculation',
        context: 'An employee earns <strong>R14,500 monthly</strong>.<br>Calculate: Employee UIF contribution, Employer UIF contribution, and Total UIF contribution.',
        placeholder: 'Show calculations for employee, employer, and total…',
      },
      {
        id: 'q9', num: 9, marks: 3,
        text: 'Deduction Scenario',
        context: 'Employee gross salary: <strong>R32,000</strong><br>Deductions: Pension 7.5% · Medical Aid R2,200 · UIF 1%<br>Calculate total deductions <em>(excluding tax)</em>.',
        placeholder: 'Show each deduction and the total…',
      },
    ],
  },
  {
    id: 'C', title: 'Labour Law & Compliance',
    description: 'Questions covering relevant South African labour legislation.',
    totalMarks: 12,
    questions: [
      {
        id: 'q10', num: 10, marks: 3,
        text: 'What is the purpose of the following Acts?',
        sub: '<ul><li>Basic Conditions of Employment Act (BCEA)</li><li>Labour Relations Act (LRA)</li><li>Employment Equity Act (EEA)</li></ul>',
        placeholder: 'Explain the purpose of each Act…',
      },
      {
        id: 'q11', num: 11, marks: 2,
        text: 'What is the legal requirement regarding payslips?',
        placeholder: 'Describe employer obligations regarding payslips…',
      },
      {
        id: 'q12', num: 12, marks: 2,
        text: 'How should overtime be compensated according to labour law?',
        placeholder: 'Describe the legal overtime compensation requirements…',
      },
      {
        id: 'q13', num: 13, marks: 2,
        text: 'What is the difference between annual leave and sick leave entitlement under the BCEA?',
        placeholder: 'Compare annual leave and sick leave entitlements…',
      },
      {
        id: 'q14', num: 14, marks: 3,
        text: "An employee disputes their payslip and claims they were underpaid. Explain the steps you would take.",
        placeholder: 'Describe your step-by-step process for resolving a payslip dispute…',
      },
    ],
  },
  {
    id: 'D', title: 'Scenario-Based Questions',
    description: 'Demonstrate problem-solving, communication, and professional judgement.',
    totalMarks: 15,
    questions: [
      {
        id: 'q15', num: 15, marks: 5,
        text: 'It is payroll day and you discover that overtime for 15 employees was omitted from the payroll run. What would you do?',
        placeholder: 'Describe your full course of action…',
      },
      {
        id: 'q16', num: 16, marks: 4,
        text: "A manager asks you to provide another employee's salary information. How would you respond?",
        placeholder: 'Describe how you would handle this request professionally…',
      },
      {
        id: 'q17', num: 17, marks: 6,
        text: 'You notice that an employee has been receiving duplicate travel allowances for 3 months. Explain: (a) how you would investigate, (b) how you would correct the issue, and (c) who should be informed.',
        placeholder: 'Address all three parts: investigation, correction, and communication…',
      },
    ],
  },
  {
    id: 'E', title: 'Excel & Systems Knowledge',
    description: 'Demonstrate your technical tools and systems experience.',
    totalMarks: 13,
    questions: [
      {
        id: 'q18', num: 18, marks: 5,
        text: 'Which Excel functions are useful in payroll administration? Name at least 5 and explain what they do.',
        placeholder: 'List at least 5 functions and explain each one…',
      },
      {
        id: 'q19', num: 19, marks: 5,
        text: 'What payroll systems have you used before? Explain: (a) what functions you performed, (b) reports you generated, and (c) any reconciliations you handled.',
        placeholder: 'Describe your hands-on system experience in detail…',
      },
      {
        id: 'q20', num: 20, marks: 3,
        text: 'Explain the importance of payroll reconciliations.',
        placeholder: 'Describe why reconciliations are important and what they achieve…',
      },
    ],
  },
  {
    id: '★', title: 'Bonus Questions',
    description: 'Advanced questions worth an additional 10 marks. Optional but recommended.',
    totalMarks: 10,
    questions: [
      {
        id: 'q21', num: 21, marks: 3,
        text: 'Explain the difference between:',
        sub: '<ul><li>Independent contractor vs employee</li><li>Taxable vs non-taxable allowance</li><li>Fixed vs variable earnings</li></ul>',
        placeholder: 'Explain each distinction clearly…',
      },
      {
        id: 'q22', num: 22, marks: 3,
        text: 'What payroll reports are typically submitted monthly or annually to government authorities?',
        placeholder: 'List and explain each government submission…',
      },
      {
        id: 'q23', num: 23, marks: 4,
        text: 'Describe your process for ensuring payroll accuracy before final submission.',
        placeholder: 'Walk through your full pre-submission accuracy check process…',
      },
    ],
  },
];
