// functions/api/book.js
// Cloudflare Pages Function using MailChannels
// Shows detailed error info to help debug.

const DESTINATION = "joeyfernandez81@gmail.com";
const FROM_NAME   = "Barlovento Website";
const FROM_EMAIL  = "no-reply@barloventodelpacificotours.com"; // keep on your domain

function htmlEscape(s = "") {
  return String(s)
    .replace(/&/g, "&amp;").replace(/</g, "&lt;")
    .replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

function renderHtml(data) {
  return `
  <div style="font-family:Arial,Helvetica,sans-serif;font-size:16px;line-height:1.5">
    <h2>New Booking Request</h2>
    <p><strong>Name:</strong> ${htmlEscape(data.first_name)} ${htmlEscape(data.last_name)}</p>
    <p><strong>Email:</strong> ${htmlEscape(data.email)}</p>
    <p><strong>Phone:</strong> ${htmlEscape(data.phone || "—")}</p>
    <p><strong>Requested dates:</strong> ${htmlEscape(data.start_date || "?")} → ${htmlEscape(data.end_date || "?")}</p>
    <p><strong>Message:</strong><br>${htmlEscape(data.message || "(none)")}</p>
    <hr>
    <p style="color:#777">Sent from barloventodelpacificotours.com</p>
  </div>`;
}

function json(obj, status = 200, extraHeaders = {}) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: {
      "Content-Type": "application/json",
      "Access-Control-Allow-Origin": "*",
      ...extraHeaders
    }
  });
}

// Quick GET check so you can visit /api/book in a browser and see that it’s deployed.
export async function onRequestGet() {
  return json({ ok: true, hint: "POST a JSON body to this endpoint." });
}

// CORS preflight
export async function onRequestOptions() {
  return new Response(null, {
    headers: {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "POST, OPTIONS, GET",
      "Access-Control-Allow-Headers": "Content-Type"
    }
  });
}

export async function onRequestPost({ request }) {
  try {
    const data = await request.json();

    // Basic validation
    const required = ["first_name", "last_name", "email"];
    for (const f of required) {
      if (!data[f] || String(data[f]).trim() === "") {
        return json({ error: `Missing field: ${f}` }, 400);
      }
    }

    const subject = `Booking Request — ${data.first_name} ${data.last_name}`;
    const html = renderHtml(data);
    const text =
`New Booking Request

Name: ${data.first_name} ${data.last_name}
Email: ${data.email}
Phone: ${data.phone || "(not provided)"}
Requested dates: ${data.start_date || "?"} -> ${data.end_date || "?"}

Message:
${data.message || "(none)")}
`;

    // MailChannels payload
    const payload = {
      personalizations: [{ to: [{ email: DESTINATION }] }],
      from: { email: FROM_EMAIL, name: FROM_NAME },
      reply_to: [{ email: data.email, name: `${data.first_name} ${data.last_name}` }],
      subject,
      content: [
        { type: "text/plain", value: text },
        { type: "text/html",  value: html }
      ]
    };

    const resp = await fetch("https://api.mailchannels.net/tx/v1/send", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(payload)
    });

    const bodyText = await resp.text();

    if (!resp.ok) {
      // Surface MailChannels error details to the client so we know what to fix
      return json({ error: "mailchannels_failed", status: resp.status, detail: bodyText }, 502);
    }

    return json({ ok: true });
  } catch (err) {
    return json({ error: "server_error", detail: String(err) }, 500);
  }
}
