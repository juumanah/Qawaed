"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { api, ApiError, Actor, Filing } from "@/lib/api";
import { copy } from "@/lib/copy";
import { pageForTotal } from "@/lib/pagination";
export function useWorkspace() {
  const [lang, setLang] = useState<"en" | "ar">("en");
  const t = copy[lang];
  const [actor, setActor] = useState<Actor | null>(null),
    [boot, setBoot] = useState(true),
    [items, setItems] = useState<Filing[]>([]),
    [total, setTotal] = useState(0),
    [page, setPage] = useState(1),
    [status, setStatus] = useState("ALL"),
    [counts, setCounts] = useState<Record<string, number>>({}),
    [loading, setLoading] = useState(false),
    [error, setError] = useState(""),
    [notice, setNotice] = useState(""),
    [search, setSearchValue] = useState(""),
    [query, setQuery] = useState("");
  useEffect(() => {
    const timer = setTimeout(() => setQuery(search.trim()), 300);
    return () => clearTimeout(timer);
  }, [search]);
  const [selected, setSelected] = useState<Filing | null>(null),
    [form, setForm] = useState(false),
    [editing, setEditing] = useState<Filing | undefined>(),
    [busy, setBusy] = useState(false),
    [decision, setDecision] = useState<string | null>(null),
    [reason, setReason] = useState("");
  // Ignore responses from a previous account, filter, or closed detail dialog.
  const generation = useRef(0),
    listRequest = useRef(0),
    detailRequest = useRef(0);
  const clearWorkspace = useCallback(() => {
    generation.current++;
    listRequest.current++;
    detailRequest.current++;
    setItems([]);
    setCounts({});
    setTotal(0);
    setPage(1);
    setStatus("ALL");
    setSearchValue("");
    setQuery("");
    setSelected(null);
    setForm(false);
    setEditing(undefined);
    setDecision(null);
    setReason("");
    setNotice("");
    setBusy(false);
  }, []);
  useEffect(() => {
    let active = true;
    let saved: string | null = null;
    try {
      saved = localStorage.getItem("qawaed-language");
    } catch {}
    if (saved === "ar") setLang("ar");
    api<Actor>("/auth/me")
      .then((user) => {
        if (active) {
          setStatus(user.role === "AUDITOR" ? "UNDER_REVIEW" : "ALL");
          setActor(user);
        }
      })
      .catch((e) => {
        if (active && !(e instanceof ApiError && e.status === 401))
          setError(copy[saved === "ar" ? "ar" : "en"].error);
      })
      .finally(() => {
        if (active) setBoot(false);
      });
    return () => {
      active = false;
    };
  }, []);
  useEffect(() => {
    document.documentElement.lang = lang;
    document.documentElement.dir = lang === "ar" ? "rtl" : "ltr";
    try {
      localStorage.setItem("qawaed-language", lang);
    } catch {}
  }, [lang]);
  const report = useCallback(
    (e: unknown) => {
      if (e instanceof ApiError && e.status === 401) {
        clearWorkspace();
        setActor(null);
        setError(copy[lang].session);
      } else
        setError(
          e instanceof ApiError && e.status === 403
            ? copy[lang].forbidden
            : copy[lang].error,
        );
    },
    [lang, clearWorkspace],
  );
  const load = useCallback(async () => {
    const request = ++listRequest.current,
      account = generation.current;
    setLoading(true);
    setItems([]);
    if (search.trim() !== query) return; // Wait for typing to settle.
    try {
      const [list, summary] = await Promise.all([
        api<{ items: Filing[]; total: number }>(
          `/filings?page=${page}${status === "ALL" ? "" : "&status=" + status}${query ? "&search=" + encodeURIComponent(query) : ""}`,
        ),
        api<{ status: string; count: number }[]>("/filings/summary"),
      ]);
      if (request !== listRequest.current || account !== generation.current)
        return;
      const nextPage = pageForTotal(page, list.total);
      if (nextPage !== page) {
        setPage(nextPage);
        return; // The page effect reloads the remaining results.
      }
      setItems(list.items);
      setTotal(list.total);
      setCounts(Object.fromEntries(summary.map((s) => [s.status, s.count])));
    } catch (e) {
      if (request === listRequest.current && account === generation.current)
        report(e);
    } finally {
      if (request === listRequest.current && account === generation.current)
        setLoading(false);
    }
  }, [page, status, query, search, report]);
  useEffect(() => {
    if (actor) void load();
    return () => {
      listRequest.current++;
    };
  }, [actor, load]);
  async function open(id: string) {
    const request = ++detailRequest.current,
      account = generation.current;
    setError("");
    try {
      const filing = await api<Filing>("/filings/" + id);
      if (request !== detailRequest.current || account !== generation.current)
        return;
      setSelected(filing);
      setDecision(null);
      setReason("");
    } catch (e) {
      if (request === detailRequest.current && account === generation.current)
        report(e);
    }
  }
  useEffect(() => {
    if (
      !selected ||
      !["PENDING", "PROCESSING"].includes(selected.verification?.status ?? "")
    )
      return;
    let active = true;
    const account = generation.current;
    const timer = setTimeout(async () => {
      try {
        const filing = await api<Filing>("/filings/" + selected.id);
        if (active && account === generation.current) setSelected(filing);
      } catch (e) {
        if (active && account === generation.current) report(e);
      }
    }, 1500);
    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, [selected, report]);
  async function refresh() {
    await load();
    if (selected) await open(selected.id);
  }
  async function transition(target: string) {
    if (!selected || busy) return;
    if (target === "REJECTED" && !reason.trim()) {
      setError(t.reasonRequired);
      return;
    }
    setBusy(true);
    setError("");
    try {
      await api(`/filings/${selected.id}/transitions`, {
        method: "POST",
        body: JSON.stringify({
          status: target,
          version: selected.version,
          ...(target === "REJECTED" ? { rejection_reason: reason } : {}),
        }),
      });
      setNotice(t.changed);
      setDecision(null);
      await open(selected.id);
      await load();
    } catch (e) {
      if (e instanceof ApiError && e.status === 409) {
        setDecision(null);
        await open(selected.id);
        setError(t.conflict);
        await load();
      } else report(e);
    } finally {
      setBusy(false);
    }
  }

  function chooseStatus(value: string) {
    setStatus(value);
    setPage(1);
    setSearchValue("");
    setQuery("");
  }
  function setSearch(value: string) {
    // Invalidate in-flight responses immediately, before the debounce completes.
    listRequest.current++;
    setSearchValue(value);
    setPage(1);
  }
  function onSignedIn(user: Actor) {
    clearWorkspace();
    setError("");
    setStatus(user.role === "AUDITOR" ? "UNDER_REVIEW" : "ALL");
    setActor(user);
  }
  async function logout() {
    try {
      await api("/auth/logout", { method: "POST" });
      clearWorkspace();
      setActor(null);
      setError("");
    } catch (e) {
      report(e);
    }
  }
  function closeDetail(value: Filing | null) {
    detailRequest.current++;
    setSelected(value);
  }
  function editFiling(filing: Filing) {
    detailRequest.current++;
    setSelected(null);
    setEditing(filing);
    setForm(true);
  }
  async function onSaved(filing: Filing) {
    setForm(false);
    setNotice(t.saved);
    await load();
    await open(filing.id);
  }
  function newFiling() {
    setEditing(undefined);
    setForm(true);
  }
  function changePage(value: number) {
    setPage(value);
  }
  // Sidebar navigation keeps the existing search, unlike explicit status filters.
  function navigateStatus(value: string) {
    setStatus(value);
    setPage(1);
  }
  return {
    lang,
    setLang,
    actor,
    boot,
    items,
    total,
    page,
    status,
    counts,
    loading,
    error,
    setError,
    notice,
    setNotice,
    search,
    setSearch,
    selected,
    form,
    setForm,
    editing,
    busy,
    decision,
    setDecision,
    reason,
    setReason,
    refresh,
    transition,
    open,
    chooseStatus,
    onSignedIn,
    logout,
    closeDetail,
    editFiling,
    onSaved,
    newFiling,
    changePage,
    navigateStatus,
    onUnauthorized: () => report(new ApiError(401, "Session expired")),
  };
}
export type Workspace = ReturnType<typeof useWorkspace>;
