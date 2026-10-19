import os
import sqlite3
from contextlib import contextmanager
from datetime import datetime, timedelta, timezone
from pathlib import Path

from flask import Flask, jsonify, request
from flask_cors import CORS
from werkzeug.exceptions import BadRequest, RequestEntityTooLarge, UnsupportedMediaType

if __package__:
    from .detector import analyze_content
else:
    from detector import analyze_content


MAX_CONTENT_LENGTH = 5_000
DEFAULT_DATABASE = Path(__file__).resolve().parent / "instance" / "juascam.sqlite3"
RISK_CATEGORIES = ("low", "suspicious", "high")


def _connect(database_path):
    path = Path(database_path)
    path.parent.mkdir(parents=True, exist_ok=True)
    connection = sqlite3.connect(path)
    connection.row_factory = sqlite3.Row
    return connection


@contextmanager
def _connection(database_path):
    connection = _connect(database_path)
    try:
        with connection:
            yield connection
    finally:
        connection.close()


def _initialize_database(database_path):
    with _connection(database_path) as connection:
        connection.execute(
            """
            CREATE TABLE IF NOT EXISTS daily_scan_stats (
                scan_date TEXT NOT NULL,
                risk_category TEXT NOT NULL
                    CHECK (risk_category IN ('low', 'suspicious', 'high')),
                scan_count INTEGER NOT NULL DEFAULT 0 CHECK (scan_count > 0),
                PRIMARY KEY (scan_date, risk_category)
            )
            """
        )


def _record_scan(database_path, risk_category):
    scan_date = datetime.now(timezone.utc).date().isoformat()
    with _connection(database_path) as connection:
        connection.execute(
            """
            INSERT INTO daily_scan_stats (scan_date, risk_category, scan_count)
            VALUES (?, ?, 1)
            ON CONFLICT (scan_date, risk_category)
            DO UPDATE SET scan_count = scan_count + 1
            """,
            (scan_date, risk_category),
        )


def create_app(test_config=None):
    app = Flask(__name__)
    app.config.from_mapping(
        DATABASE=os.environ.get("JUASCAM_DATABASE_PATH", str(DEFAULT_DATABASE)),
        MAX_CONTENT_LENGTH=64_000,
    )
    if test_config:
        app.config.update(test_config)

    cors_origins = os.environ.get(
        "JUASCAM_CORS_ORIGINS",
        "http://localhost:5173,http://127.0.0.1:5173",
    )
    CORS(app, resources={r"/api/*": {"origins": [origin.strip() for origin in cors_origins.split(",") if origin.strip()]}})
    _initialize_database(app.config["DATABASE"])

    @app.errorhandler(BadRequest)
    def handle_bad_request(_error):
        return jsonify(error="Request body must contain valid JSON."), 400

    @app.errorhandler(UnsupportedMediaType)
    def handle_unsupported_media_type(_error):
        return jsonify(error="Content-Type must be application/json."), 415

    @app.errorhandler(RequestEntityTooLarge)
    def handle_request_too_large(_error):
        return jsonify(error="Request body is too large."), 413

    @app.get("/api/health")
    def health():
        return jsonify(status="ok", service="JuaScam API")

    @app.post("/api/analyze")
    def analyze():
        if not request.is_json:
            return jsonify(error="Content-Type must be application/json."), 415

        payload = request.get_json()
        if not isinstance(payload, dict):
            return jsonify(error="Request body must be a JSON object."), 400

        content = payload.get("content")
        if not isinstance(content, str):
            return jsonify(error="'content' must be a string."), 400

        content = content.strip()
        if not content:
            return jsonify(error="'content' cannot be empty."), 400
        if len(content) > MAX_CONTENT_LENGTH:
            return jsonify(error=f"'content' must be at most {MAX_CONTENT_LENGTH} characters."), 413

        result = analyze_content(content)
        try:
            _record_scan(app.config["DATABASE"], result["risk_category"])
        except sqlite3.Error:
            app.logger.exception("Unable to update anonymized daily scan statistics")
            return jsonify(error="The scan could not be saved to the statistics database. Please try again."), 503

        return jsonify(result)

    @app.get("/api/stats")
    def stats():
        with _connection(app.config["DATABASE"]) as connection:
            rows = connection.execute(
                "SELECT risk_category, SUM(scan_count) AS scan_count FROM daily_scan_stats GROUP BY risk_category"
            ).fetchall()

        by_category = {category: 0 for category in RISK_CATEGORIES}
        for row in rows:
            by_category[row["risk_category"]] = row["scan_count"]
        return jsonify(total_scans=sum(by_category.values()), by_risk_category=by_category)

    @app.get("/api/history")
    def history():
        raw_days = request.args.get("days", "30")
        try:
            days = int(raw_days)
        except ValueError:
            return jsonify(error="'days' must be an integer from 1 to 90."), 400
        if not 1 <= days <= 90:
            return jsonify(error="'days' must be an integer from 1 to 90."), 400

        today = datetime.now(timezone.utc).date()
        first_day = (today - timedelta(days=days - 1)).isoformat()
        with _connection(app.config["DATABASE"]) as connection:
            rows = connection.execute(
                """
                SELECT scan_date,
                    SUM(scan_count) AS total_scans,
                    SUM(CASE WHEN risk_category = 'low' THEN scan_count ELSE 0 END) AS low,
                    SUM(CASE WHEN risk_category = 'suspicious' THEN scan_count ELSE 0 END) AS suspicious,
                    SUM(CASE WHEN risk_category = 'high' THEN scan_count ELSE 0 END) AS high
                FROM daily_scan_stats
                WHERE scan_date >= ? AND scan_date <= ?
                GROUP BY scan_date
                ORDER BY scan_date DESC
                """,
                (first_day, today.isoformat()),
            ).fetchall()

        return jsonify(
            days=days,
            history=[
                {
                    "date": row["scan_date"],
                    "total_scans": row["total_scans"],
                    "by_risk_category": {
                        "low": row["low"],
                        "suspicious": row["suspicious"],
                        "high": row["high"],
                    },
                }
                for row in rows
            ],
        )

    return app


app = create_app()


if __name__ == "__main__":
    app.run(host="127.0.0.1", port=5000, debug=False)
