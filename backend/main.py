import os
import sqlite3
import json
import random
import datetime
# pyrefly: ignore [missing-import]
from pydantic import BaseModel
from typing import Optional, List
# pyrefly: ignore [missing-import]
from fastapi import FastAPI, HTTPException, Header, Form
# pyrefly: ignore [missing-import]
from fastapi.middleware.cors import CORSMiddleware
# pyrefly: ignore [missing-import]
from fastapi.staticfiles import StaticFiles
# pyrefly: ignore [missing-import]
from fastapi.responses import FileResponse

from analyzer import analyze_code_with_ai

# Database path
DB_PATH = os.path.join(os.path.dirname(os.path.abspath(__file__)), "database.db")

app = FastAPI(
    title="CodeSentinel API",
    description="Backend API for AI Code Review and Bug Ticket Tracking.",
    version="1.0.0"
)

# Enable CORS for development
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Helper function to get database connection
def get_db_conn():
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    return conn

# Initialize Database Schema
def init_db():
    conn = get_db_conn()
    cursor = conn.cursor()
    
    # Create reviews table
    cursor.execute("""
    CREATE TABLE IF NOT EXISTS reviews (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        timestamp TEXT NOT NULL,
        filename TEXT NOT NULL,
        language TEXT NOT NULL,
        code TEXT NOT NULL,
        overall_score INTEGER NOT NULL,
        summary TEXT,
        bugs_count INTEGER NOT NULL,
        security_issues_count INTEGER NOT NULL,
        performance_issues_count INTEGER NOT NULL,
        readability_issues_count INTEGER NOT NULL,
        raw_json TEXT NOT NULL
    )
    """)
    
    # Create tickets table
    cursor.execute("""
    CREATE TABLE IF NOT EXISTS tickets (
        id TEXT PRIMARY KEY,
        review_id INTEGER,
        issue_id TEXT,
        title TEXT NOT NULL,
        description TEXT NOT NULL,
        severity TEXT NOT NULL,
        status TEXT NOT NULL,
        created_at TEXT NOT NULL,
        assigned_to TEXT,
        notes TEXT, -- JSON string of notes list
        FOREIGN KEY (review_id) REFERENCES reviews (id) ON DELETE SET NULL
    )
    """)
    
    conn.commit()
    conn.close()

# Initialize database on startup
init_db()

# Pydantic schemas for request bodies
class ReviewRequest(BaseModel):
    code: str
    filename: str
    language: str
    custom_api_key: Optional[str] = None

class TicketCreateRequest(BaseModel):
    review_id: Optional[int] = None
    issue_id: Optional[str] = None
    title: str
    description: str
    severity: str
    status: str = "backlog"
    assigned_to: Optional[str] = "Developer"

class TicketUpdateRequest(BaseModel):
    title: Optional[str] = None
    description: Optional[str] = None
    severity: Optional[str] = None
    status: Optional[str] = None
    assigned_to: Optional[str] = None
    notes: Optional[List[str]] = None

@app.post("/api/review")
async def create_review(req: ReviewRequest):
    try:
        # Run code analysis
        analysis_result = analyze_code_with_ai(
            code=req.code,
            filename=req.filename,
            language=req.language,
            api_key=req.custom_api_key
        )
        
        # Save to database
        conn = get_db_conn()
        cursor = conn.cursor()
        
        timestamp = datetime.datetime.now().isoformat()
        metrics = analysis_result.get("metrics", {})
        
        cursor.execute("""
        INSERT INTO reviews (
            timestamp, filename, language, code, overall_score, summary,
            bugs_count, security_issues_count, performance_issues_count, readability_issues_count,
            raw_json
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        """, (
            timestamp,
            req.filename,
            req.language,
            req.code,
            analysis_result.get("overall_score", 70),
            analysis_result.get("summary", ""),
            metrics.get("bugs_count", 0),
            metrics.get("security_issues_count", 0),
            metrics.get("performance_issues_count", 0),
            metrics.get("readability_issues_count", 0),
            json.dumps(analysis_result)
        ))
        
        review_id = cursor.lastrowid
        conn.commit()
        conn.close()
        
        # Return review data with generated ID
        analysis_result["review_id"] = review_id
        analysis_result["code"] = req.code
        analysis_result["filename"] = req.filename
        analysis_result["language"] = req.language
        analysis_result["timestamp"] = timestamp
        
        return analysis_result
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to process review: {str(e)}")

