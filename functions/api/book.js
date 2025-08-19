// functions/api/book.js
// Cloudflare Pages Function -> Turnstile verification -> MailChannels Email API

// === Delivery lists ===
const TO_EMAIL = "barloventodelpacifico@gmail.com";
const BCC_EMAILS = [
  "joeyfernandez81@gmail.com",
  "Coastaldreamsinvestmentgr@gmail.com"
];

// === From identity (your domain) ===
const FROM_NAME  = "Barlovento Website";
const FROM_EMAIL = "no-reply@barloventodelpacificotours.com";

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

// Internal HTML
function internalHtml(data, niceStart, niceEnd) {
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

// Guest acknowledgement HTML
function guestHtml(data, niceStart, niceEnd) {
  return `
<div style="font-family:Arial,Helvetica,sans-serif;font-size:16px;line-height:1.6;color:#0b2942">
  <h2 style="margin:0 0 8px 0;">We received your booking request</h2>
  <p>Hi ${esc(data.first_name)},</p>
  <p>Thanks for reaching out to <strong>Barlovento del Pacífico Tours</strong>!
     We’ve received your request and our team will review availability and
     follow up shortly to confirm details or ask any questions.</p>

  <p style="margin:18px 0 6px;"><strong>Request summary</strong></p>
  <ul style="margin:0 0 16px 20px;padding:0">
    <li><strong>Name:</strong> ${esc(data.first_name)} ${esc(data.last_name)}</li>
    <li><strong>Email:</strong> ${esc(data.email)}</li>
    <li><strong>Phone:</strong> ${esc(data.phone || "—")}</li>
    <li><strong>Requested dates:</strong> ${esc(niceStart)} → ${esc(niceEnd)}</li>
  </ul>

  ${data.message ? `<p><strong>Your message:</strong><br>${esc(data.message)}</p>` : ""}

  <p style="margin-top:18px">If you need to update anything, just reply to this email.</p>
  <p style="color:#5b6b7a;margin-top:24px">— Barlovento del Pacífico Tours</p>
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
    if (!Number.isNaN(started) && Date.now() - started < 3000) {
      return json({ ok: true });
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

    // ===== 1) INTERNAL NOTIFICATION =====
    const internalSubject = `Booking Request — ${data.first_name} ${data.last_name}`;
    const internalText = `New Booking Request

Name: ${data.first_name} ${data.last_name}
Email: ${data.email}
Phone: ${data.phone || "(not provided)"}
Requested dates: ${niceStart} -> ${niceEnd}

Message:
${data.message || "(none)"}\n`;

    const internalPayload = {
      personalizations: [{
        to:  [{ email: TO_EMAIL }],
        bcc: BCC_EMAILS.map(email => ({ email }))
      }],
      from: { email: FROM_EMAIL, name: FROM_NAME },
      subject: internalSubject,
      reply_to: { email: data.email, name: `${data.first_name} ${data.last_name}` },
      content: [
        { type: "text/plain; charset=utf-8", value: internalText },
        { type: "text/html;  charset=utf-8", value: internalHtml(data, niceStart, niceEnd) }
      ]
    };

    const apiKey = env.MC_API_KEY;
    if (!apiKey) return json({ error: "missing_api_key" }, 500);

    const sendInternal = await fetch("https://api.mailchannels.net/tx/v1/send", {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-Api-Key": apiKey },
      body: JSON.stringify(internalPayload)
    });

    const internalBody = await sendInternal.text();
    if (!sendInternal.ok) {
      return json({ error: "mailchannels_failed_internal", status: sendInternal.status, detail: internalBody }, 502);
    }

    // ===== 2) GUEST ACKNOWLEDGEMENT (not a confirmation) =====
    const guestSubject = "We received your booking request";
    const guestText = `Hi ${data.first_name},

Thanks for contacting Barlovento del Pacífico Tours!
We’ve received your booking request and will review availability.
We’ll get back to you soon to confirm details or ask any questions.

Request summary
- Name: ${data.first_name} ${data.last_name}
- Email: ${data.email}
- Phone: ${data.phone || "(not provided)"}
- Requested dates: ${niceStart} -> ${niceEnd}

If you need to update anything, just reply to this email.

— Barlovento del Pacífico Tours
`;

    const guestPayload = {
      personalizations: [{ to: [{ email: data.email, name: `${data.first_name} ${data.last_name}` }] }],
      from: { email: FROM_EMAIL, name: "Barlovento Reservations" },
      // People can reply directly; this goes to your main inbox:
      reply_to: { email: TO_EMAIL, name: "Barlovento Reservations" },
      subject: guestSubject,
      content: [
        { type: "text/plain; charset=utf-8", value: guestText },
        { type: "text/html;  charset=utf-8", value: guestHtml(data, niceStart, niceEnd) }
      ]
    };

    const sendGuest = await fetch("https://api.mailchannels.net/tx/v1/send", {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-Api-Key": apiKey },
      body: JSON.stringify(guestPayload)
    });

    // Even if the guest copy fails, the internal one succeeded; return ok with a note.
    if (!sendGuest.ok) {
      const guestErr = await sendGuest.text();
      return json({ ok: true, warn: "guest_ack_failed", detail: guestErr });
    }

    return json({ ok: true });
  } catch (err) {
    return json({ error: "server_error", detail: String(err) }, 500);
  }
}
