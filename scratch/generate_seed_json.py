import pandas as pd
import json
import os

def generate_seed():
    excel_file = "Base de Datos.xlsx"
    if not os.path.exists(excel_file):
        print(f"Error: {excel_file} not found!")
        return

    # 1. Read Personal Sheet (Real Workers)
    df_personal = pd.read_excel(excel_file, sheet_name="Personal")
    
    # Read Personal ausente
    df_ausentes = pd.read_excel(excel_file, sheet_name="Personal ausente")
    
    # Create a mapping of CodEmpleado -> CodSalida (absence status)
    ausentes_map = {}
    for idx, row in df_ausentes.iterrows():
        cod_emp = str(row["CodEmpleado"]).strip()
        if cod_emp.endswith(".0"):
            cod_emp = cod_emp[:-2]
        cod_salida = str(row["CodSalida"]).strip()
        
        # Map CodSalida to official status
        status_map = {
            "Emergencia": "PERMISOS",
            "Permiso": "PERMISOS",
            "Vacaciones": "VACACIONES",
            "Subsidio": "SUBSIDIOS",
            "Consulta": "CONSULTAS_MEDICAS"
        }
        ausentes_map[cod_emp] = status_map.get(cod_salida, "INACTIVO")
        
    print(f"Loaded {len(ausentes_map)} active absences from excel.")

    # Parse and build real workers list
    workers = []
    
    operators_pool = []
    averieros_pool = []
    general_pool = []
    
    for idx, row in df_personal.iterrows():
        cod_emp = str(row["CodEmpleado"]).strip()
        if cod_emp.endswith(".0"):
            cod_emp = cod_emp[:-2]
        nombre = str(row["Nombre Completo"]).strip()
        sexo_raw = str(row["Sexo"]).strip()
        perfil_raw = str(row["Perfil"]).strip()
        activo = row["Activo"]
        
        if not activo:
            continue
            
        # Standardize gender
        sexo = "Masculino" if sexo_raw.upper() == "MASCULINO" else "Femenino"
        
        # Determine status
        status = "POOL_ARRANQUE" # default: present and active
        if cod_emp in ausentes_map:
            status = ausentes_map[cod_emp]
            
        # Seed 10% medical restrictions procedurally to keep system functional
        restrictions = []
        if idx % 9 == 2:
            restrictions = ["ESFUERZO_FISICO"]
        elif idx % 9 == 7:
            restrictions = ["CARGA_PESADA"]
            
        worker_id = f"WORKER_{cod_emp}"
        
        role_map = {
            "OPERARIO": "Operario",
            "OPERADOR DE EQUIPOS": "Operador A",
            "OPERARIO DE CONTROL DE AVERIAS": "Averiero",
            "SUPERVISOR DE LINEA": "Supervisor",
            "COORDINADOR LINEAS DE ENVASADO": "Coordinador",
            "COORDINADOR DE MATERIALES DE PRODUCCION": "Coordinador",
            "JEFE DE EMBOTELLADO": "Jefe",
            "ANALISTA DE PROCESOS": "Analista",
            "ASISTENTE ADMINISTRATIVO": "Asistente",
            "OPERADOR DE CALDERAS": "Operador Calderas",
            "OPERARIO DE FILTROS Y TANQUERIA": "Operario Filtros",
            "AUXILIAR DE CONTROL DE MATERIALES": "Auxiliar Materiales"
        }
        role = role_map.get(perfil_raw.upper(), "Operario")
        
        worker_doc = {
            "id": worker_id,
            "name": nombre,
            "sexo": sexo,
            "role": role,
            "status": status,
            "medicalRestrictions": restrictions,
            "lastActivity": "Empacadora",
            "physicalLineLocation": None,
            "currentSlotId": None
        }
        
        if perfil_raw == "OPERADOR DE EQUIPOS":
            operators_pool.append(worker_doc)
        elif perfil_raw == "OPERARIO DE CONTROL DE AVERIAS":
            averieros_pool.append(worker_doc)
        else:
            general_pool.append(worker_doc)
            
    print(f"Parsed {len(operators_pool)} operators, {len(averieros_pool)} averieros, {len(general_pool)} general operarios.")

    # 2. Read Puestos Fijos (Real Positions)
    df_puestos = pd.read_excel(excel_file, sheet_name="Puestos Fijos")
    df_puestos = df_puestos.dropna(subset=["IdPuesto"])
    
    puestos = []
    assigned_workers = set()
    
    for idx, row in df_puestos.iterrows():
        id_puesto_excel = str(row["IdPuesto"]).strip()
        nombre_puesto = str(row["NombrePuesto"]).strip()
        sexo_pref = str(row["SexoPreferente"]).strip()
        perfil_req = str(row["PerfilRequerido"]).strip()
        
        # Clean values
        if pd.isna(row["NombrePuesto"]) or nombre_puesto == "nan":
            nombre_puesto = "Puesto Auxiliar"
        if pd.isna(row["SexoPreferente"]) or sexo_pref == "nan":
            sexo_pref = "Indistinto"
        if pd.isna(row["PerfilRequerido"]) or perfil_req == "nan":
            perfil_req = "Indistinto"
            
        # Omit Supervisor posts completely
        if "supervisor" in nombre_puesto.lower() or "supervisor" in perfil_req.lower():
            continue
            
        # Parse Line ID (e.g. L01 -> L1, L02 -> L2, etc.)
        line_num_str = id_puesto_excel[1:3]
        try:
            line_num = int(line_num_str)
            line_id = f"L{line_num}"
        except:
            line_id = "L1" # fallback
            
        slot_id = f"SLOT_{line_id}_{id_puesto_excel[3:]}"
        
        tipo_puesto = "Puesto Vario"
        if "averiero" in perfil_req.lower() or "averiero" in nombre_puesto.lower():
            tipo_puesto = "Averiero"
        elif "operador" in perfil_req.lower():
            tipo_puesto = "Operador A"
            
        tiempo_en_puesto = None
        if not pd.isna(row["TiempoEnPuesto"]):
            try:
                tiempo_en_puesto = float(row["TiempoEnPuesto"])
            except:
                pass
                
        tiempo_recup = None
        if not pd.isna(row["TiempoDeRecup"]):
            try:
                tiempo_recup = float(row["TiempoDeRecup"])
            except:
                pass

        req_caps = []
        if tipo_puesto == "Operador A":
            req_caps = ["ESFUERZO_FISICO"]
        elif tipo_puesto == "Averiero":
            req_caps = ["CARGA_PESADA"]
            
        id_worker_original = None
        
        if tipo_puesto == "Operador A":
            for op in operators_pool:
                if op["id"] not in assigned_workers:
                    if sexo_pref == "Indistinto" or op["sexo"] == sexo_pref:
                        id_worker_original = op["id"]
                        op["role"] = "Operador A"
                        op["lastActivity"] = nombre_puesto
                        assigned_workers.add(op["id"])
                        break
            if not id_worker_original:
                for op in operators_pool:
                    if op["id"] not in assigned_workers:
                        id_worker_original = op["id"]
                        op["role"] = "Operador A"
                        op["lastActivity"] = nombre_puesto
                        assigned_workers.add(op["id"])
                        break
                        
        elif tipo_puesto == "Averiero":
            for av in averieros_pool:
                if av["id"] not in assigned_workers:
                    id_worker_original = av["id"]
                    av["role"] = "Averiero"
                    av["lastActivity"] = nombre_puesto
                    assigned_workers.add(av["id"])
                    break
                    
        puesto_doc = {
            "id": slot_id,
            "lineId": line_id,
            "puestoName": nombre_puesto,
            "tipoPuesto": tipo_puesto,
            "status": "VACANTE",
            "idWorkerCurrent": None,
            "idWorkerOriginal": id_worker_original,
            "requiredCapabilities": req_caps,
            "sexoPreferente": sexo_pref,
            "tiempoEnPuesto": tiempo_en_puesto,
            "tiempoMinRecuperacion": tiempo_recup,
            "asignadoEnSegundoVirtual": None
        }
        puestos.append(puesto_doc)
        
    print(f"Mapped {len(puestos)} puestos and assigned {len(assigned_workers)} critical titulars.")
    
    for op in operators_pool:
        if op["id"] not in assigned_workers:
            op["role"] = "Operador B"
            op["lastActivity"] = "Área de Relevo"
            
    all_workers = []
    all_workers.extend(operators_pool)
    all_workers.extend(averieros_pool)
    all_workers.extend(general_pool)
    
    print(f"Total structured workers to seed: {len(all_workers)}")

    # 3. Read Programa Sheet (Real Production Orders)
    df_programa = pd.read_excel(excel_file, sheet_name="Programa")
    df_programa = df_programa.dropna(how='all', axis=1) # drop completely empty columns
    
    programa_orders = []
    for idx, row in df_programa.iterrows():
        # Estandarizar la fecha YYYY-MM-DD
        fecha_val = row["FechaProd"]
        if pd.isna(fecha_val):
            continue
        try:
            fecha_str = str(fecha_val).split(" ")[0].strip()
        except:
            continue
            
        linea_raw = str(row["Linea"]).strip()
        # Mapear "Linea X" -> "LX"
        line_id = "L1"
        if "1" in linea_raw: line_id = "L1"
        elif "2" in linea_raw: line_id = "L2"
        elif "3" in linea_raw: line_id = "L3"
        elif "4" in linea_raw: line_id = "L4"
        elif "5" in linea_raw: line_id = "L5"
        elif "6" in linea_raw: line_id = "L6"
        elif "7" in linea_raw: line_id = "L7"
        elif "8" in linea_raw: line_id = "L8"
        elif "9" in linea_raw: line_id = "L9"
        elif "10" in linea_raw: line_id = "L10"
        
        orden_proceso = str(row["OrdenProceso"]).strip() if not pd.isna(row["OrdenProceso"]) else f"SEQ-{idx+1}"
        if orden_proceso.endswith(".0"):
            orden_proceso = orden_proceso[:-2]
            
        item_sku = str(row["Item"]).strip()
        cajas = int(row["Cajas"]) if not pd.isna(row["Cajas"]) else 0
        botellas = int(row["Botellas"]) if not pd.isna(row["Botellas"]) else 0
        tipo_bot = str(row["TipoBot"]).strip() if not pd.isna(row["TipoBot"]) else "R"
        producto = str(row["Producto"]).strip() if not pd.isna(row["Producto"]) else "Producto Genérico"
        turno = str(row["Turno"]).strip() if not pd.isna(row["Turno"]) else "1T8"
        velocidad = float(row["Velocidad"]) if not pd.isna(row["Velocidad"]) else 250.0
        comentario = str(row["Comentario"]).strip() if not pd.isna(row["Comentario"]) else ""
        if comentario == "nan": comentario = ""
        
        order_doc = {
            "id": f"ORD_{fecha_str}_{line_id}_{orden_proceso}_{item_sku}",
            "ordenProceso": orden_proceso,
            "fechaProd": fecha_str,
            "lineaId": line_id,
            "item": item_sku,
            "cajas": cajas,
            "botellas": botellas,
            "tipoBot": tipo_bot,
            "producto": producto,
            "turno": turno,
            "velocidad": velocidad,
            "comentario": comentario
        }
        programa_orders.append(order_doc)
        
    print(f"Parsed {len(programa_orders)} real production orders from sheet Programa.")

    # Write to realDataSeed.js in src/dev/
    js_content = f"""/**
 * Static Real Data Seed generated from Base de Datos.xlsx
 * Contains {len(puestos)} physical positions, {len(all_workers)} structured workers, and {len(programa_orders)} production orders
 */

export const REAL_PUESTOS = {json.dumps(puestos, indent=2, ensure_ascii=False)};

export const REAL_TRABAJADORES = {json.dumps(all_workers, indent=2, ensure_ascii=False)};

export const REAL_PROGRAMA = {json.dumps(programa_orders, indent=2, ensure_ascii=False)};
"""
    
    output_path = "src/dev/realDataSeed.js"
    with open(output_path, "w", encoding="utf-8") as f:
        f.write(js_content)
        
    print(f"Success: Wrote static seed data to {output_path}")

if __name__ == "__main__":
    generate_seed()
