"""Render a case document (FIR) as a PNG for the Document Intake demo.

The intake pipeline doesn't OCR yet -- it advances the 7 stages and pulls
language / entity counts from the seed tables by matching the filename to a
known FIR. So a useful demo document is one that (a) looks like a real FIR
and (b) is populated with genuine dataset entities, so the story is coherent
and a future real NER pass would have something to find.

Usage:
    python scripts/make_demo_fir.py FIR0001          # render a real seed FIR
    python scripts/make_demo_fir.py --new            # a fabricated follow-up FIR in the SC01 storyline
    python scripts/make_demo_fir.py --all            # FIR0001, FIR0002 + the new one

Output goes to  backend/data/documents/<name>.png  -- which is also where the
frontend evidence viewer looks (/documents/<name>.png), so this doubles as a
fix for the missing seed FIR images.
"""
from __future__ import annotations

import json
import sqlite3
import sys
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont

BACKEND = Path(__file__).resolve().parent.parent
DB = BACKEND / "data" / "vyuham.db"
OUT = BACKEND / "data" / "documents"
FONTS = Path("C:/Windows/Fonts")

W, H = 1240, 1754  # ~A4 at 150 dpi
MARGIN = 90
INK = (24, 28, 32)
MUTED = (90, 98, 106)
RULE = (188, 194, 200)
ACCENT = (12, 107, 102)


def _font(name: str, size: int, index: int = 0) -> ImageFont.FreeTypeFont:
    for cand in (FONTS / name, Path(name)):
        try:
            return ImageFont.truetype(str(cand), size, index=index)
        except OSError:
            continue
    return ImageFont.load_default()


F_H1 = _font("arialbd.ttf", 34)
F_H2 = _font("arialbd.ttf", 19)
F_LBL = _font("arialbd.ttf", 15)
F_BODY = _font("arial.ttf", 17)
F_SMALL = _font("arial.ttf", 13)
# Nirmala UI (.ttc) covers Tamil / Devanagari / Malayalam / Telugu *and* Latin,
# so it doubles as the body font for FIRs whose original text is in an Indic script.
F_NATIVE = _font("Nirmala.ttc", 18)
F_BODY_I = _font("Nirmala.ttc", 17)


def _jl(v):
    if isinstance(v, str) and v[:1] in "[{":
        try:
            return json.loads(v)
        except json.JSONDecodeError:
            return v
    return v


def _fetch(fir_id: str) -> dict:
    con = sqlite3.connect(DB)
    con.row_factory = sqlite3.Row
    fir = con.execute("SELECT * FROM firs WHERE fir_id = ?", (fir_id,)).fetchone()
    if not fir:
        raise SystemExit(f"{fir_id} not in firs table")
    fir = {k: _jl(fir[k]) for k in fir.keys()}
    case = con.execute("SELECT * FROM cases WHERE case_id = ?", (fir["case_id"],)).fetchone()
    inc = con.execute(
        "SELECT * FROM incidents WHERE case_id = ? LIMIT 1", (fir["case_id"],)
    ).fetchone()
    people = {}
    for pid in (fir.get("suspect_person_ids") or []) + (fir.get("victim_person_ids") or []):
        r = con.execute(
            "SELECT person_id, full_name, alias, full_name_native, district FROM people WHERE person_id = ?",
            (pid,),
        ).fetchone()
        if r:
            people[pid] = dict(r)
    con.close()
    return {
        "fir": fir,
        "case": dict(case) if case else {},
        "incident": dict(inc) if inc else {},
        "people": people,
    }


