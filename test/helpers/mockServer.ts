import http from "http";

export function startMockCiviServer(port = 5555) {
  let lastRequestBody: any = null;

  const server = http.createServer((req, res) => {
    if (req.method === "POST") {
      let data = "";
      req.on("data", chunk => (data += chunk));
      req.on("end", () => {
        try {
          const raw = decodeURIComponent(data.replace("params=", ""));
          lastRequestBody = JSON.parse(raw) || {};
        } catch {
          lastRequestBody = data;
        }

        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ values: [{ id: 999, ...lastRequestBody }], is_error: 0 }));
      });
    }
  });

  return new Promise(resolve =>
    server.listen(port, () => resolve({ server, lastRequest: () => lastRequestBody }))
  );
}