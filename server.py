from flask import Flask, request, jsonify, render_template
import os
from flask import Flask, request, jsonify
import psycopg2

app = Flask(__name__)

def get_db_connection():
    conn = psycopg2.connect(
        host="localhost",
        database="cattle_iot",
        user="postgres",
        password="1234",
        port="5432"
    )
    return conn

def create_table():
    conn = get_db_connection()
    cursor = conn.cursor()

    # Table 1: Registered animals
    cursor.execute("""
        CREATE TABLE IF NOT EXISTS animals (
            animal_id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
            tag_uid VARCHAR(32) UNIQUE NOT NULL,
            animal_name VARCHAR(100),
            created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
        )
    """)

    # Table 2: RFID scan history
    cursor.execute("""
        CREATE TABLE IF NOT EXISTS rfid_scans (
            id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
            tag_uid VARCHAR(32) NOT NULL,
            device_id VARCHAR(50) NOT NULL DEFAULT 'ESP32_01',
            scanned_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
        )
    """)

    # Indexes for faster queries
    cursor.execute("""
        CREATE INDEX IF NOT EXISTS idx_rfid_scans_tag_uid
        ON rfid_scans (tag_uid)
    """)

    cursor.execute("""
        CREATE INDEX IF NOT EXISTS idx_rfid_scans_scanned_at
        ON rfid_scans (scanned_at)
    """)

    conn.commit()
    cursor.close()
    conn.close()

    print("Animals and RFID scan tables created successfully!")


@app.route("/", methods=["GET"])
def home():
    return render_template("dashboard.html")


@app.route("/api/dashboard/scans")
def dashboard_scans():
    conn = None
    cursor = None

    try:
        conn = get_db_connection()
        cursor = conn.cursor()

        cursor.execute("""
            SELECT
                s.id,
                s.tag_uid,
                s.device_id,
                s.scanned_at,
                a.animal_id,
                a.animal_name
            FROM rfid_scans AS s
            LEFT JOIN animals AS a
                ON a.tag_uid = s.tag_uid
            ORDER BY s.scanned_at DESC
            LIMIT 100
        """)

        rows = cursor.fetchall()

        scans = [{
            "id": row[0],
            "tag_uid": row[1],
            "device_id": row[2],
            "scanned_at": row[3].isoformat(),
            "animal_id": row[4],
            "animal_name": row[5]
        } for row in rows]

        return jsonify(scans)

    except psycopg2.Error:
        if conn:
            conn.rollback()

        app.logger.exception("Dashboard query failed")

        return jsonify({
            "error": "Database query failed"
        }), 500

    finally:
        if cursor:
            cursor.close()
        if conn:
            conn.close()

@app.route("/api/rfid", methods=["POST"])
def receive_rfid():
    data = request.get_json(silent=True)

    if not data or not data.get("uid"):
        return jsonify({
            "status": "error",
            "message": "Missing RFID UID"
        }), 400

    uid = str(data["uid"]).strip().upper()
    device_id = str(data.get("device_id", "ESP32_01"))

    if len(uid) > 32 or not uid or len(device_id) > 50:
        return jsonify({
            "status": "error",
            "message": "Invalid UID or device ID"
        }), 400

    conn = None
    cursor = None

    try:
        conn = get_db_connection()
        cursor = conn.cursor()

        # Find the registered animal
        cursor.execute("""
            SELECT animal_id, animal_name
            FROM animals
            WHERE tag_uid = %s
        """, (uid,))

        animal = cursor.fetchone()

        # Save the scan
        cursor.execute("""
            INSERT INTO rfid_scans (tag_uid, device_id)
            VALUES (%s, %s)
            RETURNING id, scanned_at
        """, (uid, device_id))

        scan_id, scanned_at = cursor.fetchone()
        conn.commit()

        animal_id = animal[0] if animal else None
        animal_name = animal[1] if animal else None

        print("RFID scan saved successfully!")
        print("UID:", uid)
        print("Animal:", animal_name or "Unregistered tag")
        print("Record ID:", scan_id)

        return jsonify({
            "status": "success",
            "scan_id": scan_id,
            "uid": uid,
            "device_id": device_id,
            "animal_id": animal_id,
            "animal_name": animal_name,
            "scanned_at": scanned_at.isoformat()
        }), 200

    except psycopg2.Error:
        if conn:
            conn.rollback()

        app.logger.exception("PostgreSQL operation failed")

        return jsonify({
            "status": "error",
            "message": "Database operation failed"
        }), 500

    finally:
        if cursor:
            cursor.close()
        if conn:
            conn.close()


@app.route("/api/dashboard/animals", methods=["GET"])
def dashboard_animals():
    conn = None
    cursor = None

    try:
        conn = get_db_connection()
        cursor = conn.cursor()

        cursor.execute("""
            SELECT
                a.animal_id,
                a.tag_uid,
                a.animal_name,
                MAX(s.scanned_at) AS last_seen
            FROM animals AS a
            LEFT JOIN rfid_scans AS s
                ON s.tag_uid = a.tag_uid
            GROUP BY
                a.animal_id,
                a.tag_uid,
                a.animal_name
            ORDER BY a.animal_id
        """)

        rows = cursor.fetchall()

        animals = [{
            "animal_id": row[0],
            "tag_uid": row[1],
            "animal_name": row[2],
            "last_seen": row[3].isoformat() if row[3] else None
        } for row in rows]

        return jsonify(animals)

    except psycopg2.Error:
        app.logger.exception("Could not load registered cattle")
        return jsonify({"error": "Database query failed"}), 500

    finally:
        if cursor:
            cursor.close()
        if conn:
            conn.close()


if __name__ == "__main__":
    create_table()
    app.run(host="0.0.0.0", port=5000, debug=False)
