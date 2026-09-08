import sqlite3
import json

conn = sqlite3.connect(r'D:\work\Projects\VYUHAM\backend\data\vyuham.db')
cursor = conn.cursor()

cursor.execute("SELECT name FROM sqlite_master WHERE type='table';")
tables = [row[0] for row in cursor.fetchall()]
print("Tables:", tables)

for t in tables:
    cursor.execute(f"PRAGMA table_info({t});")
    cols = [r[1] for r in cursor.fetchall()]
    print(f"Table {t} columns:", cols)

cursor.execute("SELECT source_entity_id, target_entity_id, relationship_type, confidence_score, evidence_ids FROM relationships WHERE case_id='CASE0051' AND (source_entity_id='P0400' OR target_entity_id='P0400');")
print("\nAsha's Relationships:")
for r in cursor.fetchall():
    print(f"  {r[0]} --{r[2]}--> {r[1]} (conf: {r[3]}, evidence: {r[4]})")
