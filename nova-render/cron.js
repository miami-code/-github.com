const https = require("https");

const SENDGRID_KEY = process.env.SENDGRID_API_KEY || "";
const JSONBIN_KEY = process.env.JSONBIN_API_KEY || "";
const JSONBIN_BIN = process.env.JSONBIN_BIN_ID || "";

async function fetchData() {
  var response = await fetch("https://api.jsonbin.io/v3/b/" + JSONBIN_BIN + "/latest", {
    headers: { "X-Master-Key": JSONBIN_KEY }
  });
  var json = await response.json();
  return json.record || {};
}

function buildEmailHTML(data) {
  var now = new Date();
  var dateStr = now.toLocaleDateString("en-US", { weekday:"long", month:"long", day:"numeric", year:"numeric" });
  var inventory = data.inventory || { airport: [], west: [] };
  var visits = data.visits || [];
  var allLeads = data.allLeads || [];
  var totalPipeline = data.totalPipeline || 0;

  function buildRows(items) {
    if (!items || items.length === 0) return "<tr><td colspan='2' style='padding:10px;color:#9ca3af;text-align:center;font-style:italic;'>No items recorded</td></tr>";
    return items.map(function(item) {
      var color = item.qty === 0 ? "#dc2626" : item.qty <= 5 ? "#d97706" : "#16a34a";
      var flag = item.qty === 0 ? " - OUT OF STOCK" : item.qty <= 5 ? " - LOW" : "";
      return "<tr><td style='padding:8px 12px;border-bottom:1px solid #e5e7eb;font-size:14px;'>" + item.name + "</td>" +
             "<td style='padding:8px 12px;border-bottom:1px solid #e5e7eb;text-align:center;font-weight:600;color:" + color + ";font-size:14px;'>" + item.qty + flag + "</td></tr>";
    }).join("");
  }

  function buildVisitRows(visitList) {
    var pending = visitList.filter(function(v) { return v.status === "Interested" || v.status === "Follow Up"; });
    if (pending.length === 0) return "<tr><td colspan='3' style='padding:10px;color:#9ca3af;text-align:center;font-style:italic;'>No pending follow-ups</td></tr>";
    return pending.map(function(v) {
      var today = new Date(); today.setHours(0,0,0,0);
      var fuDue = v.followUp && new Date(v.followUp + "T12:00:00") <= today;
      var statusColor = v.status === "Interested" ? "#16a34a" : "#d97706";
      return "<tr>" +
        "<td style='padding:8px 12px;border-bottom:1px solid #e5e7eb;font-size:14px;font-weight:600;'>" + v.bizName + "</td>" +
        "<td style='padding:8px 12px;border-bottom:1px solid #e5e7eb;font-size:13px;color:" + statusColor + ";font-weight:600;'>" + v.status + "</td>" +
        "<td style='padding:8px 12px;border-bottom:1px solid #e5e7eb;font-size:13px;color:" + (fuDue ? "#dc2626" : "#6b7280") + ";'>" + (v.followUp ? v.followUp + (fuDue ? " DUE" : "") : "Not set") + "</td>" +
        "</tr>";
    }).join("");
  }

  var airportTotal = (inventory.airport || []).reduce(function(a,i){ return a+i.qty; }, 0);
  var westTotal = (inventory.west || []).reduce(function(a,i){ return a+i.qty; }, 0);

  var html = "";
  html += "<div style='font-family:Arial,sans-serif;max-width:680px;margin:0 auto;'>";

  // Header
  html += "<div style='background:linear-gradient(135deg,#1e3a5f,#0ea5e9);padding:28px 32px;border-radius:12px 12px 0 0;'>";
  html += "<h1 style='color:#fff;margin:0;font-size:22px;'>Weekly Report - Fastest Labs of Miami</h1>";
  html += "<p style='color:#bfdbfe;margin:6px 0 0;font-size:14px;'>Friday Report - " + dateStr + "</p>";
  html += "</div>";

  // Pipeline stats
  html += "<div style='padding:24px 32px;background:#f8fafc;border-bottom:1px solid #e2e8f0;'>";
  html += "<h2 style='font-size:15px;color:#1e3a5f;margin:0 0 14px;'>NOVA Lead Pipeline</h2>";
  html += "<table style='width:100%;border-collapse:collapse;'><tr>";
  html += "<td style='text-align:center;padding:12px;background:#fff;border-radius:8px;border:1px solid #e2e8f0;'><div style='font-size:24px;font-weight:700;color:#2563eb;'>" + allLeads.length + "</div><div style='font-size:11px;color:#6b7280;margin-top:2px;text-transform:uppercase;'>Leads Generated</div></td>";
  html += "<td style='width:12px;'></td>";
  html += "<td style='text-align:center;padding:12px;background:#fff;border-radius:8px;border:1px solid #e2e8f0;'><div style='font-size:24px;font-weight:700;color:#059669;'>$" + totalPipeline.toLocaleString() + "</div><div style='font-size:11px;color:#6b7280;margin-top:2px;text-transform:uppercase;'>Pipeline / Month</div></td>";
  html += "<td style='width:12px;'></td>";
  html += "<td style='text-align:center;padding:12px;background:#fff;border-radius:8px;border:1px solid #e2e8f0;'><div style='font-size:24px;font-weight:700;color:#7c3aed;'>" + visits.length + "</div><div style='font-size:11px;color:#6b7280;margin-top:2px;text-transform:uppercase;'>Businesses Visited</div></td>";
  html += "</tr></table></div>";

  // Miami Airport inventory
  html += "<div style='padding:24px 32px;border-bottom:1px solid #e2e8f0;'>";
  html += "<h2 style='font-size:15px;color:#1e3a5f;margin:0 0 4px;'>Miami Airport Location</h2>";
  html += "<p style='font-size:12px;color:#6b7280;margin:0 0 14px;'>3399 NW 72nd Ave Suite 210 - 786-536-7315</p>";
  html += "<table style='width:100%;border-collapse:collapse;'>";
  html += "<thead><tr style='background:#f1f5f9;'><th style='padding:8px 12px;text-align:left;border-bottom:2px solid #e2e8f0;font-size:13px;'>Item</th><th style='padding:8px 12px;text-align:center;border-bottom:2px solid #e2e8f0;font-size:13px;'>Quantity</th></tr></thead>";
  html += "<tbody>" + buildRows(inventory.airport) + "</tbody>";
  html += "<tfoot><tr style='background:#f0fdf4;'><td style='padding:8px 12px;font-weight:600;font-size:13px;'>Total Units</td><td style='padding:8px 12px;text-align:center;font-weight:700;color:#059669;font-size:14px;'>" + airportTotal + "</td></tr></tfoot>";
  html += "</table></div>";

  // West Miami inventory
  html += "<div style='padding:24px 32px;border-bottom:1px solid #e2e8f0;'>";
  html += "<h2 style='font-size:15px;color:#1e3a5f;margin:0 0 4px;'>West Miami Location</h2>";
  html += "<p style='font-size:12px;color:#6b7280;margin:0 0 14px;'>10544 NW 26th St Unit E-101, Doral - 305-705-5175</p>";
  html += "<table style='width:100%;border-collapse:collapse;'>";
  html += "<thead><tr style='background:#f1f5f9;'><th style='padding:8px 12px;text-align:left;border-bottom:2px solid #e2e8f0;font-size:13px;'>Item</th><th style='padding:8px 12px;text-align:center;border-bottom:2px solid #e2e8f0;font-size:13px;'>Quantity</th></tr></thead>";
  html += "<tbody>" + buildRows(inventory.west) + "</tbody>";
  html += "<tfoot><tr style='background:#f0fdf4;'><td style='padding:8px 12px;font-weight:600;font-size:13px;'>Total Units</td><td style='padding:8px 12px;text-align:center;font-weight:700;color:#059669;font-size:14px;'>" + westTotal + "</td></tr></tfoot>";
  html += "</table></div>";

  // Visit log follow-ups
  html += "<div style='padding:24px 32px;border-bottom:1px solid #e2e8f0;'>";
  html += "<h2 style='font-size:15px;color:#1e3a5f;margin:0 0 14px;'>Pending Follow-Ups</h2>";
  html += "<table style='width:100%;border-collapse:collapse;'>";
  html += "<thead><tr style='background:#f1f5f9;'><th style='padding:8px 12px;text-align:left;border-bottom:2px solid #e2e8f0;font-size:13px;'>Business</th><th style='padding:8px 12px;text-align:left;border-bottom:2px solid #e2e8f0;font-size:13px;'>Status</th><th style='padding:8px 12px;text-align:left;border-bottom:2px solid #e2e8f0;font-size:13px;'>Follow-Up Date</th></tr></thead>";
  html += "<tbody>" + buildVisitRows(visits) + "</tbody>";
  html += "</table></div>";

  // Footer
  html += "<div style='padding:20px 32px;background:#f8fafc;border-radius:0 0 12px 12px;text-align:center;'>";
  html += "<p style='font-size:12px;color:#9ca3af;margin:0;'>Automated Weekly Report by NOVA - Fastest Labs of Miami - " + now.toLocaleString() + "</p>";
  html += "</div></div>";

  return html;
}

