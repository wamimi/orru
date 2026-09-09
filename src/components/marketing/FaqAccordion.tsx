"use client";

import { useState } from "react";
import { Plus } from "@phosphor-icons/react";
import { faqItems } from "@/lib/marketing";

export function FaqAccordion() {
  const [open, setOpen] = useState<number | null>(0);

  return (
    <div className="mkt-faq-list">
      {faqItems.map((item, index) => {
        const active = open === index;
        return (
          <div key={item.question} className={`mkt-faq ${active ? "is-open" : ""}`}>
            <button
              type="button"
              className="mkt-faq__trigger"
              aria-expanded={active}
              aria-controls={`faq-panel-${index}`}
              onClick={() => setOpen(active ? null : index)}
            >
              <span>{item.question}</span>
              <span className="mkt-faq__plus" aria-hidden="true">
                <Plus size={21} />
              </span>
            </button>
            <div
              id={`faq-panel-${index}`}
              className="mkt-faq__panel"
              aria-hidden={!active}
            >
              <div>
                <p>{item.answer}</p>
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}
