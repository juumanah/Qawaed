"use client";
import { copy, labels } from "@/lib/copy";
import type { Workspace } from "@/hooks/use-workspace";
import { Clock } from "lucide-react";
export function StatusSummary({
  lang,
  status,
  counts,
  chooseStatus,
}: Pick<Workspace, "lang" | "status" | "counts" | "chooseStatus">) {
  const t = copy[lang];
  const label = (key: string) => labels[key]?.[lang === "ar" ? 1 : 0] ?? key;
  return (
    <div className="focus-summary" aria-label={t.filter}>
      <button
        type="button"
        className="review-priority"
        aria-pressed={status === "UNDER_REVIEW"}
        onClick={() => chooseStatus("UNDER_REVIEW")}
      >
        <span className="priority-copy">
          <span>
            <Clock size={20} aria-hidden="true" />
            {label("UNDER_REVIEW")}
          </span>
          <small>{t.viewReview}</small>
        </span>
        <strong>{counts.UNDER_REVIEW ?? 0}</strong>
      </button>
      <div className="secondary-metrics">
        {[
          { status: "SUBMITTED", name: label("SUBMITTED") },
          { status: "APPROVED", name: t.approved },
          { status: "REJECTED", name: t.rejected },
        ].map(({ status: value, name }) => (
          <button
            type="button"
            key={value}
            aria-pressed={status === value}
            onClick={() => chooseStatus(value)}
          >
            <span>{name}</span>
            <strong>{counts[value] ?? 0}</strong>
          </button>
        ))}
      </div>
    </div>
  );
}
