# Entity Summary Dataset Report

All records are fictional and intended only for the SIH26189 academic criminal-network-analysis prototype.

## Output

- `entity_summaries.jsonl`: 850 JSONL records
- Encoding: UTF-8 without BOM
- Structure: one JSON object per line; no wrapping array
- Evidence references: validated against `evidence.jsonl`

## Generated summaries by entity type

| Entity type | Generated | Eligible in source graph | Selection rule |
|---|---:|---:|---|
| PERSON | 400 | 1000 | Scenario entities first, then highest evidence connectivity |
| ORG | 120 | 120 | All organizations |
| VEHICLE | 80 | 80 | All vehicles appearing in 2+ relationship/evidence rows |
| PHONE | 120 | 687 | Scenario phones first, then highest evidence connectivity |
| ACCOUNT | 100 | 963 | Scenario accounts first, then highest evidence connectivity |
| LOCATION | 30 | 45 | Scenario locations first, then highest evidence connectivity |
| **Total** | **850** |  |  |

## Evidence-depth categories

| Category | Definition | Rows |
|---|---|---:|
| Thin / low-confidence | 1–2 evidence IDs and confidence 0.40–0.60 | 150 |
| Rich / high-confidence | 2–6 evidence IDs and confidence above 0.60 | 700 |

## Eligibility conflict and deterministic resolution

The literal requested inclusion rules identify 2850 entities before optional locations: 1000 connected people, 120 organizations, 80 vehicles with 2+ evidence rows, 687 phones with 2+ evidence rows, and 963 accounts with 2+ evidence rows. That cannot fit the requested 700–900-row target. This package therefore uses a deterministic 850-row investigative subset, includes every organization and every qualifying vehicle, prioritizes all scenario-cluster entities, and ranks remaining entities by evidence connectivity. The selection is reproducible from the source graph.

## Grounding and safety

Every cited evidence ID exists and is directly attached to the summarized entity through `relationships.jsonl`. Summary text only describes those selected relationships, evidence case IDs, source types, and reliability levels. Risk indicators use only the supplied controlled vocabulary. Language remains neutral and non-accusatory, and low-confidence background nodes are explicitly presented as limited connections requiring source review.
