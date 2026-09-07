export function ShareTicket({
  party,
  purpose,
  expires,
  id,
  fields,
}: {
  party: string;
  purpose: string;
  expires: string;
  id: string;
  fields: string[];
}) {
  return (
    <div>
      <div className="border-t-2 border-rule-strong pt-6 md:pt-8">
        <p className="meta text-brand">Requester</p>
        <h2 className="display-md mt-3 max-w-sm text-ink">{party}</h2>
        <p className="mt-2 max-w-md text-[0.9375rem] leading-relaxed text-ink-soft">
          {purpose}
        </p>
      </div>

      <dl className="mt-8 border-t border-rule">
        <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 border-b border-rule py-4">
          <dt className="text-sm text-ink-soft">Window</dt>
          <dd className="meta text-ink">{expires}</dd>
        </div>
        <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 py-4">
          <dt className="text-sm text-ink-soft">Request</dt>
          <dd className="meta text-ink">{id}</dd>
        </div>
      </dl>

      <p className="eyebrow mt-10 text-ink-faint">Fields included</p>
      <ul className="mt-3 border-t border-rule">
        {fields.map((field) => (
          <li
            key={field}
            className="border-b border-rule py-3 text-sm text-ink"
          >
            {field}
          </li>
        ))}
      </ul>
    </div>
  );
}
