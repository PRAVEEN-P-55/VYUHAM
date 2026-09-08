import sqlite3
import random

conn = sqlite3.connect(r'D:\work\Projects\VYUHAM\backend\data\vyuham.db')
cursor = conn.cursor()

# Get all relationships for CASE0051 that have no valid_from
cursor.execute("SELECT relationship_id FROM relationships WHERE evidence_id='EV-GRAPH-DEMO'")
rels = cursor.fetchall()

# Generate some random dates in 2023 for them
dates = [
    "2023-01-15T10:00:00Z",
    "2023-02-20T14:30:00Z",
    "2023-03-05T09:15:00Z",
    "2023-04-12T16:45:00Z",
    "2023-05-22T11:20:00Z",
    "2023-06-30T08:00:00Z",
    "2023-07-18T13:10:00Z",
    "2023-08-09T15:55:00Z",
    "2023-09-25T12:40:00Z",
    "2023-10-11T17:25:00Z",
]

for row in rels:
    rel_id = row[0]
    random_date = random.choice(dates)
    cursor.execute("UPDATE relationships SET valid_from=? WHERE relationship_id=?", (random_date, rel_id))

conn.commit()
print("Updated relationships with random dates.")
