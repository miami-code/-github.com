const http = require("http");
const fs = require("fs");
const path = require("path");

const PORT = process.env.PORT || 3000;
const API_KEY = process.env.ANTHROPIC_API_KEY || "";

const server = http.createServer(async function(req, res) {

  // CORS headers for all responses
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");

  if (req.method === "OPTIONS") {
    res.writeHead(200);
    res.end();
    return;
  }

  // API proxy endpoint
  if (req.method === "POST" && req.url === "/api") {
    var body = "";
    req.on("data", function(chunk) { body += chunk; });
    req.on("end", async function() {
      try {
        if (!API_KEY) {
          res.writeHead(500, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ error: { message: "ANTHROPIC_API_KEY not set on server." } }));
          return;
        }

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

        var data = await response.json();
        res.writeHead(response.status, { "Content-Type": "application/json" });
        res.end(JSON.stringify(data));

      } catch(err) {
        res.writeHead(500, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ error: { message: err.message } }));
      }
    });
    return;
  }

  // Serve index.html for all other requests
  var filePath = path.join(__dirname, "index.html");
  fs.readFile(filePath, function(err, data) {
    if (err) {
      res.writeHead(404);
      res.end("Not found");
      return;
    }
    res.writeHead(200, { "Content-Type": "text/html" });
    res.end(data);
  });

});

server.listen(PORT, function() {
  console.log("NOVA server running on port " + PORT);
});
