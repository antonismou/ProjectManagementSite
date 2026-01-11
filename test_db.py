import mysql.connector
import os

try:
    # Try connecting with 'pms' user first (as per docker-compose)
    print("Attempting connection as user 'pms'...")
    conn = mysql.connector.connect(
        host="localhost",
        user="pms",
        password="pms",
        database="pms",
        port=3306
    )
except mysql.connector.Error as err:
    print(f"Connection as 'pms' failed: {err}")
    try:
        # Try 'root' as fallback
        print("Attempting connection as user 'root'...")
        conn = mysql.connector.connect(
            host="localhost",
            user="root",
            password="root",
            database="pms",
            port=3306
        )
    except mysql.connector.Error as err2:
        print(f"Connection as 'root' failed: {err2}")
        exit(1)

print("Successfully connected to database.")
cursor = conn.cursor()

print("\n--- Tables in 'pms' database ---")
cursor.execute("SHOW TABLES")
tables = cursor.fetchall()
for (table_name,) in tables:
    print(f"- {table_name}")

print("\n--- Columns in 'tasks' table ---")
try:
    cursor.execute("DESCRIBE tasks")
    columns = cursor.fetchall()
    for col in columns:
        print(f"  {col[0]} ({col[1]})")
except mysql.connector.Error as e:
    print(f"Error describing 'tasks' table: {e}")

print("\n--- Columns in 'comments' table ---")
try:
    cursor.execute("DESCRIBE comments")
    columns = cursor.fetchall()
    for col in columns:
        print(f"  {col[0]} ({col[1]})")
except mysql.connector.Error as e:
    print(f"Error describing 'comments' table: {e}")

cursor.close()
conn.close()