@app.get("/api/reviews")
async def get_reviews():
    conn = get_db_conn()
    cursor = conn.cursor()
    cursor.execute("""
    SELECT id, timestamp, filename, language, overall_score, summary,
           bugs_count, security_issues_count, performance_issues_count, readability_issues_count
    FROM reviews ORDER BY id DESC
    """)
    rows = cursor.fetchall()
    conn.close()
    
    reviews = []
    for r in rows:
        reviews.append({
            "id": r["id"],
            "timestamp": r["timestamp"],
            "filename": r["filename"],
            "language": r["language"],
            "overall_score": r["overall_score"],
            "summary": r["summary"],
            "metrics": {
                "bugs_count": r["bugs_count"],
                "security_issues_count": r["security_issues_count"],
                "performance_issues_count": r["performance_issues_count"],
                "readability_issues_count": r["readability_issues_count"]
            }
        })
    return reviews

@app.get("/api/reviews/{review_id}")
async def get_review(review_id: int):
    conn = get_db_conn()
    cursor = conn.cursor()
    cursor.execute("SELECT * FROM reviews WHERE id = ?", (review_id,))
    row = cursor.fetchone()
    conn.close()
    
    if not row:
        raise HTTPException(status_code=404, detail="Review not found")
        
    result = json.loads(row["raw_json"])
    result["review_id"] = row["id"]
    result["code"] = row["code"]
    result["filename"] = row["filename"]
    result["language"] = row["language"]
    result["timestamp"] = row["timestamp"]
    
    return result

@app.delete("/api/reviews/{review_id}")
async def delete_review(review_id: int):
    conn = get_db_conn()
    cursor = conn.cursor()
    cursor.execute("DELETE FROM reviews WHERE id = ?", (review_id,))
    conn.commit()
    conn.close()
    return {"message": "Review deleted successfully"}

@app.get("/api/tickets")
async def get_tickets():
    conn = get_db_conn()
    cursor = conn.cursor()
    cursor.execute("SELECT * FROM tickets ORDER BY created_at DESC")
    rows = cursor.fetchall()
    conn.close()
    
    tickets = []
    for r in rows:
        tickets.append({
            "id": r["id"],
            "review_id": r["review_id"],
            "issue_id": r["issue_id"],
            "title": r["title"],
            "description": r["description"],
            "severity": r["severity"],
            "status": r["status"],
            "created_at": r["created_at"],
            "assigned_to": r["assigned_to"],
            "notes": json.loads(r["notes"]) if r["notes"] else []
        })
    return tickets

@app.post("/api/tickets")
async def create_ticket(req: TicketCreateRequest):
    conn = get_db_conn()
    cursor = conn.cursor()
    
    # Generate incremental ticket ID
    cursor.execute("SELECT id FROM tickets")
    existing_ids = [row["id"] for row in cursor.fetchall()]
    
    max_num = 100
    for tid in existing_ids:
        try:
            num = int(tid.split("-")[1])
            if num > max_num:
                max_num = num
        except:
            pass
            
    ticket_id = f"TIC-{max_num + 1}"
    created_at = datetime.datetime.now().isoformat()
    default_notes = json.dumps(["Ticket created automatically from AI review issue."])
    
    cursor.execute("""
    INSERT INTO tickets (id, review_id, issue_id, title, description, severity, status, created_at, assigned_to, notes)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    """, (
        ticket_id,
        req.review_id,
        req.issue_id,
        req.title,
        req.description,
        req.severity,
        req.status,
        created_at,
        req.assigned_to,
        default_notes
    ))
    
    conn.commit()
    conn.close()
    
    return {
        "id": ticket_id,
        "review_id": req.review_id,
        "issue_id": req.issue_id,
        "title": req.title,
        "description": req.description,
        "severity": req.severity,
        "status": req.status,
        "created_at": created_at,
        "assigned_to": req.assigned_to,
        "notes": ["Ticket created automatically from AI review issue."]
    }

