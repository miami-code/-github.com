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
  if (req.method === "GET" && (req.url === "/social" || req.url === "/social.html")) {
    var socialPath = path.join(__dirname, "social-agent.html");
    fs.access(socialPath, fs.constants.F_OK, function(accessErr) {
      if (accessErr) socialPath = path.join(process.cwd(), "nova-render", "social-agent.html");
      fs.readFile(socialPath, function(err, data) {
        if (err) { res.writeHead(404); res.end("PULSE not found - upload social-agent.html to nova-render folder"); return; }
        res.writeHead(200, { "Content-Type": "text/html" });
        res.end(data);
      });
    });
    return;
  }

  if (req.method === "GET" && (req.url === "/" || req.url === "/index.html")) {
    var htmlPath = path.join(__dirname, "index.html");
    fs.access(htmlPath, fs.constants.F_OK, function(accessErr) {
      if (accessErr) {
        htmlPath = path.join(process.cwd(), "nova-render", "index.html");
      }
      fs.readFile(htmlPath, function(err, data) {
        if (err) {
          res.writeHead(404);
          res.end("Not found - looked in: " + htmlPath);
          return;
        }
        res.writeHead(200, { "Content-Type": "text/html" });
        res.end(data);
      });
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
  // Image generation proxy via Pollinations AI
  if (req.method === "GET" && req.url.startsWith("/image?")) {
    var urlParams = req.url.split("?")[1];
    var params = new URLSearchParams(urlParams);
    var prompt = params.get("prompt") || "professional medical testing facility";
    var seed = params.get("seed") || String(Math.floor(Math.random() * 99999));

    // Try multiple Pollinations endpoints
    var endpoints = [
      "https://image.pollinations.ai/prompt/" + encodeURIComponent(prompt) + "?width=1080&height=1080&seed=" + seed + "&model=flux&nologo=true",
      "https://image.pollinations.ai/prompt/" + encodeURIComponent(prompt) + "?width=800&height=800&seed=" + seed + "&nologo=true"
    ];

    var lastError = null;
    for (var ep = 0; ep < endpoints.length; ep++) {
      try {
        console.log("Trying image endpoint:", endpoints[ep].slice(0,80));
        var imgResponse = await fetch(endpoints[ep], {
          headers: { "User-Agent": "NOVA-Fastest-Labs/1.0" },
          signal: AbortSignal.timeout(30000)
        });
        console.log("Image response status:", imgResponse.status, imgResponse.headers.get("content-type"));
        if (!imgResponse.ok) { lastError = "Status " + imgResponse.status; continue; }
        var contentType = imgResponse.headers.get("content-type") || "image/jpeg";
        if (!contentType.startsWith("image/")) { lastError = "Not an image: " + contentType; continue; }
        var imgBuffer = await imgResponse.arrayBuffer();
        res.writeHead(200, {
          "Content-Type": contentType,
          "Access-Control-Allow-Origin": "*",
          "Cache-Control": "no-cache"
        });
        res.end(Buffer.from(imgBuffer));
        return;
      } catch(e) {
        lastError = e.message;
        console.log("Image endpoint failed:", e.message);
      }
    }
    res.writeHead(500, { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" });
    res.end(JSON.stringify({ error: "Image generation failed: " + lastError }));
    return;
  }

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
      parsed.max_tokens = 4000;

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
