import { REAL_PUESTOS } from "../src/dev/realDataSeed.js";

def find_slots(line_id):
    slots = [p for p in REAL_PUESTOS if p["lineId"] == line_id]
    print(f"\nSlots for {line_id}:")
    for s in slots:
        print(f"  ID: {s['id']}, Name: {s['puestoName']}, Type: {s['tipoPuesto']}, Titular: {s['idWorkerOriginal']}")

find_slots("L1")
find_slots("L4")
find_slots("L6")
