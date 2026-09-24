import React from "react";
import { Check } from "lucide-react";

export default function StatusStepper({ steps, currentIndex }) {
  return (
    <div className="bg-white dark:bg-stone-800 rounded-2xl border border-stone-200 dark:border-stone-700 shadow-sm p-5 mb-6 overflow-x-auto">
      <div className="flex items-center min-w-max">
        {steps.map((step, i) => {
          const done = i < currentIndex;
          const active = i === currentIndex;
          return (
            <React.Fragment key={step}>
              <div className="flex flex-col items-center gap-1.5 px-1">
                <div
                  className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-semibold border-2 ${
                    done
                      ? "bg-emerald-500 border-emerald-500 text-white"
                      : active
                      ? "bg-stone-900 border-stone-900 text-white"
                      : "bg-white border-stone-200 text-stone-400"
                  }`}
                >
                  {done ? <Check className="w-4 h-4" /> : i + 1}
                </div>
                <span className={`text-xs text-center w-24 ${active ? "text-stone-900 font-semibold" : "text-stone-400"}`}>
                  {step}
                </span>
              </div>
              {i < steps.length - 1 && (
                <div className={`h-0.5 w-10 shrink-0 ${i < currentIndex ? "bg-emerald-500" : "bg-stone-200"}`} />
              )}
            </React.Fragment>
          );
        })}
      </div>
    </div>
  );
}
