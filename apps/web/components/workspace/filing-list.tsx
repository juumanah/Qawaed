"use client";
import { copy, labels } from "@/lib/copy";
import type { Workspace } from "@/hooks/use-workspace";
import { Files, Search, X, SlidersHorizontal, ChevronDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
} from "@/components/ui/dropdown-menu";
import type { Actor } from "@/lib/api";
type Props = Pick<
  Workspace,
  | "lang"
  | "items"
  | "total"
  | "page"
  | "status"
  | "counts"
  | "loading"
  | "search"
  | "setSearch"
  | "chooseStatus"
  | "changePage"
  | "open"
> & { role: Actor["role"] };
export function FilingList({
  lang,
  items,
  total,
  page,
  status,
  counts,
  loading,
  search,
  setSearch,
  chooseStatus,
  changePage,
  open,
  role,
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
  const filtered = items.filter((f) =>
    (f.title + " " + f.identifier_cr)
      .toLowerCase()
      .includes(search.toLowerCase()),
  );
  const allCount = Object.values(counts).reduce((a, b) => a + b, 0);
  return (
    <section
      id="workspace-main"
      tabIndex={-1}
      className="filings-panel"
      aria-busy={loading}
    >
      <div className="list-toolbar">
        <div className="list-context">
          <h2>
            {status === "ALL" ? t.all : label(status)}{" "}
            <span>{loading ? "…" : total}</span>
          </h2>
          <DropdownMenu dir={lang === "ar" ? "rtl" : "ltr"}>
            <DropdownMenuTrigger asChild>
              <Button
                variant="outline"
                className="status-menu-trigger"
                aria-label={
                  t.filter + ": " + (status === "ALL" ? t.all : label(status))
                }
              >
                <SlidersHorizontal size={16} aria-hidden="true" />
                {t.filterShort}
                <ChevronDown size={14} aria-hidden="true" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="status-filter-menu">
              <DropdownMenuRadioGroup
                value={status}
                onValueChange={chooseStatus}
              >
                {[
                  "ALL",
                  "UNDER_REVIEW",
                  "SUBMITTED",
                  "DRAFT",
                  "APPROVED",
                  "REJECTED",
                ].map((value) => (
                  <DropdownMenuRadioItem key={value} value={value}>
                    <span>{value === "ALL" ? t.all : label(value)}</span>
                    <span className="menu-count">
                      {value === "ALL" ? allCount : (counts[value] ?? 0)}
                    </span>
                  </DropdownMenuRadioItem>
                ))}
              </DropdownMenuRadioGroup>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
        <div className="search-box">
          <Search size={16} aria-hidden="true" />
          <Input
            aria-describedby={total > 20 ? "search-scope" : undefined}
            aria-label={t.search}
            placeholder={t.search}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          {search && (
            <button
              type="button"
              className="clear-search"
              aria-label={t.clearSearch}
              onClick={() => setSearch("")}
            >
              <X size={16} />
            </button>
          )}
        </div>
        {total > 20 && (
          <p id="search-scope" className="search-scope">
            {t.searchScope}
          </p>
        )}
      </div>
      <div className="desktop-filings">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>{t.title}</TableHead>
              <TableHead>{t.status}</TableHead>
              {role === "ADMIN" && <TableHead>{t.tenant}</TableHead>}
              <TableHead>{t.lastUpdated}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {(!loading ? filtered : []).map((f) => (
              <TableRow
                key={f.id}
                className="filing-row"
                onClick={() => void open(f.id)}
              >
                <TableCell>
                  <button
                    className="filing-link"
                    onClick={(e) => {
                      e.stopPropagation();
                      void open(f.id);
                    }}
                  >
                    <span>
                      <strong dir="auto">{f.title}</strong>
                      <small>
                        <bdi>CR {f.identifier_cr}</bdi>
                      </small>
                    </span>
                  </button>
                </TableCell>
                <TableCell>{pill(f.status)}</TableCell>
                {role === "ADMIN" && (
                  <TableCell>
                    <bdi>{f.tenant_name}</bdi>
                  </TableCell>
                )}
                <TableCell className="date-cell">
                  <bdi>{date(f.updated_at)}</bdi>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
      <ul className="mobile-filings">
        {(!loading ? filtered : []).map((f) => (
          <li key={f.id}>
            <button className="filing-card" onClick={() => void open(f.id)}>
              <strong dir="auto">{f.title}</strong>
              {pill(f.status)}
              {role === "ADMIN" && (
                <span className="card-tenant">
                  <bdi>{f.tenant_name}</bdi>
                </span>
              )}
              <span className="card-meta">
                <bdi>CR {f.identifier_cr}</bdi>
                <span>
                  {t.lastUpdated}: <bdi>{date(f.updated_at)}</bdi>
                </span>
              </span>
            </button>
          </li>
        ))}
      </ul>
      {(loading || !filtered.length) && (
        <div className="empty">
          <Files size={32} />
          <h3>{loading ? t.loading : search ? t.noMatches : t.empty}</h3>
          <p>{!loading && (search ? t.adjustSearch : t.emptyText)}</p>
        </div>
      )}
      {total > 20 && (
        <div className="pagination">
          <span>
            {t.page} {page} {t.of} {Math.max(1, Math.ceil(total / 20))} ·{" "}
            {total} {t.results}
          </span>
          <div>
            <Button
              variant="ghost"
              size="sm"
              disabled={page === 1 || loading}
              onClick={() => {
                changePage(page - 1);
              }}
            >
              {t.previous}
            </Button>
            <Button
              variant="ghost"
              size="sm"
              disabled={page * 20 >= total || loading}
              onClick={() => {
                changePage(page + 1);
              }}
            >
              {t.nextPage}
            </Button>
          </div>
        </div>
      )}
    </section>
  );
}
