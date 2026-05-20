"use client";

import { useEffect, useState } from "react";

const TOUR_KEY = "genfren-tour-complete";

const steps = [
  {
    title: "Create your private vault",
    body: "Your GenFren starts with a local encrypted vault so your account stays yours."
  },
  {
    title: "Unlock the companion",
    body: "A one-time activation unlocks your persistent companion and the workspace around it."
  },
  {
    title: "Shape the first mission",
    body: "Tell GenFren what to follow, what to remember, and how often to report back."
  },
  {
    title: "Work from one calm surface",
    body: "Briefings, memory, tasks, and specialists stay in one place so the product feels continuous."
  }
];

export function ProductTour() {
  const [open, setOpen] = useState(false);
  const [step, setStep] = useState(0);

  useEffect(() => {
    const done = localStorage.getItem(TOUR_KEY);
    if (!done) setOpen(true);
  }, []);

  if (!open) {
    return null;
  }

  const current = steps[step];

  return (
    <div className="tour-backdrop">
      <div className="tour-card panel surface">
        <div className="pill">New here</div>
        <h2 style={{ marginBottom: 8 }}>{current.title}</h2>
        <p className="muted">{current.body}</p>
        <div className="tour-progress">
          {steps.map((item, index) => (
            <span key={item.title} className={`tour-dot${index === step ? " active" : ""}`} />
          ))}
        </div>
        <div className="cta-row">
          <button
            className="button"
            type="button"
            onClick={() => {
              localStorage.setItem(TOUR_KEY, "1");
              setOpen(false);
            }}
          >
            Skip tour
          </button>
          <button
            className="button primary"
            type="button"
            onClick={() => {
              if (step === steps.length - 1) {
                localStorage.setItem(TOUR_KEY, "1");
                setOpen(false);
                return;
              }
              setStep((value) => value + 1);
            }}
          >
            {step === steps.length - 1 ? "Start using GenFren" : "Next"}
          </button>
        </div>
      </div>
    </div>
  );
}
