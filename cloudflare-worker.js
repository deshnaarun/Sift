// SwiftSift email categorizer — Cloudflare Worker (Groq, free tier)
//
// Deploy: dash.cloudflare.com -> Workers & Pages -> Create -> paste this file in,
// then Settings -> Variables -> add a secret named GROQ_API_KEY.
// Nothing here logs or stores email content anywhere — each request is
// forwarded to Groq and the result is returned, that's it.
//
// Model name note: Groq updates their hosted model lineup periodically.
// If GROQ_MODEL below starts returning a 404/decommissioned error, check
// console.groq.com/docs/models for a current model name and swap it in.

const ALLOWED_ORIGIN = "https://deshnaarun.github.io";
const GROQ_MODEL = "openai/gpt-oss-120b";

const SYSTEM_PROMPT = `You sort a user's inbox emails into exactly one of three categories:
- "reply": a real message from a person or service that likely needs a response or action from the user
- "junk": marketing, promotions, spam, or anything pushing a sale/discount/prize
- "fyi": newsletters, digests, automated notifications, or anything informational needing no action

Classify every email you're given. Be decisive — always pick exactly one category per email.

Respond with ONLY a JSON object of this exact shape, no other text:
{"results": [{"id": "<email id>", "category": "reply" | "junk" | "fyi"}, ...]}
Include one entry per email you were given, in any order.`;

function corsHeaders() {
  return {
    "Access-Control-Allow-Origin": ALLOWED_ORIGIN,
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type"
  };
}

export default {
  async fetch(request, env) {
    if (request.method === "OPTIONS") {
      return new Response(null, { headers: corsHeaders() });
    }

    if (request.method !== "POST") {
      return new Response("Method not allowed", { status: 405, headers: corsHeaders() });
    }

    let body;
    try {
      body = await request.json();
    } catch (e) {
      return new Response(JSON.stringify({ error: "Invalid JSON" }), {
        status: 400,
        headers: { "Content-Type": "application/json", ...corsHeaders() }
      });
    }

    const emails = Array.isArray(body.emails) ? body.emails : [];
    if (emails.length === 0) {
      return new Response(JSON.stringify({ results: [] }), {
        headers: { "Content-Type": "application/json", ...corsHeaders() }
      });
    }

    const emailList = emails.map(e => ({
      id: String(e.id),
      subject: String(e.subject || ""),
      snippet: String(e.snippet || "")
    }));

    try {
      const groqResponse = await fetch("https://api.groq.com/openai/v1/chat/completions", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${env.GROQ_API_KEY}`
        },
        body: JSON.stringify({
          model: GROQ_MODEL,
          messages: [
            { role: "system", content: SYSTEM_PROMPT },
            { role: "user", content: JSON.stringify(emailList) }
          ],
          response_format: { type: "json_object" },
          temperature: 0
        })
      });

      if (!groqResponse.ok) {
        const errText = await groqResponse.text();
        return new Response(JSON.stringify({ error: "Groq API error", detail: errText }), {
          status: 502,
          headers: { "Content-Type": "application/json", ...corsHeaders() }
        });
      }

      const groqData = await groqResponse.json();
      const text = groqData.choices?.[0]?.message?.content;
      if (!text) {
        return new Response(JSON.stringify({ error: "Unexpected Groq response shape", detail: JSON.stringify(groqData) }), {
          status: 502,
          headers: { "Content-Type": "application/json", ...corsHeaders() }
        });
      }

      const parsed = JSON.parse(text);
      if (!Array.isArray(parsed.results)) {
        return new Response(JSON.stringify({ error: "Groq response missing results array", detail: text }), {
          status: 502,
          headers: { "Content-Type": "application/json", ...corsHeaders() }
        });
      }

      return new Response(JSON.stringify(parsed), {
        headers: { "Content-Type": "application/json", ...corsHeaders() }
      });
    } catch (e) {
      return new Response(JSON.stringify({ error: "Worker error", detail: String(e) }), {
        status: 500,
        headers: { "Content-Type": "application/json", ...corsHeaders() }
      });
    }
  }
};
