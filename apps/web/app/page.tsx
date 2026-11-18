"use client";
import {
  ShieldCheck,
  Plus,
  Globe,
  ChevronRight,
  RefreshCw,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { copy } from "@/lib/copy";
import { LoginScreen } from "@/components/login-screen";
import { FilingDetails } from "@/components/filing-details";
import { FilingForm } from "@/components/filing-form";
import { StatusSummary } from "@/components/workspace/status-summary";
import { FilingList } from "@/components/workspace/filing-list";
import { WorkspaceSidebar } from "@/components/workspace/workspace-sidebar";
import { useWorkspace } from "@/hooks/use-workspace";
export default function Home() {
  const w = useWorkspace();
  const {
    lang,
    setLang,
    actor,
    boot,
    error,
    setError,
    notice,
    setNotice,
    busy,
    loading,
    form,
    setForm,
    editing,
    selected,
    decision,
    setDecision,
    reason,
    setReason,
    refresh,
    transition,
    open,
  } = w;
  const t = copy[lang];
  const language = (
    <Button
      variant="ghost"
      size="sm"
      onClick={() => setLang(lang === "en" ? "ar" : "en")}
    >
      <Globe size={15} />
      {lang === "en" ? "العربية" : "English"}
    </Button>
  );
  if (boot)
    return (
      <div className="loading-screen">
        <ShieldCheck size={36} />
        {t.loading}
      </div>
    );
  if (!actor)
    return (
      <LoginScreen
        lang={lang}
        language={language}
        message={error}
        onSignedIn={w.onSignedIn}
      />
    );
  return (
    <div className="app-shell">
      <WorkspaceSidebar
        lang={lang}
        actor={actor}
        language={language}
        status={w.status}
        counts={w.counts}
        busy={busy}
        navigateStatus={w.navigateStatus}
        logout={w.logout}
      />
      <a className="skip-link" href="#workspace-main">
        {lang === "ar" ? "انتقل إلى الطلبات" : "Skip to filings"}
      </a>
      <main className="main">
        <header className="topbar">
          <div>
            <span className="muted">{t.workspace}</span>
            <ChevronRight size={14} />
            <strong>{t.overview}</strong>
          </div>
          <div>
            {language}
            <span className="top-user">{actor.name}</span>
          </div>
        </header>
        <div className="content">
          <div className="page-heading">
            <div>
              <span className="eyebrow">
                {actor.role === "ADMIN" ? t.readOnly : t.tag}
              </span>
              <h1>{t.filings}</h1>
            </div>
            <div className="heading-actions">
              <Button
                variant="outline"
                size="icon"
                aria-label={t.refresh}
                onClick={() => void refresh()}
                disabled={loading || busy}
              >
                <RefreshCw
                  size={16}
                  className={loading ? "animate-spin" : ""}
                />
              </Button>
              {actor.role === "SUBMITTER" && (
                <Button onClick={w.newFiling}>
                  <Plus size={17} />
                  {t.new}
                </Button>
              )}
            </div>
          </div>
          {error && (
            <div role="alert" className="error alert">
              {error}
              <button aria-label={t.close} onClick={() => setError("")}>
                ×
              </button>
            </div>
          )}
          {notice && (
            <div role="status" className="success alert">
              {notice}
              <button aria-label={t.close} onClick={() => setNotice("")}>
                ×
              </button>
            </div>
          )}
          <StatusSummary
            lang={lang}
            status={w.status}
            counts={w.counts}
            chooseStatus={w.chooseStatus}
          />
          <FilingList
            lang={lang}
            role={actor.role}
            items={w.items}
            total={w.total}
            page={w.page}
            status={w.status}
            counts={w.counts}
            loading={loading}
            search={w.search}
            setSearch={w.setSearch}
            chooseStatus={w.chooseStatus}
            changePage={w.changePage}
            open={open}
          />
          <footer className="workspace-footer">
            <ShieldCheck size={14} />
            {t.secure}
            <span>Qawaed / قواعد</span>
          </footer>
        </div>
      </main>
      <FilingDetails
        lang={lang}
        actor={actor}
        selected={selected}
        setSelected={w.closeDetail}
        decision={decision}
        setDecision={setDecision}
        reason={reason}
        setReason={setReason}
        busy={busy}
        error={error}
        open={open}
        transition={transition}
        onEdit={w.editFiling}
      />
      <FilingForm
        open={form}
        onClose={() => setForm(false)}
        lang={lang}
        filing={editing}
        onUnauthorized={w.onUnauthorized}
        onSaved={w.onSaved}
      />
    </div>
  );
}
