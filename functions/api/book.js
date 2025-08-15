// functions/api/book.js
// Cloudflare Pages Function -> MailChannels Email API (authenticated)
//
// Prereqs:
// 1) Cloudflare DNS TXT: _mailchannels  =>  v=mc1 auth=selfol7z7zht
// 2) SPF includes MailChannels
// 3) Pages Secret: MC_API_KEY = <your MailChannels API key>

const DESTINATION = "joeyfernandez81@gmail.com";
const FROM_NAME   = "Barlovento Website";
const FROM_EMAIL  = "no-reply@barloventodelpacificotours.com"; // must be your domain

function esc(s = "") {
  return String(s)
    .replace(/&/g, "&amp;").replace(/</g, "&lt;")
    .replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

function html(data) {
  return `
<div style="font-family:Arial,Helvetica,sans-serif;font-size:16px;line-height:1.5">
  <h2>New Booking Request</h2>
  <p><strong>Name:</strong> ${esc(data.first_name)} ${esc(data.last_name)}</p>
  <p><strong>Email:</strong> ${esc(data.email)}</p>
  <p><strong>Phone:</strong> ${esc(data.phone || "—")}</p>
  <p><strong>Requested dates:</strong> ${esc(data.start_date || "?")} → ${esc(data.end_date || "?")}</p>
  <p><strong>Message:</strong><br>${esc(data.message || "(none)")}</p>
  <hr><p style="color:#777">Sent from barloventodelpacificotours.com</p>
</div>`;
}

function json(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "Content-Type": "application/json",
      "Access-Control-Allow-Origin": "*"
    }
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
    const data = await request.json();

    for (const f of ["first_name", "last_name", "email"]) {
      if (!data[f] || String(data[f]).trim() === "") {
        return json({ error: `Missing field: ${f}` }, 400);
      }
    }

    const subject = `Booking Request — ${data.first_name} ${data.last_name}`;
    const text = `New Booking Request

Name: ${data.first_name} ${data.last_name}
Email: ${data.email}
Phone: ${data.phone || "(not provided)"}
Requested dates: ${data.start_date || "?"} -> ${data.end_date || "?"}

Message:
${data.message || "(none)"}\n`;

    // MailChannels Email API payload
    const payload = {
      personalizations: [{ to: [{ email: DESTINATION }] }],
      from: { email: FROM_EMAIL, name: FROM_NAME },
      subject,
      reply_to: { email: data.email, name: `${data.first_name} ${data.last_name}` }, // <-- use reply_to field
      content: [
        { type: "text/plain; charset=utf-8", value: text },
        { type: "text/html;  charset=utf-8", value: html(data) }
      ]
    };

    const apiKey = env.MC_API_KEY;
    if (!apiKey) {
      return json({ error: "missing_api_key", detail: "Add MC_API_KEY secret in Pages settings." }, 500);
    }

    const resp = await fetch("https://api.mailchannels.net/tx/v1/send", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Api-Key": apiKey
      },
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
