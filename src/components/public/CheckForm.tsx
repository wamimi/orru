"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/Button";
import { parseStatementRef, verifyPath } from "@/lib/alias";

export function CheckForm() {
  const router = useRouter();
  const [value, setValue] = useState("");
  const [error, setError] = useState<string | null>(null);

  function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const parsed = parseStatementRef(value);
    if (parsed.kind === "invalid") {
      setError("That does not look like a statement id. Use orru:cred:… or the long 0x id.");
      return;
    }
    setError(null);
    const ref = parsed.kind === "bytes32" ? parsed.credentialId : parsed.display;
    router.push(verifyPath(ref));
  }

  return (
    <form onSubmit={onSubmit} className="mt-10 max-w-xl">
      <label htmlFor="statement-id" className="eyebrow text-ink-faint">
        Statement id
      </label>
      <div className="mt-3 flex flex-col gap-3 sm:flex-row sm:items-stretch">
        <input
          id="statement-id"
          name="id"
          value={value}
          onChange={(event) => {
            setValue(event.target.value);
            if (error) setError(null);
          }}
          placeholder="orru:cred:7b6a24eb"
          autoComplete="off"
          spellCheck={false}
          className="min-h-11 flex-1 rounded-control border border-rule bg-paper px-4 text-[0.9375rem] text-ink outline-none transition-tone placeholder:text-ink-faint focus:border-brand"
        />
        <Button type="submit">Check this statement</Button>
      </div>
      {error ? (
        <p className="mt-3 text-sm text-[color:var(--ev-failed-fg)]" role="alert">
          {error}
        </p>
      ) : (
        <p className="mt-3 text-sm text-ink-faint">
          Anyone can check. No account. Exact pay is not on the next page.
        </p>
      )}
    </form>
  );
}
