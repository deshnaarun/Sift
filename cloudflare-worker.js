// SwiftSift email categorizer + draft-reply writer — Cloudflare Worker (Groq, free tier)
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

const CATEGORIZE_SYSTEM_PROMPT = `You sort a user's inbox emails into exactly one of three categories:
- "reply": a real message from a person or service that likely needs a response or action from the user
- "junk": marketing, promotions, spam, or anything pushing a sale/discount/prize
- "fyi": newsletters, digests, automated notifications, or anything informational needing no action

Watch for marketing emails disguised as personal messages — a "Re:" or "Fwd:" prefix on a first contact, the recipient's first name used as a hook, or a leading rhetorical question ("Are these the projects your home needs?") are sales tactics designed to look like a real reply thread. These are "junk," not "reply," regardless of the personalized framing — judge by the actual content (services/pricing pitch, no real prior conversation), not the subject line's formatting.

Classify every email you're given. Be decisive — always pick exactly one category per email.

Respond with ONLY a JSON object of this exact shape, no other text:
{"results": [{"id": "<email id>", "category": "reply" | "junk" | "fyi"}, ...]}
Include one entry per email you were given, in any order.`;

const DRAFT_SYSTEM_PROMPT = `You write a short, polite draft email reply on behalf of the user, replying to the email they received. Keep it under 120 words, warm but professional, and address the specific point(s) raised in the original email — don't be generic. Output ONLY the reply body text: no subject line, and sign off simply (e.g. "Thanks," or "Best,") without a name, since the user will add their own.`;

function corsHeaders() {
  return {
    "Access-Control-Allow-Origin": ALLOWED_ORIGIN,
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type"
  };
}

function jsonResponse(body, status) {
  return new Response(JSON.stringify(body), {
    status: status || 200,
    headers: { "Content-Type": "application/json", ...corsHeaders() }
  });
}

async function callGroq(env, systemPrompt, userContent, jsonMode) {
  const requestBody = {
    model: GROQ_MODEL,
    messages: [
      { role: "system", content: systemPrompt },
      { role: "user", content: userContent }
    ],
    temperature: jsonMode ? 0 : 0.5
  };
  if (jsonMode) requestBody.response_format = { type: "json_object" };

  const groqResponse = await fetch("https://api.groq.com/openai/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${env.GROQ_API_KEY}`
    },
    body: JSON.stringify(requestBody)
  });

  if (!groqResponse.ok) {
    const errText = await groqResponse.text();
    return { error: jsonResponse({ error: "Groq API error", detail: errText }, 502) };
  }

  const groqData = await groqResponse.json();
  const text = groqData.choices?.[0]?.message?.content;
  if (!text) {
    return { error: jsonResponse({ error: "Unexpected Groq response shape", detail: JSON.stringify(groqData) }, 502) };
  }
  return { text };
}

async function handleCategorize(body, env) {
  const emails = Array.isArray(body.emails) ? body.emails : [];
  if (emails.length === 0) {
    return jsonResponse({ results: [] });
  }

  const emailList = emails.map(e => ({
    id: String(e.id),
    subject: String(e.subject || ""),
    snippet: String(e.snippet || "")
  }));

  try {
    const result = await callGroq(env, CATEGORIZE_SYSTEM_PROMPT, JSON.stringify(emailList), true);
    if (result.error) return result.error;

    const parsed = JSON.parse(result.text);
    if (!Array.isArray(parsed.results)) {
      return jsonResponse({ error: "Groq response missing results array", detail: result.text }, 502);
    }
    return jsonResponse(parsed);
  } catch (e) {
    return jsonResponse({ error: "Worker error", detail: String(e) }, 500);
  }
}

async function handleDraft(body, env) {
  const email = body.email || {};
  const userContent = `From: ${email.sender || "Unknown sender"}\nSubject: ${email.subject || ""}\nMessage: ${email.snippet || ""}`;

  try {
    const result = await callGroq(env, DRAFT_SYSTEM_PROMPT, userContent, false);
    if (result.error) return result.error;
    return jsonResponse({ draft: result.text.trim() });
  } catch (e) {
    return jsonResponse({ error: "Worker error", detail: String(e) }, 500);
  }
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
      return jsonResponse({ error: "Invalid JSON" }, 400);
    }

    if (body.action === "draft") {
      return handleDraft(body, env);
    }
    return handleCategorize(body, env);
  }
};