async function sendReport() {
  console.log("Starting weekly report...");

  if (!SENDGRID_KEY) { console.log("ERROR: SENDGRID_API_KEY not set"); process.exit(1); }
  if (!JSONBIN_KEY || !JSONBIN_BIN) { console.log("ERROR: JSONBin keys not set"); process.exit(1); }

  var data = await fetchData();
  var htmlBody = buildEmailHTML(data);
  var now = new Date();
  var subject = "Weekly Report - Fastest Labs of Miami - " + now.toLocaleDateString("en-US", { month:"long", day:"numeric", year:"numeric" });

  var payload = {
    personalizations: [{ to: [{ email: "miami@fastestlabs.com" }, { email: "westmiami@fastestlabs.com" }] }],
    from: { email: process.env.SENDGRID_FROM_EMAIL, name: "NOVA - Fastest Labs Miami" },
    subject: subject,
    content: [{ type: "text/html", value: htmlBody }]
  };

  var response = await fetch("https://api.sendgrid.com/v3/mail/send", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": "Bearer " + SENDGRID_KEY
    },
    body: JSON.stringify(payload)
  });

  if (response.status === 202) {
    console.log("Weekly report sent successfully to miami@fastestlabs.com and westmiami@fastestlabs.com");
  } else {
    var err = await response.text();
    console.log("SendGrid error:", response.status, err);
  }
}

sendReport().catch(function(e) { console.log("Fatal error:", e.message); process.exit(1); });
