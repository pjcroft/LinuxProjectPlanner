import hashlib
import json
import sys
import threading
import unittest
from pathlib import Path
from urllib.request import Request, urlopen
from urllib.error import HTTPError

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
import server


class ServiceTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.http = server.create_server()
        cls.url = f"http://127.0.0.1:{cls.http.server_port}"
        threading.Thread(target=cls.http.serve_forever, daemon=True).start()
        cls.created = []

    @classmethod
    def tearDownClass(cls):
        cls.http.shutdown()
        cls.http.server_close()
        for file in cls.created:
            file.unlink(missing_ok=True)

    def request(self, path, data, token=server.TOKEN, origin=None):
        headers = {"Content-Type": "application/json", "X-Fieldplan-Token": token}
        if origin:
            headers["Origin"] = origin
        return json.load(urlopen(Request(self.url + path, json.dumps(data).encode(), headers)))

    def test_save_open_and_conflict(self):
        p = {
            "format": "linux-desktop-planner",
            "version": 1,
            "name": "Service test",
            "start": "2026-10-01",
            "tasks": [],
        }
        result = self.request("/api/save", {"project": p})
        self.created.append(server.PROJECTS / result["filename"])
        opened = self.request("/api/open", {"filename": result["filename"]})
        self.assertEqual(opened["project"], p)
        with self.assertRaises(HTTPError) as error:
            self.request(
                "/api/save", {"project": p, "filename": result["filename"], "revision": "stale"}
            )
        self.assertEqual(error.exception.code, 400)
        p["name"] = "Updated"
        result2 = self.request(
            "/api/save",
            {"project": p, "filename": result["filename"], "revision": result["revision"]},
        )
        self.assertNotEqual(result["revision"], result2["revision"])

    def test_traversal_rejected(self):
        with self.assertRaises(HTTPError):
            self.request("/api/open", {"filename": "../test.fieldplan"})

    def test_foreign_origin_and_invalid_token_rejected(self):
        for kwargs in [{"token": "wrong"}, {"origin": "https://example.com"}]:
            with self.assertRaises(HTTPError) as error:
                self.request("/api/open", {"filename": "test.fieldplan"}, **kwargs)
            self.assertEqual(error.exception.code, 403)

    def test_invalid_file_rejected(self):
        with self.assertRaises(HTTPError):
            self.request("/api/save", {"project": {"name": "bad"}})

    def test_export_names_are_sanitized_and_never_overwrite(self):
        self.assertEqual(
            server.export_filename("Customer plan", "fallback.pdf"), "Customer plan.pdf"
        )
        self.assertEqual(
            server.export_filename("Customer plan.pdf", "fallback.pdf"), "Customer plan.pdf"
        )
        with self.assertRaises(ValueError):
            server.export_filename("../outside", "fallback.pdf")
        first = server.EXPORTS / "service-name-test.pdf"
        second = server.EXPORTS / "service-name-test-2.pdf"
        try:
            first.write_bytes(b"existing")
            self.assertEqual(server.available_export_file(first.name), second)
        finally:
            first.unlink(missing_ok=True)


if __name__ == "__main__":
    unittest.main()
