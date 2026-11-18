"use client";
import type { Dispatch, SetStateAction } from "react";
import { Check, ShieldCheck, RefreshCw, ArrowUpRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import type { Actor, Filing } from "@/lib/api";
import { copy, labels } from "@/lib/copy";
type Setter<T> = Dispatch<SetStateAction<T>>;
type Props = {
  lang: "en" | "ar";
  actor: Actor;
  selected: Filing | null;
  setSelected: (value: Filing | null) => void;
  decision: string | null;
  setDecision: Setter<string | null>;
  reason: string;
  setReason: Setter<string>;
  busy: boolean;
  error: string;
  open: (id: string) => Promise<void>;
  transition: (target: string) => Promise<void>;
  onEdit: (filing: Filing) => void;
};
export function FilingDetails({
  lang,
  actor,
  selected,
  setSelected,
  decision,
  setDecision,
  reason,
  setReason,
  busy,
  error,
  open,
  transition,
  onEdit,
}: Props) {
  const t = copy[lang];
  const label = (key: string) => labels[key]?.[lang === "ar" ? 1 : 0] ?? key;
  const date = (value: string) =>
    new Intl.DateTimeFormat(
      lang === "ar" ? "ar-SA-u-ca-gregory-nu-latn" : "en-GB",
      {
        dateStyle: "medium",
        timeZone: "UTC",
      },
    ).format(new Date(value));
  const pill = (value: string) => (
    <Badge variant="secondary" className={"status status-" + value}>
      {label(value)}
    </Badge>
  );
  return (
    <Dialog
      open={!!selected}
      onOpenChange={(v) => {
        if (!v && !busy) {
          setSelected(null);
          setDecision(null);
        }
      }}
    >
      <DialogContent
        closeLabel={t.close}
        className="detail-dialog"
        dir={lang === "ar" ? "rtl" : "ltr"}
      >
        <DialogHeader>
          <span className="eyebrow">
            {t.details} / <bdi>{selected?.id.slice(0, 8)}</bdi>
          </span>
          <DialogTitle>{selected?.title}</DialogTitle>
          {selected && (
            <div className="header-status">{pill(selected.status)}</div>
          )}
          <DialogDescription>
            {selected?.tenant_name} · {t.version} {selected?.version}
          </DialogDescription>
        </DialogHeader>
        {selected && (
          <div className="detail-body">
            <div className="detail-status">
              <Button
                variant="ghost"
                size="sm"
                disabled={busy}
                onClick={() => void open(selected.id)}
              >
                <RefreshCw size={14} />
                {t.refresh}
              </Button>
            </div>
            {error && (
              <div role="alert" className="error">
                {error}
              </div>
            )}
            <ol className="workflow-steps" aria-label={t.workflow}>
              {[
                "DRAFT",
                "SUBMITTED",
                "UNDER_REVIEW",
                selected.status === "REJECTED" ? "REJECTED" : "APPROVED",
              ].map((step, index) => {
                const current = [
                  "DRAFT",
                  "SUBMITTED",
                  "UNDER_REVIEW",
                  "APPROVED",
                ].indexOf(
                  selected.status === "REJECTED" ? "APPROVED" : selected.status,
                );
                return (
                  <li
                    key={step}
                    className={index <= current ? "reached" : ""}
                    aria-current={index === current ? "step" : undefined}
                  >
                    <span>
                      {index < current ? <Check size={12} /> : index + 1}
                    </span>
                    {label(step)}
                  </li>
                );
              })}
            </ol>
            <div className="detail-grid">
              {[
                [t.cr, selected.identifier_cr],
                [t.category, label(selected.category)],
                [t.date, date(selected.expiration_date)],
                [t.created, date(selected.created_at)],
              ].map(([key, value]) => (
                <div key={key}>
                  <small>{key}</small>
                  <strong>
                    <bdi>{value}</bdi>
                  </strong>
                </div>
              ))}
            </div>
            {selected.rejection_reason && (
              <div className="rejection">
                <strong>{t.reason}</strong>
                <p>{selected.rejection_reason}</p>
              </div>
            )}
            {["APPROVED", "REJECTED"].includes(selected.status) && (
              <p className="muted text-sm">{t.final}</p>
            )}
            <div className="detail-actions">
              {actor.role === "SUBMITTER" && selected.status === "DRAFT" && (
                <>
                  <Button
                    variant="outline"
                    disabled={busy}
                    onClick={() => {
                      onEdit(selected);
                    }}
                  >
                    {t.edit}
                  </Button>
                  <Button
                    disabled={busy}
                    onClick={() => void transition("SUBMITTED")}
                  >
                    {t.submit}
                    <ArrowUpRight size={16} />
                  </Button>
                </>
              )}
              {actor.role === "AUDITOR" && selected.status === "SUBMITTED" && (
                <Button
                  disabled={busy}
                  onClick={() => void transition("UNDER_REVIEW")}
                >
                  {t.start}
                </Button>
              )}
              {actor.role === "AUDITOR" &&
                selected.status === "UNDER_REVIEW" &&
                !decision && (
                  <>
                    <Button
                      disabled={busy}
                      onClick={() => setDecision("APPROVED")}
                    >
                      <Check size={16} />
                      {t.approve}
                    </Button>
                    <Button
                      variant="outline"
                      className="reject-action"
                      disabled={busy}
                      onClick={() => setDecision("REJECTED")}
                    >
                      {t.reject}
                    </Button>
                  </>
                )}
            </div>
            {decision && (
              <div className={"decision decision-" + decision}>
                <h3>{t.confirm}</h3>
                <p>{t.confirmText}</p>
                {decision === "REJECTED" && (
                  <>
                    <Label htmlFor="rejection">{t.reason}</Label>
                    <Textarea
                      id="rejection"
                      maxLength={2000}
                      value={reason}
                      onChange={(e) => setReason(e.target.value)}
                      placeholder={t.reasonHint}
                    />
                  </>
                )}
                <div className="detail-actions">
                  <Button
                    variant={
                      decision === "REJECTED" ? "destructive" : "default"
                    }
                    disabled={busy}
                    onClick={() => void transition(decision)}
                  >
                    {busy
                      ? t.working
                      : decision === "APPROVED"
                        ? t.approve
                        : t.reject}
                  </Button>
                  <Button
                    variant="ghost"
                    disabled={busy}
                    onClick={() => setDecision(null)}
                  >
                    {t.cancel}
                  </Button>
                </div>
              </div>
            )}
            <div className="verification">
              <h3>
                <ShieldCheck size={19} />
                {t.registry}
              </h3>
              <p>
                {selected.verification
                  ? t.verificationNote
                  : selected.status === "REJECTED"
                    ? t.registryNotApplicable
                    : t.noVerification}
              </p>
              {selected.verification && (
                <>
                  <div className="verification-row">
                    {pill(selected.verification.status)}
                  </div>
                  {selected.verification.status === "FAILED" && (
                    <p role="status">{t.registryFailed}</p>
                  )}
                  <details className="registry-details">
                    <summary>{t.technicalDetails}</summary>
                    <p>
                      {t.attempt}: <bdi>{selected.verification.attempt}/4</bdi>
                    </p>
                    {selected.verification.reference_id && (
                      <p className="reference">
                        <strong>{t.reference}</strong>
                        <code dir="ltr">
                          {selected.verification.reference_id}
                        </code>
                      </p>
                    )}
                  </details>
                </>
              )}
            </div>
            <section className="audit">
              <div className="audit-heading">
                <h3>{t.history}</h3>
                <span>{t.latestFirst}</span>
              </div>
              <p>{t.auditHint}</p>
              <ol>
                {selected.audit
                  ?.slice()
                  .reverse()
                  .map((a) => (
                    <li key={a.id}>
                      <span className="audit-dot" />
                      <div className="audit-title">
                        <strong>
                          {a.action === "CREATED"
                            ? t.created
                            : a.action === "UPDATED"
                              ? t.updated
                              : label(a.new_state)}
                        </strong>
                        <time dateTime={a.timestamp}>
                          {new Intl.DateTimeFormat(
                            lang === "ar"
                              ? "ar-SA-u-ca-gregory-nu-latn"
                              : "en-GB",
                            { dateStyle: "medium", timeStyle: "short" },
                          ).format(new Date(a.timestamp))}
                        </time>
                      </div>
                      <p className="audit-actor">
                        <bdi>{a.actor_name}</bdi>
                      </p>
                      <div className="audit-state">
                        {a.previous_state && (
                          <span>
                            {t.before}: <bdi>{label(a.previous_state)}</bdi>
                          </span>
                        )}
                        <span>
                          {t.after}: <bdi>{label(a.new_state)}</bdi>
                        </span>
                      </div>
                      <details>
                        <summary>{t.viewChanges}</summary>
                        <dl>
                          {Object.entries(a.metadata.after)
                            .filter(
                              ([k, v]) =>
                                [
                                  "title",
                                  "identifier_cr",
                                  "category",
                                  "expiration_date",
                                  "status",
                                  "rejection_reason",
                                  "version",
                                ].includes(k) && a.metadata.before?.[k] !== v,
                            )
                            .map(([k, v]) => (
                              <div key={k}>
                                <dt>
                                  {
                                    (
                                      {
                                        title: t.title,
                                        identifier_cr: t.cr,
                                        category: t.category,
                                        expiration_date: t.date,
                                        status: t.status,
                                        rejection_reason: t.reason,
                                        version: t.version,
                                      } as Record<string, string>
                                    )[k]
                                  }
                                </dt>
                                <dd className="audit-change">
                                  {a.metadata.before && (
                                    <div className="change-before">
                                      <small>{t.before}</small>
                                      <bdi>
                                        {label(
                                          String(a.metadata.before[k] ?? "—"),
                                        )}
                                      </bdi>
                                    </div>
                                  )}
                                  <div className="change-after">
                                    <small>{t.after}</small>
                                    <bdi>{label(String(v ?? "—"))}</bdi>
                                  </div>
                                </dd>
                              </div>
                            ))}
                        </dl>
                      </details>
                    </li>
                  ))}
              </ol>
            </section>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
