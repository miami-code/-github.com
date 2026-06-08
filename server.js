const http = require("http");
const fs = require("fs");
const path = require("path");

const PORT = process.env.PORT || 3000;
const API_KEY = process.env.ANTHROPIC_API_KEY || "";
const JSONBIN_KEY = process.env.JSONBIN_API_KEY || "";
const JSONBIN_BIN = process.env.JSONBIN_BIN_ID || "";

// In-memory fallback if JSONBin not configured
var memoryData = {};

async function readBody(req) {
  return new Promise(function(resolve) {
    var body = "";
    req.on("data", function(chunk) { body += chunk; });
    req.on("end", function() { resolve(body); });
  });
}

const server = http.createServer(async function(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");

  if (req.method === "OPTIONS") {
    res.writeHead(200); res.end(); return;
  }

  // ── Serve index.html ──
  if (req.method === "GET" && (req.url === "/" || req.url === "/index.html")) {
    fs.readFile(path.join(__dirname, "index.html"), function(err, data) {
      if (err) { res.writeHead(404); res.end("Not found"); return; }
      res.writeHead(200, { "Content-Type": "text/html" });
      res.end(data);
    });
    return;
  }

  // ── Load saved data ──
  if (req.method === "GET" && req.url === "/data") {
    try {
      if (JSONBIN_KEY && JSONBIN_BIN) {
        var response = await fetch("https://api.jsonbin.io/v3/b/" + JSONBIN_BIN + "/latest", {
          headers: { "X-Master-Key": JSONBIN_KEY }
        });
        var json = await response.json();
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify(json.record || {}));
      } else {
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify(memoryData));
      }
    } catch(e) {
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({}));
    }
    return;
  }

  // ── Save data ──
  if (req.method === "POST" && req.url === "/data") {
    try {
      var body = await readBody(req);
      var data = JSON.parse(body);
      if (JSONBIN_KEY && JSONBIN_BIN) {
        await fetch("https://api.jsonbin.io/v3/b/" + JSONBIN_BIN, {
          method: "PUT",
          headers: {
            "Content-Type": "application/json",
            "X-Master-Key": JSONBIN_KEY
          },
          body: JSON.stringify(data)
        });
      } else {
        memoryData = data;
      }
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ ok: true }));
    } catch(e) {
      res.writeHead(500, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: e.message }));
    }
    return;
  }

  // ── Anthropic API proxy ──
  if (req.method === "POST" && req.url === "/api") {
    try {
      if (!API_KEY) {
        res.writeHead(500, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ error: { message: "ANTHROPIC_API_KEY not set." } }));
        return;
      }
      var body = await readBody(req);
      var parsed = JSON.parse(body);
      delete parsed.mcp_servers;
      parsed.max_tokens = 3000;

      var response = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-api-key": API_KEY,
          "anthropic-version": "2023-06-01"
        },
        body: JSON.stringify(parsed)
      });

      var result = await response.json();
      res.writeHead(response.status, { "Content-Type": "application/json" });
      res.end(JSON.stringify(result));
    } catch(e) {
      res.writeHead(500, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: { message: e.message } }));
    }
    return;
  }

  res.writeHead(404); res.end("Not found");
});

server.listen(PORT, function() {
  console.log("NOVA server running on port " + PORT);
  if (JSONBIN_KEY && JSONBIN_BIN) {
    console.log("Cloud storage: JSONBin enabled");
  } else {
    console.log("Cloud storage: using memory (set JSONBIN_API_KEY and JSONBIN_BIN_ID for persistence)");
  }
});