def _new_fir() -> dict:
    """A fabricated follow-up FIR in the SC01 / Lotus Network storyline.

    Every entity id referenced is real (see scenario_cluster_summary SC01),
    but this FIR itself is not in the seed data -- it is the 'genuinely new
    upload' the intake demo processes.
    """
    return {
        "fir": {
            "fir_id": "FIR-2024-DEMO-511",
            "case_id": "CASE0001",
            "fir_number": "SYN-2024-000511",
            "police_station": "Fictional Vellore Station 1",
            "district": "Vellore",
            "state": "Tamil Nadu",
            "registration_date": "2024-02-18",
            "incident_date": "2024-02-17",
            "incident_location": "New Light Incident Site 116",
            "incident_location_id": "L0116",
            "language": "ta",
            "crime_type": "BURGLARY",
            "sections_of_law": ["BNS-305", "BNS-317", "BNS-3(5)"],
            "complainant_text": (
                "I, the branch manager of Thamarai Jewellers (Katpadi Road), report that "
                "on the night of 17 February 2024 the shop shutter lock was forced and "
                "display trays were taken. Staff noticed the mains power had been switched "
                "off at the pole and the CCTV recorder was missing. A two-wheeler was seen "
                "leaving towards New Light Incident Site 116 shortly after 02:00."
            ),
            "complainant_text_native": (
                "17 பிப்ரவரி 2024 இரவு தாமரை நகைக் கடையின் ஷட்டர் பூட்டு உடைக்கப்பட்டது; "
                "CCTV பதிவுக் கருவி காணவில்லை. இரு சக்கர வாகனம் நியூ லைட் 116 பகுதி நோக்கிச் சென்றது."
            ),
            "incident_description": (
                "Witness states suspect Asha Khan (also known locally as 'Aashaa') was seen "
                "near the rear lane around 01:40. A second man, Manu Pillai, waited on a "
                "motorcycle with a partial registration reading TN01__1000. The pattern "
                "matches the earlier Katpadi jewellery-shop entry (rear-window pry, power "
                "isolated, CCTV storage removed). Two mobile numbers, 6100501329 and "
                "8100517167, showed a burst of calls in the two hours before the incident. "
                "Investigators also flagged transfers through accounts A0175 and A0241 the "
                "next morning. The group is believed to operate as 'Lotus Network' (O0001). "
                "All information to be verified independently before any conclusion."
            ),
            "suspect_names": ["Asha Khan", "Manu Pillai"],
            "suspect_person_ids": ["P0400", "P0446"],
            "victim_names": ["Thamarai Jewellers (branch manager)"],
            "victim_person_ids": [],
            "mentioned_phone_numbers": ["6100501329", "8100517167"],
            "mentioned_vehicles": ["TN01__1000"],
            "mentioned_account_ids": ["A0175", "A0241"],
            "mentioned_org_ids": ["O0001"],
        },
        "case": {"case_id": "CASE0001", "case_title": "THEFT inquiry - Vellore",
                 "investigating_officer": "SI Ananya Rao"},
        "incident": {"incident_id": "(pending link)", "crime_type": "BURGLARY",
                     "entry_method": "REAR_WINDOW_PRY", "target_type": "JEWELLERY_SHOP",
                     "weapon_or_tool": "CROWBAR", "escape_method": "MOTORCYCLE",
                     "distinctive_action": "Power isolated and CCTV storage removed"},
        "people": {
            "P0400": {"full_name": "Asha Khan", "alias": "Aashaa", "full_name_native": "आशा खान"},
            "P0446": {"full_name": "Manu Pillai", "alias": None, "full_name_native": "മനു പിള്ള"},
        },
    }


