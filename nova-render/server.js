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
  // Image generation via Hugging Face free inference API (FLUX)
  if (req.method === "GET" && req.url.startsWith("/image?")) {
    var urlParams = req.url.split("?")[1];
    var params = new URLSearchParams(urlParams);
    var prompt = params.get("prompt") || "professional medical testing facility";
    var HF_TOKEN = process.env.HF_TOKEN || "";

    var headers = { "Content-Type": "application/json" };
    if (HF_TOKEN) headers["Authorization"] = "Bearer " + HF_TOKEN;

    var models = [
      "black-forest-labs/FLUX.1-schnell",
      "stabilityai/stable-diffusion-xl-base-1.0",
      "runwayml/stable-diffusion-v1-5"
    ];

    var lastError = null;
    for (var m = 0; m < models.length; m++) {
      try {
        console.log("Trying HuggingFace model:", models[m]);
        var hfUrl = "https://api-inference.huggingface.co/models/" + models[m];
        var hfRes = await fetch(hfUrl, {
          method: "POST",
          headers: headers,
          body: JSON.stringify({ inputs: prompt }),
          signal: AbortSignal.timeout(60000)
        });
        console.log("HF response:", hfRes.status, hfRes.headers.get("content-type"));
        if (!hfRes.ok) {
          var errText = await hfRes.text();
          lastError = "Model " + models[m] + " returned " + hfRes.status + ": " + errText.slice(0,100);
          console.log(lastError);
          continue;
        }
        var ct = hfRes.headers.get("content-type") || "";
        if (!ct.startsWith("image/")) {
          lastError = "Not an image from " + models[m] + ": " + ct;
          continue;
        }
        var buf = await hfRes.arrayBuffer();
        res.writeHead(200, {
          "Content-Type": ct,
          "Access-Control-Allow-Origin": "*",
          "Cache-Control": "no-cache"
        });
        res.end(Buffer.from(buf));
        return;
      } catch(e) {
        lastError = e.message;
        console.log("HF model failed:", e.message);
      }
    }

    res.writeHead(500, { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" });
    res.end(JSON.stringify({ error: lastError || "All image models failed" }));
    return;
  }

    // Apollo.io people search proxy
  if (req.method === "POST" && req.url === "/apollo") {
    var APOLLO_KEY = process.env.APOLLO_API_KEY || "";
    if (!APOLLO_KEY) {
      res.writeHead(500, { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" });
      res.end(JSON.stringify({ error: "APOLLO_API_KEY not set in Render environment variables" }));
      return;
    }
    try {
      var body = await readBody(req);
      var searchParams = JSON.parse(body);

      // Apollo People Search API
      var apolloRes = await fetch("https://api.apollo.io/v1/mixed_people/search", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Cache-Control": "no-cache",
          "X-Api-Key": APOLLO_KEY
        },
        body: JSON.stringify({
          api_key: APOLLO_KEY,
          q_organization_domains: searchParams.domains || [],
          person_titles: searchParams.titles || [],
          person_locations: searchParams.locations || ["Miami, Florida", "Fort Lauderdale, Florida", "Broward County, Florida", "Miami-Dade County, Florida"],
          organization_industry_tag_ids: searchParams.industries || [],
          page: searchParams.page || 1,
          per_page: searchParams.per_page || 10
        })
      });

      var apolloData = await apolloRes.json();
      console.log("Apollo response status:", apolloRes.status, "people:", apolloData.people ? apolloData.people.length : 0);
      res.writeHead(apolloRes.status, { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" });
      res.end(JSON.stringify(apolloData));
    } catch(e) {
      console.log("Apollo error:", e.message);
      res.writeHead(500, { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" });
      res.end(JSON.stringify({ error: e.message }));
    }
    return;
  }

  // Unsplash photo proxy - keeps API key secure on server
  if (req.method === "GET" && req.url.startsWith("/unsplash?")) {
    var urlParams2 = req.url.split("?")[1];
    var uParams = new URLSearchParams(urlParams2);
    var uQuery = uParams.get("query") || "medical laboratory";
    var UNSPLASH_KEY = process.env.UNSPLASH_ACCESS_KEY || "";
    if (!UNSPLASH_KEY) {
      res.writeHead(500, { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" });
      res.end(JSON.stringify({ error: "UNSPLASH_ACCESS_KEY not set in Render environment variables" }));
      return;
    }
    try {
      var uUrl = "https://api.unsplash.com/photos/random?query=" + encodeURIComponent(uQuery) + "&orientation=squarish&content_filter=high&client_id=" + UNSPLASH_KEY;
      var uRes = await fetch(uUrl);
      var uData = await uRes.json();
      res.writeHead(uRes.status, { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" });
      res.end(JSON.stringify(uData));
    } catch(e) {
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
