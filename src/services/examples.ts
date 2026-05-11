export const SHORT_EXAMPLES = [
  'Patient has chest pain and fever',
  'Patient presents with shortness of breath and swelling in the lower extremities',
  'Performed laparoscopic cholecystectomy for gallstones',
  'Patient diagnosed with type 2 diabetes mellitus and hypertension',
  'MRI of the brain revealed a lesion in the frontal lobe',
];

export interface FullNoteExample {
  title: string;
  text: string;
}

export const FULL_NOTE_EXAMPLES: FullNoteExample[] = [
  {
    title: 'Discharge Summary - Biliary Pancreatitis',
    text: `Chief Complaint: Biliary pancreatitis

Major Surgical or Invasive Procedure: Laparoscopic cholecystectomy

History of Present Illness:
Patient is a middle-aged man who had severe biliary pancreatitis resulting in pancreatic necrosis for which he was treated with nasojejunal feedings and antibiotics. He was discharged home with oral antibiotics and has recovered well. He now presents for elective laparoscopic cholecystectomy.

Past Medical History:
Hypertension, Type 2 Diabetes Mellitus, Hyperlipidemia

Physical Exam:
Gen: NAD, A&Ox3
CV: RRR, no murmurs
Pulm: CTAB
Abd: Soft, NT/ND, no rebound or guarding

Brief Hospital Course:
Patient underwent laparoscopic cholecystectomy without complications. Tolerated procedure well. Started on clear liquids POD0 and advanced to regular diet. Pain controlled with oral medications.

Discharge Medications:
1. Metformin 1000mg PO BID
2. Lisinopril 10mg PO daily
3. Atorvastatin 40mg PO daily
4. Oxycodone 5mg PO q4-6h PRN pain`,
  },
  {
    title: 'Discharge Summary - Wound Dehiscence',
    text: `Chief Complaint: Wound dehiscence

History of Present Illness:
Patient is a male status post splenectomy readmitted for wound dehiscence.

Past Medical History:
DM, HTN

Physical Exam:
Gen: NAD
Abd: S/NT/ND, wound dehiscence at lateral edge of wound with dehiscence of anterior but not posterior sheath, no erythema, no signs of infection
Ext: WNL

Pertinent Results:
WBC-19.8* RBC-3.60* HGB-10.1* HCT-32.4* PLT COUNT-359

Brief Hospital Course:
The patient was admitted, and a VAC dressing was placed on the wound. VAC therapy was continued with good results. The first scheduled change of the VAC dressing was performed without difficulty and the patient is now discharged home with home health for VAC changes.

Medications on Admission:
Lasix 80mg AM / 40mg PM, Metformin 500mg TID, Humalog sliding scale, NPH 56/50, Dexamethasone 8mg BID

Discharge Medications:
1. Metformin 500 mg PO TID
2. Furosemide 80 mg PO QAM
3. Furosemide 40 mg PO QPM
4. Insulin NPH as directed`,
  },
  {
    title: 'Discharge Summary - Acute MI',
    text: `Chief Complaint: Chest pain

History of Present Illness:
Patient is an elderly male with history of coronary artery disease, prior CABG, hypertension, and hyperlipidemia who presented with acute onset substernal chest pain radiating to left arm associated with diaphoresis and shortness of breath.

Past Medical History:
CAD s/p CABG, CHF (EF 35%), Atrial fibrillation, HTN, HLD, DM2, CKD Stage III

Physical Exam on Admission:
VS: T 98.6, HR 92, BP 145/82, RR 18, O2 96% RA
CV: Irregularly irregular, no murmurs
Pulm: Bibasilar crackles
Ext: 1+ pitting edema bilaterally

Hospital Course:
EKG showed ST elevations in leads V2-V5. Troponin peaked at 12.4. Patient taken for cardiac catheterization which showed 90% stenosis of LAD. Drug-eluting stent placed with good result. Started on dual antiplatelet therapy. Echo showed EF 30% with anterior wall hypokinesis.

Discharge Medications:
1. Aspirin 81mg daily
2. Clopidogrel 75mg daily
3. Metoprolol succinate 50mg daily
4. Lisinopril 5mg daily
5. Atorvastatin 80mg daily
6. Furosemide 40mg daily`,
  },
];
