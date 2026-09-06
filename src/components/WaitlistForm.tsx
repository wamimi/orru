"use client";

import { FormEvent, useState } from "react";

type Status = "idle" | "loading" | "success" | "error";

export function WaitlistForm({
  source = "hero",
  compact = false,
}: {
  source?: string;
  compact?: boolean;
}) {
  const [email, setEmail] = useState("");
  const [status, setStatus] = useState<Status>("idle");
  const [message, setMessage] = useState("");

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setStatus("loading");
    setMessage("");

    try {
      const response = await fetch("/api/waitlist", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, source }),
      });
      const data = (await response.json()) as { error?: string; ok?: boolean };

      if (!response.ok) {
        setStatus("error");
        setMessage(data.error ?? "Something went wrong. Try again.");
        return;
      }

      setStatus("success");
      setMessage("You're on the list. We'll be in touch.");
      setEmail("");
    } catch {
      setStatus("error");
      setMessage("Network error. Check your connection and try again.");
    }
  }

  return (
    <div className={compact ? "w-full" : "mx-auto w-full max-w-xl"}>
      <form
        onSubmit={onSubmit}
        className="flex flex-col gap-3 sm:flex-row sm:items-stretch"
      >
        <label className="sr-only" htmlFor={`waitlist-email-${source}`}>
          Email address
        </label>
        <input
          id={`waitlist-email-${source}`}
          type="email"
          name="email"
          required
          autoComplete="email"
          placeholder="you@company.com"
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          disabled={status === "loading" || status === "success"}
          className="min-h-12 flex-1 rounded-md border border-white/10 bg-ink/40 px-4 text-center text-[15px] text-paper outline-none transition placeholder:text-fog/70 focus:border-accent/50 focus:ring-2 focus:ring-accent/20 disabled:opacity-60 sm:text-left"
        />
        <button
          type="submit"
          disabled={status === "loading" || status === "success"}
          className="min-h-12 shrink-0 rounded-md bg-accent px-6 text-[15px] font-semibold text-ink transition hover:bg-accent-deep disabled:cursor-not-allowed disabled:opacity-70"
        >
          {status === "loading"
            ? "Joining…"
            : status === "success"
              ? "Joined"
              : "Join waitlist"}
        </button>
      </form>
      {message ? (
        <p
          className={`mt-3 text-center text-sm ${
            status === "error" ? "text-red-300" : "text-mist"
          }`}
          role="status"
        >
          {message}
        </p>
      ) : (
        <p className="mt-3 text-center text-sm text-fog">
          Early access for workers, fintechs, and anyone who needs to show they earn.
        </p>
      )}
    </div>
  );
}
