# Final Synthetic Dataset Consistency Report

All data is fictional and intended only for the SIH26189 academic criminal-network-analysis prototype.

## Final batch row counts

| File | Rows |
|---|---:|
| cases.jsonl | 300 |
| incidents.jsonl | 360 |
| criminal_history.jsonl | 300 |
| mo_ground_truth.jsonl | 205 |
| network_ground_truth.jsonl | 126 |
| evidence_gaps.jsonl | 70 |
| influencer_ground_truth.jsonl | 90 |
| suspicious_pattern_ground_truth.jsonl | 100 |
| **Final batch total** | **1551** |

## Final consistency checks

- Scenario registry: 18 existing scenarios (SC01, SC02, SC03, SC04, SC05, SC06, SC07, SC08, SC09, SC10, SC11, SC12, SC13, SC14, SC15, SC16, SC17, SC18). Every explicit scenario ID in Tasks 25 and 27 resolves. Task 28 follows its defined schema, which has no `scenario_id` field; its scenario linkage is grounded through the supporting transaction/call record IDs.
- Case integrity: every `case_id` in `incidents.jsonl` and `criminal_history.jsonl` resolves to `cases.jsonl`.
- Entity integrity: zero unresolved entity IDs across network, evidence-gap, influencer, and suspicious-pattern ground truth.
- Source-record integrity: every suspicious-pattern supporting record resolves to `transactions.jsonl` or `call_records.jsonl`.
- JSONL integrity: all eight files are UTF-8 without BOM, contain one JSON object per line, use literal Unicode, and have no wrapping arrays.
- Case volume note: the existing FIR registry contains exactly 300 unique case IDs, so Task 21 correctly contains 300 rows rather than the prompt's rough 400–500 estimate.

## Benchmark design summary

- MO signatures: 9; positive incidents: 45; close negatives: 18; one-off background incidents: 297.
- MO evaluation pairs: 205 total (90 same-pattern positives and 115 negatives).
- Network evaluation: 126 rows; 90 TRUE and 36 FALSE.
- Criminal history: 300 rows across 250 people, including 25 people with multiple records and 45 LOW-risk historical rows.
- Evidence gaps: 70 rows, including all 6 planted missing-location windows.
- Influencer evaluation: 90 rows; all five planted broker-phone owners appear as BETWEENNESS / BROKER_BETWEEN_CLUSTERS examples.
- Suspicious-pattern evaluation: 100 rows with 80 TRUE cases and 20 deliberate false-positive traps. Pattern counts: CIRCULAR_FLOW=10, CROSS_CASE_RECURRENCE=24, MULE_ACCOUNT=6, PRE_INCIDENT_CALL_BURST=20, STRUCTURING=17, UNUSUAL_TIMING=23.

## Completion status for all 28 datasets

| Task | Dataset | Rows | Status |
|---:|---|---:|---|
| 1 | people.xlsx | 1000 | Complete |
| 2 | identity_ground_truth.xlsx | 300 | Complete |
| 3 | organizations.jsonl | 120 | Complete |
| 4 | vehicles.jsonl | 800 | Complete |
| 5 | locations.jsonl | 350 | Complete |
| 6 | devices.jsonl | 1200 | Complete |
| 7 | phone_ownership.jsonl | 2000 | Complete |
| 8 | bank_accounts.jsonl | 1500 | Complete |
| 9 | call_records.jsonl | 25000 | Complete |
| 10 | transactions.jsonl | 15000 | Complete |
| 11 | location_events.jsonl | 20000 | Complete |
| 12 | org_membership.jsonl | 450 | Complete |
| 13 | relationships.jsonl | 9000 | Complete |
| 14 | firs.jsonl | 600 | Complete |
| 15 | documents.jsonl | 150 | Complete |
| 16 | evidence.jsonl | 9000 | Complete |
| 17 | social_media_mentions.jsonl | 300 | Complete |
| 18 | translations.jsonl | 1202 | Complete |
| 19 | translation_ground_truth.jsonl | 250 | Complete |
| 20 | entity_summaries.jsonl | 850 | Complete |
| 21 | cases.jsonl | 300 | Complete (source-constrained) |
| 22 | incidents.jsonl | 360 | Complete |
| 23 | criminal_history.jsonl | 300 | Complete |
| 24 | mo_ground_truth.jsonl | 205 | Complete |
| 25 | network_ground_truth.jsonl | 126 | Complete |
| 26 | evidence_gaps.jsonl | 70 | Complete |
| 27 | influencer_ground_truth.jsonl | 90 | Complete |
| 28 | suspicious_pattern_ground_truth.jsonl | 100 | Complete |

All 28 requested datasets are complete for the final demo. No dataset currently requires scaling to meet its specified volume range; Task 21 is explicitly source-constrained by the 300 unique case IDs already present in the FIR/evidence registry.
