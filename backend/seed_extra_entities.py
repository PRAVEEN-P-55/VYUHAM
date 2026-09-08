import sqlite3
import json
import uuid

conn = sqlite3.connect(r'D:\work\Projects\VYUHAM\backend\data\vyuham.db')
cursor = conn.cursor()

CASE = 'CASE0051'
ROOT = 'P0400'
EVIDENCE = 'EV-GRAPH-DEMO'

# Insert dummy evidence mapping log for all these
def add_rel(src, target, rel_type):
    rel_id = f"R-{uuid.uuid4().hex[:8]}"
    cursor.execute("""
        INSERT INTO relationships (relationship_id, source_entity_id, target_entity_id, relationship_type, review_status, evidence_id)
        VALUES (?, ?, ?, ?, 'CONFIRMED', ?)
    """, (rel_id, src, target, rel_type, EVIDENCE))
    
    cursor.execute("""
        INSERT INTO evidence_mapping_log (evidence_id, relationship_id, case_id)
        VALUES (?, ?, ?)
    """, (EVIDENCE, rel_id, CASE))
    return rel_id

# 1. New Phones
phones = [
    ('PH0090', '+91 9876543200', 'Phone 90'),
    ('PH0091', '+91 9876543201', 'Phone 91'),
    ('PH0092', '+91 9876543202', 'Phone 92'),
]
for ph in phones:
    cursor.execute("INSERT OR IGNORE INTO phone_ownership (phone_id, phone_number, verification_status) VALUES (?, ?, 'CONFIRMED')", (ph[0], ph[1]))
    add_rel(ROOT, ph[0], 'OWNER_OF')

# 2. New Vehicles
vehicles = [
    ('V0090', 'TN 01 AB 1234', 'Vehicle 90'),
    ('V0091', 'KA 05 CD 5678', 'Vehicle 91'),
]
for v in vehicles:
    cursor.execute("INSERT OR IGNORE INTO vehicles (vehicle_id, registration_number, vehicle_type) VALUES (?, ?, 'CAR')", (v[0], v[1]))
    add_rel(ROOT, v[0], 'OWNER_OF')

# 3. New People
people = [
    ('P0410', 'Rahul Sharma'),
    ('P0411', 'Anita Desai'),
    ('P0412', 'Vikram Singh'),
    ('P0413', 'Sneha Kapoor'),
]
for p in people:
    cursor.execute("INSERT OR IGNORE INTO people (person_id, full_name, risk_label) VALUES (?, ?, 'MEDIUM')", (p[0], p[1]))
    add_rel(ROOT, p[0], 'ASSOCIATED_WITH')

# Interconnections
add_rel('P0410', 'PH0091', 'CALLS')
add_rel('P0411', 'V0090', 'DRIVER_OF')
add_rel('P0412', 'P0413', 'ASSOCIATED_WITH')
add_rel('P0413', 'PH0092', 'CALLS')

# Additional 2nd hop people
people2 = [
    ('P0414', 'Kabir Khan'),
    ('P0415', 'Meera Reddy'),
]
for p in people2:
    cursor.execute("INSERT OR IGNORE INTO people (person_id, full_name, risk_label) VALUES (?, ?, 'LOW')", (p[0], p[1]))

add_rel('P0410', 'P0414', 'ASSOCIATED_WITH')
add_rel('P0411', 'P0415', 'ASSOCIATED_WITH')

# Additional 3rd hop
add_rel('P0414', 'V0091', 'PASSENGER_OF')

# Let's add some Bank Accounts
accounts = [
    ('A0090', 'HDFC Bank - 1234', 'SAVINGS'),
    ('A0091', 'SBI - 5678', 'CURRENT'),
]
for a in accounts:
    cursor.execute("INSERT OR IGNORE INTO bank_accounts (account_id, bank_code, account_type) VALUES (?, ?, ?)", (a[0], a[1][:4], a[2]))
    add_rel(ROOT, a[0], 'HOLDS_ACCOUNT')

add_rel('P0412', 'A0090', 'TRANSFERS_TO')
add_rel('P0414', 'A0091', 'TRANSFERS_TO')

conn.commit()
print("Successfully seeded extra entities for P0400.")
