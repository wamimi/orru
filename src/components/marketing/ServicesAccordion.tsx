"use client";

import { useState } from "react";
import { ArrowDownRight, Plus } from "@phosphor-icons/react";
import { marketingServices } from "@/lib/marketing";

export function ServicesAccordion() {
  const [open, setOpen] = useState<number | null>(0);

  return (
    <div className="mkt-services">
      {marketingServices.map((service, index) => {
        const active = open === index;
        const Icon = service.icon;
        return (
          <article
            key={service.title}
            className={`mkt-service ${active ? "is-open" : ""}`}
          >
            <button
              type="button"
              className="mkt-service__trigger"
              aria-expanded={active}
              aria-controls={`service-panel-${index}`}
              onClick={() => setOpen(active ? null : index)}
            >
              <span className="mkt-service__title">
                <Icon size={38} weight="regular" aria-hidden="true" />
                <span>{service.title}</span>
                <small>{service.number}</small>
              </span>
              <span className="mkt-service__tags" aria-hidden="true">
                {service.tags.map((tag) => (
                  <span key={tag}>{tag}</span>
                ))}
              </span>
              <span className="mkt-service__plus" aria-hidden="true">
                <Plus size={22} />
              </span>
            </button>

            <div
              id={`service-panel-${index}`}
              className="mkt-service__panel"
              aria-hidden={!active}
            >
              <div>
                <div className="mkt-service__panel-inner">
                  <p>{service.description}</p>
                  <div>
                    <p>{service.detail}</p>
                    <a href="#how-it-works">
                      How it works
                      <ArrowDownRight size={17} />
                    </a>
                  </div>
                </div>
              </div>
            </div>
          </article>
        );
      })}
    </div>
  );
}