@app.put("/api/tickets/{ticket_id}")
async def update_ticket(ticket_id: str, req: TicketUpdateRequest):
    conn = get_db_conn()
    cursor = conn.cursor()
    
    # Check if ticket exists
    cursor.execute("SELECT * FROM tickets WHERE id = ?", (ticket_id,))
    ticket = cursor.fetchone()
    if not ticket:
        conn.close()
        raise HTTPException(status_code=404, detail="Ticket not found")
        
    update_fields = []
    params = []
    
    if req.title is not None:
        update_fields.append("title = ?")
        params.append(req.title)
    if req.description is not None:
        update_fields.append("description = ?")
        params.append(req.description)
    if req.severity is not None:
        update_fields.append("severity = ?")
        params.append(req.severity)
    if req.status is not None:
        update_fields.append("status = ?")
        params.append(req.status)
    if req.assigned_to is not None:
        update_fields.append("assigned_to = ?")
        params.append(req.assigned_to)
    if req.notes is not None:
        update_fields.append("notes = ?")
        params.append(json.dumps(req.notes))
        
    if not update_fields:
        conn.close()
        return {"message": "No changes made"}
        
    params.append(ticket_id)
    query = f"UPDATE tickets SET {', '.join(update_fields)} WHERE id = ?"
    
    cursor.execute(query, tuple(params))
    conn.commit()
    
    # Retrieve updated ticket
    cursor.execute("SELECT * FROM tickets WHERE id = ?", (ticket_id,))
    updated_row = cursor.fetchone()
    conn.close()
    
    return {
        "id": updated_row["id"],
        "review_id": updated_row["review_id"],
        "issue_id": updated_row["issue_id"],
        "title": updated_row["title"],
        "description": updated_row["description"],
        "severity": updated_row["severity"],
        "status": updated_row["status"],
        "created_at": updated_row["created_at"],
        "assigned_to": updated_row["assigned_to"],
        "notes": json.loads(updated_row["notes"]) if updated_row["notes"] else []
    }

@app.delete("/api/tickets/{ticket_id}")
async def delete_ticket(ticket_id: str):
    conn = get_db_conn()
    cursor = conn.cursor()
    cursor.execute("DELETE FROM tickets WHERE id = ?", (ticket_id,))
    conn.commit()
    conn.close()
    return {"message": f"Ticket {ticket_id} deleted successfully"}

@app.get("/api/metrics")
async def get_metrics():
    conn = get_db_conn()
    cursor = conn.cursor()
    
    # Total reviews
    cursor.execute("SELECT COUNT(*) as count FROM reviews")
    total_reviews = cursor.fetchone()["count"]
    
    # Average score
    cursor.execute("SELECT AVG(overall_score) as avg_score FROM reviews")
    avg_score_raw = cursor.fetchone()["avg_score"]
    avg_score = round(avg_score_raw) if avg_score_raw is not None else 0
    
    # Ticket status counts
    cursor.execute("SELECT status, COUNT(*) as count FROM tickets GROUP BY status")
    status_counts = {"backlog": 0, "todo": 0, "in_progress": 0, "done": 0}
    for r in cursor.fetchall():
        status_counts[r["status"]] = r["count"]
        
    # Ticket severity counts
    cursor.execute("SELECT severity, COUNT(*) as count FROM tickets GROUP BY severity")
    severity_counts = {"critical": 0, "warning": 0, "suggestion": 0}
    for r in cursor.fetchall():
        severity_counts[r["severity"]] = r["count"]
        
    # Historical reviews for progression chart
    cursor.execute("SELECT id, timestamp, overall_score, filename FROM reviews ORDER BY id ASC")
    progression = []
    for r in cursor.fetchall():
        progression.append({
            "id": r["id"],
            "timestamp": r["timestamp"],
            "score": r["overall_score"],
            "filename": r["filename"]
        })
        
    # Aggregated issue counts from the reviews table directly
    cursor.execute("SELECT SUM(bugs_count) as bugs, SUM(security_issues_count) as security, SUM(performance_issues_count) as perf, SUM(readability_issues_count) as readability FROM reviews")
    row = cursor.fetchone()
    issue_totals = {
        "bugs": row["bugs"] or 0,
        "security": row["security"] or 0,
        "performance": row["perf"] or 0,
        "readability": row["readability"] or 0
    }
    
    conn.close()
    
    return {
        "total_reviews": total_reviews,
        "average_score": avg_score,
        "tickets_by_status": status_counts,
        "tickets_by_severity": severity_counts,
        "score_progression": progression,
        "issue_totals": issue_totals
    }

# Mount static files for UI serving
frontend_dir = os.path.abspath(os.path.join(os.path.dirname(__file__), "../frontend"))

@app.get("/")
async def serve_index():
    index_path = os.path.join(frontend_dir, "index.html")
    if os.path.exists(index_path):
        return FileResponse(index_path)
    return {"message": "Welcome to CodeSentinel API. Frontend assets are missing."}

# Mount frontend directory for static assets
if os.path.exists(frontend_dir):
    app.mount("/", StaticFiles(directory=frontend_dir), name="static")

if __name__ == "__main__":
    import uvicorn
    uvicorn.run("main:app", host="0.0.0.0", port=8000, reload=True)
