const http = require("http");
const fs = require("fs");
const path = require("path");

const PORT = process.env.PORT || 3000;
const API_KEY = process.env.ANTHROPIC_API_KEY || "";
const JSONBIN_KEY = process.env.JSONBIN_API_KEY || "";
const JSONBIN_BIN = process.env.JSONBIN_BIN_ID || "";

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

  // Serve PULSE
  if (req.method === "GET" && (req.url === "/social" || req.url === "/social.html")) {
    var socialPath = path.join(__dirname, "social-agent.html");
    fs.access(socialPath, fs.constants.F_OK, function(ae) {
      if (ae) socialPath = path.join(process.cwd(), "nova-render", "social-agent.html");
      fs.readFile(socialPath, function(err, data) {
        if (err) { res.writeHead(404); res.end("PULSE not found"); return; }
        res.writeHead(200, { "Content-Type": "text/html" });
        res.end(data);
      });
    });
    return;
  }

  // Serve NOVA
  if (req.method === "GET" && (req.url === "/" || req.url === "/index.html")) {
    var htmlPath = path.join(__dirname, "index.html");
    fs.access(htmlPath, fs.constants.F_OK, function(ae) {
      if (ae) htmlPath = path.join(process.cwd(), "nova-render", "index.html");
      fs.readFile(htmlPath, function(err, data) {
        if (err) { res.writeHead(404); res.end("Not found - " + htmlPath); return; }
        res.writeHead(200, { "Content-Type": "text/html" });
        res.end(data);
      });
    });
    return;
  }

  // Load saved data
  if (req.method === "GET" && req.url === "/data") {
    try {
      if (JSONBIN_KEY && JSONBIN_BIN) {
        var r = await fetch("https://api.jsonbin.io/v3/b/" + JSONBIN_BIN + "/latest", {
          headers: { "X-Master-Key": JSONBIN_KEY }
        });
        var j = await r.json();
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify(j.record || {}));
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

  // Save data
  if (req.method === "POST" && req.url === "/data") {
    try {
      var body = await readBody(req);
      var data = JSON.parse(body);
      if (JSONBIN_KEY && JSONBIN_BIN) {
        await fetch("https://api.jsonbin.io/v3/b/" + JSONBIN_BIN, {
          method: "PUT",
          headers: { "Content-Type": "application/json", "X-Master-Key": JSONBIN_KEY },
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

  // Anthropic API proxy - handles both regular calls AND Gmail MCP calls
  // Apollo test endpoint - shows raw response
  if (req.method === "GET" && req.url === "/apollo-test") {
    var APOLLO_KEY = process.env.APOLLO_API_KEY || "";
    if (!APOLLO_KEY) {
      res.writeHead(200, { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" });
      res.end(JSON.stringify({ error: "No API key set" }));
      return;
    }
    try {
      // Try simplest possible search first
      var testRes = await fetch("https://api.apollo.io/api/v1/mixed_people/api_search", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Cache-Control": "no-cache",
          "X-Api-Key": APOLLO_KEY
        },
        body: JSON.stringify({
          person_locations: ["Miami, Florida, United States"],
          per_page: 3,
          page: 1
        })
      });
      var testData = await testRes.json();
      console.log("Apollo test status:", testRes.status);
      console.log("Apollo test data:", JSON.stringify(testData).slice(0, 500));
      res.writeHead(200, { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" });
      res.end(JSON.stringify({
        status: testRes.status,
        people_count: testData.people ? testData.people.length : 0,
        total: testData.pagination ? testData.pagination.total_entries : null,
        error: testData.error || null,
        message: testData.message || null,
        first_person: testData.people && testData.people[0] ? {
          name: testData.people[0].first_name + " " + testData.people[0].last_name,
          title: testData.people[0].title,
          company: testData.people[0].organization ? testData.people[0].organization.name : null,
          email: testData.people[0].email,
          email_status: testData.people[0].email_status
        } : null
      }));
    } catch(e) {
      res.writeHead(200, { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" });
      res.end(JSON.stringify({ error: e.message }));
    }
    return;
  }

  // Apollo.io people search
  if (req.method === "POST" && req.url === "/apollo") {
    var APOLLO_KEY = process.env.APOLLO_API_KEY || "";
    if (!APOLLO_KEY) {
      res.writeHead(500, { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" });
      res.end(JSON.stringify({ error: "APOLLO_API_KEY not set in Render environment" }));
      return;
    }
    try {
      var body = await readBody(req);
      var params = JSON.parse(body);
      console.log("Apollo search:", JSON.stringify(params));

      var apolloRes = await fetch("https://api.apollo.io/api/v1/mixed_people/api_search", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Cache-Control": "no-cache",
          "X-Api-Key": APOLLO_KEY
        },
        body: JSON.stringify({
          person_titles: params.titles || [],
          person_locations: params.locations || ["Miami, Florida, United States", "Fort Lauderdale, Florida, United States"],
          q_keywords: params.keywords || "",
          page: params.page || 1,
          per_page: params.per_page || 10
        })
      });

      var apolloData = await apolloRes.json();
      console.log("Apollo status:", apolloRes.status, "people:", apolloData.people ? apolloData.people.length : 0);
      res.writeHead(apolloRes.status, { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" });
      res.end(JSON.stringify(apolloData));
    } catch(e) {
      console.log("Apollo error:", e.message);
      res.writeHead(500, { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" });
      res.end(JSON.stringify({ error: e.message }));
    }
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

      // Build request body - keep mcp_servers if present (needed for Gmail drafts)
      var requestBody = {
        model: parsed.model || "claude-sonnet-4-5",
        max_tokens: parsed.max_tokens || 4000,
        messages: parsed.messages
      };

      if (parsed.system) requestBody.system = parsed.system;

      // Include MCP servers if provided (for Gmail draft functionality)
      if (parsed.mcp_servers && parsed.mcp_servers.length > 0) {
        requestBody.mcp_servers = parsed.mcp_servers;
      }

      var response = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-api-key": API_KEY,
          "anthropic-version": "2023-06-01",
          "anthropic-beta": "mcp-client-2025-04-04"
        },
        body: JSON.stringify(requestBody)
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
    console.log("Cloud storage: using memory");
  }
});
