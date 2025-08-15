// functions/api/book.js
// Cloudflare Pages Function -> Turnstile verification -> MailChannels Email API

const DESTINATION = "joeyfernandez81@gmail.com";
const FROM_NAME   = "Barlovento Website";
const FROM_EMAIL  = "no-reply@barloventodelpacificotours.com";

function esc(s = "") {
  return String(s)
    .replace(/&/g, "&amp;").replace(/</g, "&lt;")
    .replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

// Pretty date like "Aug 16, 2025"
function fmtDate(iso) {
  if (!iso) return "?";
  const d = new Date(iso + "T00:00:00Z");
  if (isNaN(d)) return iso;
  return d.toLocaleDateString("en-US", { year:"numeric", month:"short", day:"2-digit" });
}

function html(data, niceStart, niceEnd) {
  return `
<div style="font-family:Arial,Helvetica,sans-serif;font-size:16px;line-height:1.5">
  <h2>New Booking Request</h2>
  <p><strong>Name:</strong> ${esc(data.first_name)} ${esc(data.last_name)}</p>
  <p><strong>Email:</strong> ${esc(data.email)}</p>
  <p><strong>Phone:</strong> ${esc(data.phone || "—")}</p>
  <p><strong>Requested dates:</strong> ${esc(niceStart)} → ${esc(niceEnd)}</p>
  <p><strong>Message:</strong><br>${esc(data.message || "(none)")}</p>
  <hr><p style="color:#777">Sent from barloventodelpacificotours.com</p>
</div>`;
}

function json(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" }
  });
}

export async function onRequestGet() {
  return json({ ok: true, hint: "POST JSON to this endpoint." });
}

export async function onRequestOptions() {
  return new Response(null, {
    headers: {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "POST, OPTIONS, GET",
      "Access-Control-Allow-Headers": "Content-Type"
    }
  });
}

export async function onRequestPost({ request, env }) {
  try {
    const ip = request.headers.get("CF-Connecting-IP") || "";
    const data = await request.json();

    // Basic required fields
    for (const f of ["first_name", "last_name", "email"]) {
      if (!data[f] || String(data[f]).trim() === "") {
        return json({ error: `Missing field: ${f}` }, 400);
      }
    }

    // Honeypot
    if (data.company && String(data.company).trim() !== "") {
      return json({ ok: true }); // silently ignore bots
    }

    // Min fill time (3s)
    const started = Number(data.started_ms || 0);
    if (!Number.isNaN(started)) {
      const elapsed = Date.now() - started;
      if (elapsed < 3000) {
        return json({ ok: true }); // too fast, likely bot
      }
    }

    // Turnstile verification
    const token = data.turnstile_token || "";
    if (!token) return json({ error: "turnstile_missing" }, 400);

    const tsResp = await fetch("https://challenges.cloudflare.com/turnstile/v0/siteverify", {
      method: "POST",
      body: new URLSearchParams({
        secret: env.TURNSTILE_SECRET || "",
        response: token,
        remoteip: ip
      })
    });
    const tsData = await tsResp.json();
    if (!tsData.success) {
      return json({ error: "turnstile_failed", detail: tsData["error-codes"] || [] }, 400);
    }

    // Pretty dates
    const niceStart = fmtDate(data.start_date);
    const niceEnd   = fmtDate(data.end_date);

    const subject = `Booking Request — ${data.first_name} ${data.last_name}`;
    const text = `New Booking Request

Name: ${data.first_name} ${data.last_name}
Email: ${data.email}
Phone: ${data.phone || "(not provided)"}
Requested dates: ${niceStart} -> ${niceEnd}

Message:
${data.message || "(none)"}\n`;

    // MailChannels payload
    const payload = {
      personalizations: [{ to: [{ email: DESTINATION }] }],
      from: { email: FROM_EMAIL, name: FROM_NAME },
      subject,
      reply_to: { email: data.email, name: `${data.first_name} ${data.last_name}` },
      content: [
        { type: "text/plain; charset=utf-8", value: text },
        { type: "text/html;  charset=utf-8", value: html(data, niceStart, niceEnd) }
      ]
    };

    const apiKey = env.MC_API_KEY;
    if (!apiKey) return json({ error: "missing_api_key" }, 500);

    const resp = await fetch("https://api.mailchannels.net/tx/v1/send", {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-Api-Key": apiKey },
      body: JSON.stringify(payload)
    });

    const bodyText = await resp.text();
    if (!resp.ok) {
      return json({ error: "mailchannels_failed", status: resp.status, detail: bodyText }, 502);
    }
    return json({ ok: true });
  } catch (err) {
    return json({ error: "server_error", detail: String(err) }, 500);
  }
}
