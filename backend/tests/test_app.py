import tempfile
import unittest
from pathlib import Path

from backend.app import create_app
from backend.detector import analyze_content


class DetectorTests(unittest.TestCase):
    def test_legitimate_message_has_no_matched_indicators(self):
        result = analyze_content("Your appointment is confirmed for Tuesday at 10:00.")

        self.assertEqual(result["risk_score"], 0)
        self.assertEqual(result["risk_category"], "low")
        self.assertEqual(result["matched_indicators"], [])
        self.assertIn("does not guarantee", result["explanation"])

    def test_suspicious_message_reports_matching_rules_and_advice(self):
        result = analyze_content(
            "URGENT! Verify your account now and share your OTP to claim your prize."
        )

        self.assertEqual(result["risk_category"], "high")
        self.assertGreaterEqual(result["risk_score"], 50)
        self.assertTrue(result["matched_indicators"])
        self.assertTrue(all(item["explanation"] and item["safety_advice"] for item in result["matched_indicators"]))
        self.assertTrue(result["safety_advice"])

    def test_single_low_weight_warning_is_not_misclassified_as_safe(self):
        result = analyze_content("Act now to review this ordinary reminder.")

        self.assertEqual(result["risk_category"], "low")
        self.assertTrue(result["matched_indicators"])

    def test_suspicious_url_is_flagged_without_opening_it(self):
        result = analyze_content("Check this link: http://bit.ly/claim-now")

        ids = {item["id"] for item in result["matched_indicators"]}
        self.assertIn("http-link-0", ids)
        self.assertIn("short-link-0", ids)
        self.assertEqual(result["risk_category"], "suspicious")

    def test_detector_does_not_flag_ordinary_text_containing_email_address(self):
        result = analyze_content("Contact help@example.com about tomorrow's meeting.")

        self.assertEqual(result["matched_indicators"], [])


class ApiTests(unittest.TestCase):
    def setUp(self):
        self.temp_dir = tempfile.TemporaryDirectory()
        temp_path = Path(self.temp_dir.name)
        database_path = temp_path / "test.sqlite3"
        frontend_dist = temp_path / "frontend"
        frontend_dist.mkdir()
        (frontend_dist / "index.html").write_text("<!doctype html><title>JuaScam</title>", encoding="utf-8")
        (frontend_dist / "asset.svg").write_text("<svg></svg>", encoding="utf-8")
        self.app = create_app(
            {
                "TESTING": True,
                "DATABASE": str(database_path),
                "FRONTEND_DIST": str(frontend_dist),
            }
        )
        self.client = self.app.test_client()

    def tearDown(self):
        self.temp_dir.cleanup()

    def test_health_endpoint(self):
        response = self.client.get("/api/health")

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.get_json()["status"], "ok")

    def test_frontend_and_client_side_routes_are_served(self):
        root_response = self.client.get("/")
        app_route_response = self.client.get("/about")
        asset_response = self.client.get("/asset.svg")

        self.assertEqual(root_response.status_code, 200)
        self.assertIn("JuaScam", root_response.get_data(as_text=True))
        self.assertEqual(app_route_response.status_code, 200)
        self.assertIn("JuaScam", app_route_response.get_data(as_text=True))
        self.assertEqual(asset_response.status_code, 200)
        self.assertEqual(asset_response.get_data(as_text=True), "<svg></svg>")
        root_response.close()
        app_route_response.close()
        asset_response.close()

    def test_unknown_api_route_does_not_serve_frontend(self):
        response = self.client.get("/api/missing")

        self.assertEqual(response.status_code, 404)
        self.assertNotIn("JuaScam", response.get_data(as_text=True))

    def test_stats_and_history_work_with_an_empty_database(self):
        stats_response = self.client.get("/api/stats")
        history_response = self.client.get("/api/history")

        self.assertEqual(stats_response.status_code, 200)
        self.assertEqual(
            stats_response.get_json(),
            {
                "total_scans": 0,
                "by_risk_category": {"low": 0, "suspicious": 0, "high": 0},
            },
        )
        self.assertEqual(history_response.status_code, 200)
        self.assertEqual(history_response.get_json(), {"days": 30, "history": []})

    def test_analyze_records_aggregate_counts_without_message_text(self):
        response = self.client.post(
            "/api/analyze",
            json={"content": "URGENT! Verify your account and share your OTP."},
        )

        self.assertEqual(response.status_code, 200)
        result = response.get_json()
        self.assertIn("risk_score", result)
        self.assertIn("risk_category", result)
        self.assertIn("matched_indicators", result)
        self.assertIn("explanation", result)
        self.assertIn("safety_advice", result)

        stats = self.client.get("/api/stats").get_json()
        self.assertEqual(stats["total_scans"], 1)
        self.assertEqual(stats["by_risk_category"]["high"], 1)

    def test_saved_scan_counts_persist_after_app_restart(self):
        self.client.post("/api/analyze", json={"content": "Ordinary appointment reminder."})
        restarted_app = create_app(
            {
                "TESTING": True,
                "DATABASE": self.app.config["DATABASE"],
            }
        )

        response = restarted_app.test_client().get("/api/stats")

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.get_json()["total_scans"], 1)
        self.assertEqual(response.get_json()["by_risk_category"]["low"], 1)

    def test_malformed_and_invalid_requests_return_client_errors(self):
        malformed = self.client.post(
            "/api/analyze",
            data="{not json",
            content_type="application/json",
        )
        missing_content = self.client.post("/api/analyze", json={})
        empty_content = self.client.post("/api/analyze", json={"content": "   "})
        wrong_content_type = self.client.post("/api/analyze", data="content=hello")

        self.assertEqual(malformed.status_code, 400)
        self.assertEqual(missing_content.status_code, 400)
        self.assertEqual(empty_content.status_code, 400)
        self.assertEqual(wrong_content_type.status_code, 415)

    def test_content_length_is_limited(self):
        response = self.client.post("/api/analyze", json={"content": "x" * 5001})

        self.assertEqual(response.status_code, 413)

    def test_history_returns_daily_aggregates_not_message_content(self):
        self.client.post("/api/analyze", json={"content": "Routine appointment reminder."})
        self.client.post("/api/analyze", json={"content": "URGENT, claim your prize now!"})

        response = self.client.get("/api/history?days=7")
        result = response.get_json()

        self.assertEqual(response.status_code, 200)
        self.assertEqual(result["days"], 7)
        self.assertEqual(result["history"][0]["total_scans"], 2)
        self.assertEqual(result["history"][0]["by_risk_category"]["low"], 1)
        self.assertEqual(result["history"][0]["by_risk_category"]["suspicious"], 1)
        self.assertNotIn("content", result["history"][0])

    def test_history_rejects_invalid_days(self):
        self.assertEqual(self.client.get("/api/history?days=abc").status_code, 400)
        self.assertEqual(self.client.get("/api/history?days=0").status_code, 400)

    def test_cors_allows_local_vite_origin(self):
        response = self.client.get(
            "/api/health",
            headers={"Origin": "http://localhost:5173"},
        )

        self.assertEqual(
            response.headers.get("Access-Control-Allow-Origin"),
            "http://localhost:5173",
        )


if __name__ == "__main__":
    unittest.main()
