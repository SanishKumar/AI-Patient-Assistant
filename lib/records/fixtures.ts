import type { HealthRecord } from './types'

// Deliberately authored fixtures. Names, providers, values, and source documents are fictional.
export const demoPatient = {
  id: 'demo-ananya',
  name: 'Ananya Rao',
  initials: 'AR',
  age: 34,
  location: 'Bengaluru',
  referenceDate: '2026-10-28',
  nextVisit: '2026-11-02',
  clinician: 'Dr. Meera Shah',
  clinic: 'Fern Family Clinic',
}

export const initialRecords: HealthRecord[] = [
  {
    id: 'lab-jan',
    title: 'A starting point',
    kind: 'lab',
    occurredAt: '2026-01-15',
    recordedAt: '2026-01-16',
    provider: 'Northstar Diagnostics',
    author: 'Laboratory team',
    status: 'verified',
    summary: 'HbA1c and lipid panel recorded at the beginning of the year.',
    source: {
      label: 'Metabolic panel · 15 Jan 2026',
      lines: [
        'SYNTHETIC REPORT — FOR PRODUCT DEMONSTRATION ONLY',
        'Patient: Ananya Rao | Collected: 15 January 2026',
        'HbA1c: 7.8 % | Method: HPLC',
        'LDL cholesterol: 132 mg/dL | Method: Direct assay',
        'Results transcribed from this fictional laboratory report.',
      ],
    },
    observations: [
      { metric: 'hba1c', label: 'HbA1c', value: 7.8, unit: '%', method: 'HPLC', line: 3 },
      {
        metric: 'ldl',
        label: 'LDL cholesterol',
        value: 132,
        unit: 'mg/dL',
        method: 'Direct assay',
        line: 4,
      },
    ],
  },
  {
    id: 'visit-jan',
    title: 'Getting the full picture',
    kind: 'visit',
    occurredAt: '2026-01-20',
    recordedAt: '2026-01-20',
    provider: 'Fern Family Clinic',
    author: 'Dr. Meera Shah',
    status: 'verified',
    summary: 'First consultation, recorded blood pressure, and patient-reported allergy history.',
    source: {
      label: 'Consultation note · 20 Jan 2026',
      lines: [
        'SYNTHETIC CONSULTATION — FOR PRODUCT DEMONSTRATION ONLY',
        'Ananya Rao | Dr. Meera Shah | 20 January 2026',
        'Blood pressure: 138/86 mmHg | Seated, clinic cuff',
        'Allergies: patient reports a rash after penicillin in childhood.',
        'Plan: bring prior records and medication list to follow-up.',
      ],
    },
    observations: [
      {
        metric: 'systolic',
        label: 'Systolic blood pressure',
        value: 138,
        unit: 'mmHg',
        method: 'Seated clinic cuff',
        line: 3,
      },
    ],
    allergy: { substance: 'penicillin', assertion: 'present', line: 4 },
  },
  {
    id: 'lab-apr',
    title: 'The first follow-up',
    kind: 'lab',
    occurredAt: '2026-04-18',
    recordedAt: '2026-04-19',
    provider: 'Northstar Diagnostics',
    author: 'Laboratory team',
    status: 'verified',
    summary: 'A repeat panel adds a second point to the record.',
    source: {
      label: 'Metabolic panel · 18 Apr 2026',
      lines: [
        'SYNTHETIC REPORT — FOR PRODUCT DEMONSTRATION ONLY',
        'Patient: Ananya Rao | Collected: 18 April 2026',
        'HbA1c: 7.4 % | Method: HPLC',
        'LDL cholesterol: 118 mg/dL | Method: Direct assay',
      ],
    },
    observations: [
      { metric: 'hba1c', label: 'HbA1c', value: 7.4, unit: '%', method: 'HPLC', line: 3 },
      {
        metric: 'ldl',
        label: 'LDL cholesterol',
        value: 118,
        unit: 'mg/dL',
        method: 'Direct assay',
        line: 4,
      },
    ],
  },
  {
    id: 'rx-apr',
    title: 'Medication list documented',
    kind: 'prescription',
    occurredAt: '2026-04-22',
    recordedAt: '2026-04-22',
    provider: 'Fern Family Clinic',
    author: 'Dr. Meera Shah',
    status: 'verified',
    summary:
      'Metformin appears in the documented medication list. Current use still needs confirmation.',
    source: {
      label: 'Medication record · 22 Apr 2026',
      lines: [
        'SYNTHETIC MEDICATION RECORD — NOT A PRESCRIPTION',
        'Ananya Rao | Recorded by Dr. Meera Shah | 22 April 2026',
        'Medication list: metformin 500 mg, twice daily with meals.',
        'Blood pressure: 134/84 mmHg | Seated, clinic cuff',
        'This record does not confirm current use or explain later changes in lab results.',
      ],
    },
    observations: [
      {
        metric: 'systolic',
        label: 'Systolic blood pressure',
        value: 134,
        unit: 'mmHg',
        method: 'Seated clinic cuff',
        line: 4,
      },
    ],
    medication: {
      name: 'Metformin',
      instruction: '500 mg · twice daily with meals (recorded 22 Apr)',
      line: 3,
    },
  },
  {
    id: 'visit-aug',
    title: 'A detail to reconcile',
    kind: 'visit',
    occurredAt: '2026-08-12',
    recordedAt: '2026-09-03',
    provider: 'Lakeside Outpatient Centre',
    author: 'Intake team',
    status: 'unreviewed',
    summary: 'An outside intake lists no known allergies, unlike the January consultation.',
    source: {
      label: 'Outside intake · 12 Aug 2026',
      lines: [
        'SYNTHETIC INTAKE — FOR PRODUCT DEMONSTRATION ONLY',
        'Ananya Rao | Visit: 12 August 2026 | Added to workspace: 3 September 2026',
        'Allergies: no known drug allergies.',
        'Patient-reported history. Reconciliation with existing records is pending.',
      ],
    },
    observations: [],
    allergy: { substance: 'all', assertion: 'none-known', line: 3 },
  },
  {
    id: 'lab-oct',
    title: 'The latest chapter',
    kind: 'lab',
    occurredAt: '2026-10-24',
    recordedAt: '2026-10-25',
    provider: 'Northstar Diagnostics',
    author: 'Laboratory team',
    status: 'verified',
    summary: 'The latest HbA1c and lipid panel are ready for the next visit.',
    source: {
      label: 'Metabolic panel · 24 Oct 2026',
      lines: [
        'SYNTHETIC REPORT — FOR PRODUCT DEMONSTRATION ONLY',
        'Patient: Ananya Rao | Collected: 24 October 2026',
        'HbA1c: 6.8 % | Method: HPLC',
        'LDL cholesterol: 104 mg/dL | Method: Direct assay',
        'Comparison requires clinical context; these values do not establish treatment effect.',
      ],
    },
    observations: [
      { metric: 'hba1c', label: 'HbA1c', value: 6.8, unit: '%', method: 'HPLC', line: 3 },
      {
        metric: 'ldl',
        label: 'LDL cholesterol',
        value: 104,
        unit: 'mg/dL',
        method: 'Direct assay',
        line: 4,
      },
    ],
  },
]

