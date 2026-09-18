use rusqlite::{params, Connection, Row};
use serde::{Deserialize, Serialize};
use std::{path::Path, time::Duration};
use tauri::Manager;

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RepairInput {
    ticket: String,
    brand: String,
    model: String,
    fault: String,
    diagnosis: String,
    work_performed: String,
    parts: String,
    status: String,
    notes: String,
    robot_deep_cleaned: bool,
    dock_deep_cleaned: bool,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Repair {
    id: i64,
    ticket: String,
    brand: String,
    model: String,
    fault: String,
    diagnosis: String,
    work_performed: String,
    parts: String,
    status: String,
    notes: String,
    robot_deep_cleaned: bool,
    dock_deep_cleaned: bool,
    created_at: String,
    updated_at: String,
    elapsed_seconds: i64,
    timer_started_at: Option<i64>,
}

// Short-lived connections keep ownership simple; SQLite serializes writes.
fn open_database(path: &Path) -> Result<Connection, String> {
    let mut db = Connection::open(path).map_err(|e| e.to_string())?;
    db.busy_timeout(Duration::from_secs(5))
        .map_err(|e| e.to_string())?;
    let tx = db.transaction().map_err(|e| e.to_string())?;
    let version: i64 = tx
        .pragma_query_value(None, "user_version", |r| r.get(0))
        .map_err(|e| e.to_string())?;
    if version > 3 {
        return Err("This database requires a newer BenchiLogs version.".into());
    }
    if version == 0 {
        tx.execute_batch("CREATE TABLE repairs (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            ticket TEXT NOT NULL CHECK(length(trim(ticket)) > 0),
            brand TEXT NOT NULL, model TEXT NOT NULL, fault TEXT NOT NULL,
            diagnosis TEXT NOT NULL, work_performed TEXT NOT NULL, parts TEXT NOT NULL,
            status TEXT NOT NULL CHECK(status IN ('Working On','Testing','Completed','On Hold','Failed / Escalated')),
            notes TEXT NOT NULL,
            created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
            updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
        ); PRAGMA user_version = 1;").map_err(|e| e.to_string())?;
    }
    if version < 2 {
        tx.execute_batch("ALTER TABLE repairs ADD COLUMN elapsed_seconds INTEGER NOT NULL DEFAULT 0 CHECK(elapsed_seconds >= 0);
            ALTER TABLE repairs ADD COLUMN timer_started_at INTEGER;
            PRAGMA user_version = 2;").map_err(|e| e.to_string())?;
    }
    if version < 3 {
        tx.execute_batch("ALTER TABLE repairs ADD COLUMN robot_deep_cleaned INTEGER NOT NULL DEFAULT 0 CHECK(robot_deep_cleaned IN (0,1));
            ALTER TABLE repairs ADD COLUMN dock_deep_cleaned INTEGER NOT NULL DEFAULT 0 CHECK(dock_deep_cleaned IN (0,1));
            PRAGMA user_version = 3;").map_err(|e| e.to_string())?;
    }
    tx.commit().map_err(|e| e.to_string())?;
    Ok(db)
}

fn database(app: &tauri::AppHandle) -> Result<Connection, String> {
    let dir = app.path().app_local_data_dir().map_err(|e| e.to_string())?;
    std::fs::create_dir_all(&dir).map_err(|e| format!("Cannot create local data folder: {e}"))?;
    open_database(&dir.join("benchilogs.sqlite3"))
}

fn from_row(row: &Row<'_>) -> rusqlite::Result<Repair> {
    Ok(Repair {
        id: row.get("id")?,
        ticket: row.get("ticket")?,
        brand: row.get("brand")?,
        model: row.get("model")?,
        fault: row.get("fault")?,
        diagnosis: row.get("diagnosis")?,
        work_performed: row.get("work_performed")?,
        parts: row.get("parts")?,
        status: row.get("status")?,
        notes: row.get("notes")?,
        robot_deep_cleaned: row.get("robot_deep_cleaned")?,
        dock_deep_cleaned: row.get("dock_deep_cleaned")?,
        created_at: row.get("created_at")?,
        updated_at: row.get("updated_at")?,
        elapsed_seconds: row.get("elapsed_seconds")?,
        timer_started_at: row.get("timer_started_at")?,
    })
}

fn list(db: &Connection) -> Result<Vec<Repair>, String> {
    let mut stmt = db
        .prepare("SELECT * FROM repairs ORDER BY updated_at DESC, id DESC")
        .map_err(|e| e.to_string())?;
    let rows = stmt.query_map([], from_row).map_err(|e| e.to_string())?;
    rows.collect::<rusqlite::Result<Vec<_>>>()
        .map_err(|e| e.to_string())
}

fn save(db: &Connection, id: Option<i64>, input: RepairInput) -> Result<Repair, String> {
    if input.ticket.trim().is_empty() {
        return Err("Ticket / Job ID is required.".into());
    }
    if ![
        "Working On",
        "Testing",
        "Completed",
        "On Hold",
        "Failed / Escalated",
    ]
    .contains(&input.status.as_str())
    {
        return Err("Choose a valid repair status.".into());
    }
    let brand = if input.brand.trim().is_empty() {
        "Other"
    } else {
        input.brand.trim()
    };
    let values = params![
        input.ticket.trim(),
        brand,
        input.model.trim(),
        input.fault.trim(),
        input.diagnosis.trim(),
        input.work_performed.trim(),
        input.parts.trim(),
        input.status,
        input.notes.trim(),
        id,
        input.robot_deep_cleaned,
        input.dock_deep_cleaned
    ];
    let sql = if id.is_some() {
        "UPDATE repairs SET ticket=?1,brand=?2,model=?3,fault=?4,diagnosis=?5,work_performed=?6,parts=?7,status=?8,notes=?9,robot_deep_cleaned=?11,dock_deep_cleaned=?12,
        elapsed_seconds=elapsed_seconds + CASE WHEN ?8 != 'Working On' AND timer_started_at IS NOT NULL
            THEN MAX(0, CAST(strftime('%s','now') AS INTEGER)-timer_started_at) ELSE 0 END,
        timer_started_at=CASE WHEN ?8 != 'Working On' THEN NULL ELSE timer_started_at END,
        updated_at=strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id=?10 RETURNING *"
    } else {
        "INSERT INTO repairs (ticket,brand,model,fault,diagnosis,work_performed,parts,status,notes,id,robot_deep_cleaned,dock_deep_cleaned)
        VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?9,?10,?11,?12) RETURNING *"
    };
    db.query_row(sql, values, from_row).map_err(|e| match e {
        rusqlite::Error::QueryReturnedNoRows => {
            "This repair no longer exists. Reload the list.".into()
        }
        _ => e.to_string(),
    })
}

fn delete(db: &Connection, id: i64) -> Result<(), String> {
    let count = db
        .execute("DELETE FROM repairs WHERE id=?1", [id])
        .map_err(|e| e.to_string())?;
    if count == 0 {
        return Err("This repair no longer exists. Reload the list.".into());
    }
    Ok(())
}

#[tauri::command]
pub fn set_repair_timer(app: tauri::AppHandle, id: i64, running: bool) -> Result<Repair, String> {
    let db = database(&app)?;
    // Each transition is atomic. Repeated start/pause requests cannot double-count time.
    let sql = if running {
        "UPDATE repairs SET status='Working On',
        timer_started_at=COALESCE(timer_started_at, CAST(strftime('%s','now') AS INTEGER)),
        updated_at=strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id=?1 RETURNING *"
    } else {
        "UPDATE repairs SET elapsed_seconds=elapsed_seconds + CASE WHEN timer_started_at IS NOT NULL
            THEN MAX(0, CAST(strftime('%s','now') AS INTEGER)-timer_started_at) ELSE 0 END,
        timer_started_at=NULL, updated_at=strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id=?1 RETURNING *"
    };
    db.query_row(sql, [id], from_row).map_err(|e| match e {
        rusqlite::Error::QueryReturnedNoRows => {
            "This repair no longer exists. Reload the list.".into()
        }
        _ => e.to_string(),
    })
}

#[tauri::command]
pub fn list_repairs(app: tauri::AppHandle) -> Result<Vec<Repair>, String> {
    list(&database(&app)?)
}

#[tauri::command]
pub fn list_on_hold_repairs(app: tauri::AppHandle) -> Result<Vec<Repair>, String> {
    let db = database(&app)?;
    let mut stmt = db
        .prepare("SELECT * FROM repairs WHERE status='On Hold' ORDER BY ticket ASC")
        .map_err(|e| e.to_string())?;
    let rows = stmt.query_map([], from_row).map_err(|e| e.to_string())?;
    rows.collect::<rusqlite::Result<Vec<_>>>()
        .map_err(|e| e.to_string())
}
#[tauri::command]
pub fn create_repair(app: tauri::AppHandle, input: RepairInput) -> Result<Repair, String> {
    save(&database(&app)?, None, input)
}
#[tauri::command]
pub fn update_repair(app: tauri::AppHandle, id: i64, input: RepairInput) -> Result<Repair, String> {
    save(&database(&app)?, Some(id), input)
}
#[tauri::command]
pub fn delete_repair(app: tauri::AppHandle, id: i64) -> Result<(), String> {
    delete(&database(&app)?, id)
}

#[cfg(test)]
mod tests {
    use super::*;
    fn input() -> RepairInput {
        RepairInput {
            ticket: " 45821 ".into(),
            brand: "Roborock".into(),
            model: "Q7 Max".into(),
            fault: "Wheel error".into(),
            diagnosis: "Motor's failed".into(),
            work_performed: "Replaced motor".into(),
            parts: "Wheel assembly".into(),
            status: "Testing".into(),
            notes: "Retest 日本語".into(),
            robot_deep_cleaned: false,
            dock_deep_cleaned: false,
        }
    }
    #[test]
    fn persists_full_crud_across_reopen() {
        let path = std::env::temp_dir().join(format!(
            "benchilogs-test-{}-{}.sqlite3",
            std::process::id(),
            std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .unwrap()
                .as_nanos()
        ));
        let db = open_database(&path).unwrap();
        assert!(list(&db).unwrap().is_empty());
        let created = save(&db, None, input()).unwrap();
        assert_eq!(created.ticket, "45821");
        assert!(created.created_at.ends_with('Z'));
        drop(db);
        let db = open_database(&path).unwrap();
        let saved = list(&db).unwrap().remove(0);
        assert_eq!(saved.diagnosis, "Motor's failed");
        assert_eq!(saved.notes, "Retest 日本語");
        assert_eq!(saved.parts, "Wheel assembly");
        assert_eq!(saved.work_performed, "Replaced motor");
        db.execute(
            "UPDATE repairs SET updated_at='2000-01-01T00:00:00.000Z'",
            [],
        )
        .unwrap();
        let mut change = input();
        change.status = "Completed".into();
        let updated = save(&db, Some(created.id), change).unwrap();
        assert_eq!(updated.created_at, created.created_at);
        assert_eq!(updated.status, "Completed");
        assert!(updated.updated_at.as_str() > "2000-01-01T00:00:00.000Z");
        delete(&db, created.id).unwrap();
        assert!(delete(&db, created.id).is_err());
        assert!(save(&db, Some(created.id), input()).is_err());
        drop(db);
        let db = open_database(&path).unwrap();
        assert!(list(&db).unwrap().is_empty());
        drop(db);
        std::fs::remove_file(path).unwrap();
    }
    #[test]
    fn rejects_invalid_input() {
        let db = open_database(Path::new(":memory:")).unwrap();
        let mut invalid = input();
        invalid.ticket = "  \n".into();
        assert!(save(&db, None, invalid).is_err());
        let mut invalid = input();
        invalid.status = "Unknown".into();
        assert!(save(&db, None, invalid).is_err());
        assert!(list(&db).unwrap().is_empty());
    }
}
