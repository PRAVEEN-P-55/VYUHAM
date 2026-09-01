# Translation Dataset Summary

All records in this package are fictional and intended only for the SIH26189 academic criminal-network-analysis prototype.

## Output files

- `translations.jsonl`: 1,202 JSONL records
- `translation_ground_truth.jsonl`: 250 JSONL records

Both files are UTF-8 without BOM, contain one JSON object per line, use literal Unicode text, and are not wrapped in JSON arrays.

## Translation rows by source language

| Source language | Rows |
|---|---:|
| Tamil (ta) | 303 |
| Hindi (hi) | 295 |
| Malayalam (ml) | 306 |
| Telugu (te) | 298 |
| **Total** | **1202** |

## Translation method

| Method | Rows | Share |
|---|---:|---:|
| MT | 1022 | 85.0% |
| HUMAN_REVIEWED | 180 | 15.0% |

The MT population includes 153 controlled imperfections (15.0% of MT rows), including 102 code-mix cases (10.0% of MT rows). Human-reviewed rows are clean and use confidence 1.0.

## Ground-truth evaluation distribution

| Accuracy label | Rows | Share |
|---|---:|---:|
| ACCURATE | 150 | 60.0% |
| MINOR_ERROR | 63 | 25.2% |
| MAJOR_ERROR | 37 | 14.8% |
| **Total** | **250** | **100.0%** |

The 250-row benchmark is a stratified sample: it contains 140 human-reviewed baselines, 10 clean MT rows, 63 minor-error MT rows, and 37 major-error MT rows. This preserves the requested 60% / 25% / 15% evaluation profile while representing both reviewed and unreviewed clean translations.

## Translation IDs flagged as MAJOR_ERROR

- `TR0008`
- `TR0009`
- `TR0060`
- `TR0062`
- `TR0064`
- `TR0066`
- `TR0068`
- `TR0070`
- `TR0072`
- `TR0074`
- `TR0076`
- `TR0078`
- `TR0158`
- `TR0159`
- `TR0160`
- `TR0161`
- `TR0162`
- `TR0163`
- `TR0164`
- `TR0165`
- `TR0166`
- `TR0167`
- `TR0168`
- `TR0169`
- `TR0640`
- `TR0641`
- `TR0642`
- `TR0643`
- `TR0738`
- `TR0739`
- `TR0750`
- `TR0751`
- `TR0758`
- `TR0759`
- `TR0848`
- `TR0858`
- `TR0859`

These cases demonstrate why the interface should let an investigator open the original document image or source text from a graph node. In particular, a mistranslated name or dropped negation can materially alter entity resolution or investigative meaning, so the English summary must never be treated as unquestionable evidence.
