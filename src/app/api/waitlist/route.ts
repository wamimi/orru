import { NextRequest, NextResponse } from "next/server";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

type Body = {
  email?: string;
  source?: string;
};

function env(name: string): string {
  return process.env[name]?.trim() ?? "";
}

async function sendViaFormSubmit(notifyEmail: string, email: string, source: string) {
  const response = await fetch(
    `https://formsubmit.co/ajax/${encodeURIComponent(notifyEmail)}`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
        Origin: "https://orru.xyz",
        Referer: "https://orru.xyz/",
      },
      body: JSON.stringify({
        name: "Orru waitlist",
        email,
        source,
        message: `${email} joined the waitlist from ${source}.`,
        _replyto: email,
        _subject: "Orru waitlist signup",
        _template: "table",
        _captcha: "false",
      }),
    },
  );

  const payload = (await response.json().catch(() => null)) as {
    success?: string | boolean;
    message?: string;
  } | null;

  const message = payload?.message ?? "";
  const activating = /activation/i.test(message);
  const ok =
    activating ||
    (response.ok &&
      (payload?.success === true ||
        payload?.success === "true" ||
        payload?.success === undefined));

  if (activating) {
    console.info(
      "[waitlist] FormSubmit sent an activation email. Open it and click Activate Form, then signups will arrive in the inbox.",
    );
    return;
  }

  if (!ok) {
    throw new Error(message || `FormSubmit failed with ${response.status}`);
  }
}

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

  const webhook = env("WAITLIST_WEBHOOK_URL");
  const notifyEmail = env("WAITLIST_NOTIFY_EMAIL");
  const resendKey = env("RESEND_API_KEY");

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
          from: env("WAITLIST_FROM_EMAIL") || "orru <onboarding@resend.dev>",
          to: [notifyEmail],
          subject: `Orru waitlist · ${email}`,
          text: `${email} joined the waitlist from ${source}.`,
        }),
      });

      if (!response.ok) {
        throw new Error(`Resend failed with ${response.status}`);
      }
    } else if (notifyEmail) {
      await sendViaFormSubmit(notifyEmail, email, source);
    } else if (process.env.NODE_ENV === "production") {
      console.error("[waitlist] no delivery method configured");
      return NextResponse.json(
        { error: "Waitlist delivery is not configured." },
        { status: 503 },
      );
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
