// functions/api/book.js
// Sends an email using MailChannels from a Cloudflare Pages Function.
// No third-party accounts required. Make sure your domain's SPF allows MailChannels (see notes below).

const DESTINATION = "joeyfernandez81@gmail.com";        // where requests are sent
const FROM_NAME   = "Barlovento Website";
const FROM_EMAIL  = "no-reply@barloventodelpacificotours.com"; // must be your domain

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

export async function onRequestOptions() {
  // CORS preflight
  return new Response(null, {
    headers: {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "POST, OPTIONS",
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
${data.message || "(none)"}  
`;

    // Send via MailChannels
    const payload = {
      personalizations: [{
        to: [{ email: DESTINATION }],
      }],
      from: { email: FROM_EMAIL, name: FROM_NAME },
      subject,
      content: [
        { type: "text/plain", value: text },
        { type: "text/html",  value: html }
      ]
    };

    const mc = await fetch("https://api.mailchannels.net/tx/v1/send", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(payload)
    });

    if (!mc.ok) {
      const detail = await mc.text();
      return json({ error: "Email send failed", detail }, 502);
    }

    return json({ ok: true }, 200);
  } catch (err) {
    return json({ error: "Server error", detail: String(err) }, 500);
  }
}

function json(obj, status = 200) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: {
      "Content-Type": "application/json",
      "Access-Control-Allow-Origin": "*"
    }
  });
}
