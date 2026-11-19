"use client";
import { useEffect, useState, type ReactNode } from "react";
import { Check, ShieldCheck, LockKeyhole, ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { api, ApiError, type Actor } from "@/lib/api";
import { copy, labels } from "@/lib/copy";
import { remainingSeconds } from "@/lib/retry-after";
export function LoginScreen({
  lang,
  language,
  onSignedIn,
  message,
}: {
  lang: "en" | "ar";
  language: ReactNode;
  message?: string;
  onSignedIn: (actor: Actor) => void;
}) {
  const t = copy[lang];
  const label = (key: string) => labels[key]?.[lang === "ar" ? 1 : 0] ?? key;
  const [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const [retryUntil, setRetryUntil] = useState(0);
  const [waitSeconds, setWaitSeconds] = useState(0);
  useEffect(() => {
    if (!retryUntil) return;
    const update = () => {
      const seconds = remainingSeconds(retryUntil);
      setWaitSeconds(seconds);
      if (!seconds) setRetryUntil(0);
    };
    update();
    const timer = setInterval(update, 1000);
    return () => clearInterval(timer);
  }, [retryUntil]);
  return (
    <div className="login">
      <section className="login-story">
        <div className="brand">
          <span className="brand-symbol">ق</span>
          <span>
            {t.brand}
            <small>{t.tag}</small>
          </span>
        </div>
        <div className="story-main">
          <span className="eyebrow">{t.activity}</span>
          <h1>{t.hero}</h1>
          <p>{t.intro}</p>
          <div className="story-flow">
            {["DRAFT", "UNDER_REVIEW", "APPROVED"].map((s, i) => (
              <div key={s}>
                <span>{i === 2 ? <Check size={22} /> : i + 1}</span>
                {label(s)}
              </div>
            ))}
          </div>
        </div>
        <div className="story-footer">
          <ShieldCheck size={18} />
          {t.secure}
        </div>
      </section>
      <section className="login-panel">
        <div className="language-corner">{language}</div>
        <div className="login-box">
          <span className="mini-icon">
            <LockKeyhole size={24} />
          </span>
          <h2>{t.welcome}</h2>
          <p>{t.signin}</p>
          <form
            onSubmit={async (e) => {
              e.preventDefault();
              if (busy || remainingSeconds(retryUntil) > 0) return;
              setBusy(true);
              setError("");
              const data = new FormData(e.currentTarget);
              try {
                onSignedIn(
                  await api<Actor>("/auth/login", {
                    method: "POST",
                    body: JSON.stringify(Object.fromEntries(data)),
                  }),
                );
              } catch (e) {
                if (e instanceof ApiError && e.status === 429) {
                  const seconds = Math.max(1, e.retryAfterSeconds ?? 60);
                  setWaitSeconds(seconds);
                  setRetryUntil(Date.now() + seconds * 1000);
                  setError("");
                  return;
                }
                setError(
                  !(e instanceof ApiError && e.status === 401)
                    ? t.error
                    : lang === "ar"
                      ? "تحققي من بيانات الدخول وحاولي مجددًا."
                      : "Check your credentials and try again.",
                );
              } finally {
                setBusy(false);
              }
            }}
          >
            <Label htmlFor="email">{t.email}</Label>
            <Input
              id="email"
              name="email"
              type="email"
              required
              autoComplete="username"
              placeholder="submitter@aram.test"
            />
            <Label htmlFor="password">{t.password}</Label>
            <Input
              id="password"
              name="password"
              type="password"
              required
              autoComplete="current-password"
            />
            {waitSeconds > 0 && (
              <div>
                <p role="alert" className="error">{t.rateLimited}</p>
                <p>{t.retryIn.replace("{seconds}", String(waitSeconds))}</p>
              </div>
            )}
            {!waitSeconds && (error || message) && (
              <p role="alert" className="error">
                {error || message}
              </p>
            )}
            <Button disabled={busy || waitSeconds > 0} className="w-full">
              {busy ? t.loading : t.login}
              <ArrowRight size={16} />
            </Button>
          </form>
          <p className="demo-note">{t.demo}</p>
        </div>
      </section>
    </div>
  );
}
