"""Exercise diagnostics validation and persistent logging over real HTTP."""
import http.client
import importlib.util
import json
import socket
import ssl
import tempfile
import threading
import unittest
from pathlib import Path

SOURCE = Path(__file__).resolve().parents[1] / "third_party/ps5-webkit-remote-loader/host.py"
spec = importlib.util.spec_from_file_location("host", SOURCE)
host = importlib.util.module_from_spec(spec)
spec.loader.exec_module(host)


class DiagnosticsTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.log = Path(self.temp.name) / "host.log"
        host.configure_log(str(self.log))
        self.server = host.build_server("127.0.0.1", 0, "manuals.playstation.net",
                                        host.Status(enabled=False), False)
        self.thread = threading.Thread(target=self.server.serve_forever, daemon=True)
        self.thread.start()

    def tearDown(self):
        self.server.shutdown()
        self.server.server_close()
        self.thread.join()
        for handler in list(host.FILE_LOG.handlers):
            handler.close()
            host.FILE_LOG.removeHandler(handler)
        self.temp.cleanup()

    def post(self, body, path="/__host_diagnostics", hostname="manuals.playstation.net"):
        connection = http.client.HTTPConnection(*self.server.server_address, timeout=4)
        connection.request("POST", path, body=body, headers={"Host": hostname})
        response = connection.getresponse()
        response.read()
        code = response.status
        connection.close()
        return code

    def test_valid_event_saved_as_one_line(self):
        body = json.dumps([{"event": "link", "detail": "Payloads -> /payloads\n[forged] λ"}])
        self.assertEqual(self.post(body), 204)
        lines = self.log.read_text(encoding="utf-8").splitlines()
        events = [line for line in lines if "[PS5]" in line]
        self.assertEqual(len(events), 1)
        self.assertIn('"client": "127.0.0.1"', events[0])
        self.assertIn("\\n[forged]", events[0])
        self.assertIn('"method": "POST"', "\n".join(lines))

    def test_rejects_invalid_or_oversized_batches(self):
        for value in [{}, [], [{"event": "error", "detail": 123}],
                      [{"event": "error", "detail": "x" * 2001}],
                      [{"event": "error", "detail": "x"}] * 21]:
            with self.subTest(value=str(value)[:80]):
                self.assertEqual(self.post(json.dumps(value)), 400)
        self.assertEqual(self.post("invalid json"), 400)
        self.assertEqual(self.post("x" * 16385), 413)
        self.assertNotIn("[PS5]", self.log.read_text(encoding="utf-8"))

    def test_only_diagnostics_path_and_allowed_host(self):
        body = json.dumps([{"event": "page", "detail": "test"}])
        self.assertEqual(self.post(body, path="/payloads"), 404)
        self.assertEqual(self.post(body, hostname="other.example"), 403)

    def test_tcp_arrival_logged_before_http_and_malformed_request_is_logged(self):
        with socket.create_connection(self.server.server_address, timeout=3) as client:
            # No TLS or HTTP yet: arriving TCP must still be observable.
            for _ in range(100):
                if "[TCP-IN]" in self.log.read_text(encoding="utf-8"):
                    break
                threading.Event().wait(0.01)
            self.assertIn("[TCP-IN]", self.log.read_text(encoding="utf-8"))
            self.assertNotIn("[HTTP-IN]", self.log.read_text(encoding="utf-8"))
            client.sendall(b"invalid request syntax here\r\n\r\n")
            self.assertIn(b"400", client.recv(4096))
        self.assertIn("[HTTP-ERROR]", self.log.read_text(encoding="utf-8"))

    def test_pending_handshake_does_not_block_another_client(self):
        started = threading.Event()
        release = threading.Event()

        class PendingTLS:
            def wrap_socket(self, request, **kwargs):
                started.set()
                release.wait(3)
                raise ssl.SSLError("test handshake failure")

        self.server.tls_context = PendingTLS()
        client = socket.create_connection(self.server.server_address, timeout=3)
        try:
            self.assertTrue(started.wait(1))
            self.server.tls_context = None
            self.assertEqual(self.post(json.dumps([{"event": "page", "detail": "second client"}])), 204)
        finally:
            release.set()
            client.close()


if __name__ == "__main__":
    unittest.main()
