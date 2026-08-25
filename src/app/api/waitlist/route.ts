import { NextRequest, NextResponse } from "next/server";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

type Body = {
  email?: string;
  source?: string;
};

export async function POST(request: NextRequest) {
  let body: Body;

  try {
    body = (await request.json()) as Body;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const email = body.email?.trim().toLowerCase() ?? "";
  const source = body.source?.trim().slice(0, 64) || "unknown";

  if (!email || !EMAIL_RE.test(email)) {
    return NextResponse.json(
      { error: "Enter a valid email address." },
      { status: 400 },
    );
  }

  const webhook = process.env.WAITLIST_WEBHOOK_URL;
  const notifyEmail = process.env.WAITLIST_NOTIFY_EMAIL;
  const resendKey = process.env.RESEND_API_KEY;

  try {
    if (webhook) {
      const response = await fetch(webhook, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email,
          source,
          product: "orru",
          joinedAt: new Date().toISOString(),
        }),
      });

      if (!response.ok) {
        throw new Error(`Webhook failed with ${response.status}`);
      }
    } else if (resendKey && notifyEmail) {
      const response = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${resendKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          from: process.env.WAITLIST_FROM_EMAIL ?? "orru <onboarding@resend.dev>",
          to: [notifyEmail],
          subject: `Orru waitlist · ${email}`,
          text: `${email} joined the waitlist from ${source}.`,
        }),
      });

      if (!response.ok) {
        throw new Error(`Resend failed with ${response.status}`);
      }
    } else if (notifyEmail) {
      const response = await fetch(
        `https://formsubmit.co/ajax/${encodeURIComponent(notifyEmail)}`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Accept: "application/json",
          },
          body: JSON.stringify({
            email,
            source,
            _subject: "Orru waitlist signup",
            _template: "table",
          }),
        },
      );

      if (!response.ok) {
        throw new Error(`FormSubmit failed with ${response.status}`);
      }
    } else {
      console.info("[waitlist]", { email, source, at: new Date().toISOString() });
    }
  } catch (error) {
    console.error("[waitlist] delivery failed", error);
    return NextResponse.json(
      { error: "Could not save your signup. Please try again shortly." },
      { status: 502 },
    );
  }

  return NextResponse.json({ ok: true });
}