export const sampleImport: HealthRecord = {
  id: 'visit-oct',
  title: 'A new observation',
  kind: 'visit',
  occurredAt: '2026-10-26',
  recordedAt: '2026-10-28',
  provider: 'Fern Family Clinic',
  author: 'Nursing team',
  status: 'unreviewed',
  summary: 'A clinic blood pressure reading, added for review before the next appointment.',
  source: {
    label: 'Vitals note · 26 Oct 2026',
    lines: [
      'SYNTHETIC VITALS NOTE — FOR PRODUCT DEMONSTRATION ONLY',
      'Ananya Rao | 26 October 2026 | Nursing team',
      'Blood pressure: 122/78 mmHg | Seated, clinic cuff',
      'Source transcription has not yet been reviewed.',
    ],
  },
  observations: [
    {
      metric: 'systolic',
      label: 'Systolic blood pressure',
      value: 122,
      unit: 'mmHg',
      method: 'Seated clinic cuff',
      line: 3,
    },
  ],
}

export const suggestedQuestions = [
  {
    text: 'Can we reconcile the two different allergy histories?',
    sourceIds: ['visit-jan', 'visit-aug'],
  },
  {
    text: 'What context do we need to interpret the change in HbA1c?',
    sourceIds: ['lab-apr', 'lab-oct'],
  },
  { text: 'Is the medication list from April still current?', sourceIds: ['rx-apr'] },
]