# ---------------------------------------------------------------------------
def render(data: dict, out_name: str) -> Path:
    fir = data["fir"]
    # if the original text is in an Indic script, use the pan-Indic body font
    body_font = F_BODY if fir.get("language") in (None, "en") else F_BODY_I
    img = Image.new("RGB", (W, H), "white")
    d = ImageDraw.Draw(img)
    x = MARGIN
    y = 70

    def rule(yy, colour=RULE, width=1):
        d.line([(MARGIN, yy), (W - MARGIN, yy)], fill=colour, width=width)

    def wrap(text, font, max_w):
        words, line, lines = text.split(), "", []
        for w in words:
            trial = (line + " " + w).strip()
            if d.textlength(trial, font=font) <= max_w:
                line = trial
            else:
                lines.append(line)
                line = w
        if line:
            lines.append(line)
        return lines

    def para(text, font=None, colour=INK, gap=6, lead=24):
        nonlocal y
        font = font or body_font
        for ln in wrap(text, font, W - 2 * MARGIN):
            d.text((x, y), ln, font=font, fill=colour)
            y += lead
        y += gap

    def field(label, value, native=None):
        nonlocal y
        d.text((x, y), label.upper(), font=F_LBL, fill=MUTED)
        d.text((x + 260, y), str(value), font=body_font, fill=INK)
        y += 26
        if native:
            d.text((x + 260, y), native, font=F_NATIVE, fill=INK)
            y += 26

    # ---- header ----
    d.rectangle([(0, 0), (W, 12)], fill=ACCENT)
    d.text((x, y), "GOVERNMENT OF INDIA  |  STATE POLICE  (SYNTHETIC RECORD)", font=F_SMALL, fill=MUTED)
    y += 26
    d.text((x, y), "FIRST INFORMATION REPORT", font=F_H1, fill=INK)
    y += 46
    d.text((x, y), "Under Section 173, Bharatiya Nagarik Suraksha Sanhita, 2023", font=F_SMALL, fill=MUTED)
    y += 30
    rule(y, ACCENT, 2)
    y += 24

    # ---- form fields ----
    field("FIR No.", fir["fir_number"])
    field("Police Station", fir["police_station"])
    field("District / State", f'{fir["district"]}, {fir["state"]}')
    field("Date of registration", fir["registration_date"])
    field("Date of incident", fir["incident_date"])
    field("Crime type", fir["crime_type"])
    field("Sections of law", ", ".join(fir.get("sections_of_law") or []))
    field("Place of occurrence", f'{fir["incident_location"]}  ({fir["incident_location_id"]})',
          native=fir.get("incident_location_native"))
    field("Language of original", {"ta": "Tamil", "hi": "Hindi", "ml": "Malayalam",
                                   "te": "Telugu", "en": "English"}.get(fir.get("language"), fir.get("language")))
    field("Linked case", f'{data["case"].get("case_id", "")}  -  {data["case"].get("case_title", "")}')
    field("Investigating officer", data["case"].get("investigating_officer", "-"))
    y += 6
    rule(y)
    y += 22

    # ---- complainant statement ----
    d.text((x, y), "COMPLAINANT STATEMENT", font=F_H2, fill=ACCENT)
    y += 30
    para(fir.get("complainant_text") or "-")
    if fir.get("complainant_text_native"):
        y += 2
        d.text((x, y), "Original text:", font=F_SMALL, fill=MUTED)
        y += 20
        for ln in wrap(fir["complainant_text_native"], F_NATIVE, W - 2 * MARGIN):
            d.text((x, y), ln, font=F_NATIVE, fill=INK)
            y += 26
    y += 10
    rule(y)
    y += 22

    # ---- incident description ----
    d.text((x, y), "DESCRIPTION OF INCIDENT", font=F_H2, fill=ACCENT)
    y += 30
    para(fir.get("incident_description") or "-")
    y += 4
    rule(y)
    y += 22

    # ---- named entities box ----
    d.text((x, y), "PERSONS, VEHICLES & ACCOUNTS NAMED", font=F_H2, fill=ACCENT)
    y += 30

    def people_line(ids, role):
        nonlocal y
        for pid in ids or []:
            p = data["people"].get(pid, {})
            name = p.get("full_name", "Unknown")
            alias = f'  alias "{p["alias"]}"' if p.get("alias") else ""
            native = f'   {p["full_name_native"]}' if p.get("full_name_native") else ""
            d.text((x, y), f'{role}:  {name}{alias}  [{pid}]', font=F_BODY, fill=INK)
            if native:
                d.text((x + d.textlength(f'{role}:  {name}{alias}  [{pid}]', font=F_BODY) + 12, y),
                       native, font=F_NATIVE, fill=MUTED)
            y += 25

    people_line(fir.get("suspect_person_ids"), "Suspect")
    for nm in fir.get("victim_names") or []:
        d.text((x, y), f"Complainant / victim:  {nm}", font=body_font, fill=INK)
        y += 25
    y += 6
    field("Phone numbers", ", ".join(fir.get("mentioned_phone_numbers") or []))
    field("Vehicle (partial)", ", ".join(fir.get("mentioned_vehicles") or []))
    field("Bank accounts", ", ".join(fir.get("mentioned_account_ids") or []))
    field("Organisation", ", ".join(fir.get("mentioned_org_ids") or []))

    inc = data.get("incident") or {}
    if inc:
        y += 6
        d.text((x, y), "MODUS OPERANDI (from linked incident)", font=F_LBL, fill=MUTED)
        y += 24
        mo = " / ".join(str(inc.get(k)) for k in
                        ("entry_method", "target_type", "weapon_or_tool", "escape_method")
                        if inc.get(k))
        para(mo or "-", font=F_BODY)
        if inc.get("distinctive_action"):
            para(f'Distinctive: {inc["distinctive_action"]}', font=F_SMALL, colour=MUTED, lead=18)

    # ---- footer (just below the content, not pinned to the page bottom) ----
    fy = y + 40
    rule(fy, ACCENT, 2)
    d.text((x, fy + 14),
           "SYNTHETIC DOCUMENT - generated for the SIH26189 Vyuham Intelligence prototype. "
           "Not a real police record. All persons and events are fictional.",
           font=F_SMALL, fill=MUTED)
    d.text((x, fy + 40), f'Document ref: {fir["fir_id"]}     Case: {fir["case_id"]}     '
           f'Generated by scripts/make_demo_fir.py', font=F_SMALL, fill=MUTED)

    img = img.crop((0, 0, W, min(H, fy + 80)))
    OUT.mkdir(parents=True, exist_ok=True)
    path = OUT / f"{out_name}.png"
    img.save(path, "PNG")
    return path


def main() -> None:
    args = sys.argv[1:] or ["--all"]
    targets: list[tuple[dict, str]] = []

    if "--all" in args:
        targets += [(_fetch("FIR0001"), "FIR0001"), (_fetch("FIR0002"), "FIR0002")]
        targets.append((_new_fir(), "FIR-2024-DEMO-511"))
    elif "--new" in args:
        targets.append((_new_fir(), "FIR-2024-DEMO-511"))
    else:
        for a in args:
            targets.append((_fetch(a), a))

    for data, name in targets:
        p = render(data, name)
        print(f"  wrote {p}  ({p.stat().st_size // 1024} KB)")
    print("\nServed at /documents/<name>.png -- upload one via the Document Intake screen.")


if __name__ == "__main__":
    main()
