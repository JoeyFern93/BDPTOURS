// functions/api/book.js
// Cloudflare Pages Function: receives booking JSON and sends an email via Resend API.
// Set the environment variable RESEND_API_KEY in Cloudflare Pages (Project → Settings → Environment Variables).

export async function onRequestPost(context) {
  try {
    const { request, env } = context;

    // Parse JSON body
    const data = await request.json();

    // Basic validation
    const required = ["first_name", "last_name", "email"];
    for (const f of required) {
      if (!data[f] || String(data[f]).trim() === "") {
        return new Response(JSON.stringify({ error: `Missing field: ${f}` }), {
          status: 400,
          headers: { "Content-Type": "application/json" }
        });
      }
    }

    const {
      first_name = "",
      last_name = "",
      email = "",
      phone = "",
      start_date = "",
      end_date = "",
      message = ""
    } = data;

    // Compose email (plain text)
    const subject = `New Booking Request: ${first_name} ${last_name}`;
    const textBody = [
      `New booking request from the website:`,
      ``,
      `Name: ${first_name} ${last_name}`,
      `Email: ${email}`,
      `Phone: ${phone || "(not provided)"}`,
      `Requested dates: ${start_date || "?"} → ${end_date || "?"}`,
      ``,
      `Message:`,
      message || "(none)",
      ``,
      `— Website notifier`
    ].join("\n");

    // Send via Resend REST API
    const apiKey = env.RESEND_API_KEY; // <-- set in your Pages project settings
    if (!apiKey) {
      return new Response(JSON.stringify({ error: "Missing RESEND_API_KEY env var" }), {
        status: 500,
        headers: { "Content-Type": "application/json" }
      });
    }

    const sendResp = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${apiKey}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        from: "Barlovento Tours <no-reply@barloventodelpacificotours.com>",
        to: ["joeyfernandez81@gmail.com"], // destination for testing
        reply_to: email,                   // so you can reply directly to the guest
        subject,
        text: textBody
      })
    });

    if (!sendResp.ok) {
      const errTxt = await sendResp.text();
      return new Response(JSON.stringify({ error: "Email failed", details: errTxt }), {
        status: 502,
        headers: { "Content-Type": "application/json" }
      });
    }

    return new Response(JSON.stringify({ ok: true }), {
      status: 200,
      headers: { "Content-Type": "application/json" }
    });

  } catch (err) {
    return new Response(JSON.stringify({ error: "Server error", details: String(err) }), {
      status: 500,
      headers: { "Content-Type": "application/json" }
    });
  }
}
