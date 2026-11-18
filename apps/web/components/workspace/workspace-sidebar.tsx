"use client";
import { copy, labels } from "@/lib/copy";
import type { Workspace } from "@/hooks/use-workspace";
import type { ReactNode } from "react";
import type { Actor } from "@/lib/api";
import { ShieldCheck, LayoutDashboard, Files, LogOut } from "lucide-react";
import { Button } from "@/components/ui/button";
type Props = Pick<
  Workspace,
  "lang" | "status" | "counts" | "busy" | "navigateStatus" | "logout"
> & { actor: Actor; language: ReactNode };
export function WorkspaceSidebar({
  lang,
  status,
  counts,
  busy,
  navigateStatus,
  logout,
  actor,
  language,
}: Props) {
  const t = copy[lang];
  const label = (key: string) => labels[key]?.[lang === "ar" ? 1 : 0] ?? key;
  return (
    <aside className="sidebar">
      <div className="brand">
        <span className="brand-symbol">ق</span>
        <span>
          {t.brand}
          <small>{t.tag}</small>
        </span>
      </div>
      <span className="nav-label">{t.workspace}</span>
      <button
        className={status === "ALL" ? "nav-item active" : "nav-item"}
        onClick={() => navigateStatus("ALL")}
      >
        <LayoutDashboard size={18} />
        {t.overview}
      </button>
      <button
        className={status === "SUBMITTED" ? "nav-item active" : "nav-item"}
        onClick={() => navigateStatus("SUBMITTED")}
      >
        <Files size={18} />
        {t.review}
        <span className="nav-count">{counts.SUBMITTED ?? 0}</span>
      </button>
      <div className="sidebar-note">
        <ShieldCheck size={25} />
        <strong>{t.mine}</strong>
        <p>{t.secure}</p>
      </div>
      <div className="mobile-language">{language}</div>
      <div className="profile">
        <div className="avatar">{actor.name.slice(0, 1)}</div>
        <span>
          <strong>{actor.name}</strong>
          <small>{label(actor.role)}</small>
        </span>
        <Button
          variant="ghost"
          size="icon"
          aria-label={t.logout}
          disabled={busy}
          onClick={() => void logout()}
        >
          <LogOut size={17} />
        </Button>
      </div>
    </aside>
  );
}
