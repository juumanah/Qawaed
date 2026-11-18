"use client";
import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { api, ApiError, Filing } from "@/lib/api";
import { copy, labels } from "@/lib/copy";
export function FilingForm({
  open,
  onClose,
  lang,
  filing,
  onSaved,
  onUnauthorized,
}: {
  open: boolean;
  onClose: () => void;
  onUnauthorized: () => void;
  lang: "en" | "ar";
  filing?: Filing;
  onSaved: (f: Filing) => Promise<void>;
}) {
  const t = copy[lang];
  const [step, setStep] = useState(0),
    [error, setError] = useState("");
  const schema = z.object({
    title: z.string().trim().min(3, t.titleRequired).max(255, t.titleRequired),
    identifier_cr: z.string().regex(/^\d{10}$/, t.crRequired),
    category: z.enum(["COMMERCIAL", "HEALTH", "TRANSPORT", "ENVIRONMENT"]),
    expiration_date: z.string().refine((v) => {
      const d = new Date(v + "T00:00:00Z");
      return (
        /^\d{4}-\d{2}-\d{2}$/.test(v) &&
        !Number.isNaN(d.valueOf()) &&
        d.toISOString().slice(0, 10) === v &&
        v >= new Date().toISOString().slice(0, 10)
      );
    }, t.dateRequired),
  });
  type Values = z.infer<typeof schema>;
  const form = useForm<Values>({
    resolver: zodResolver(schema),
    defaultValues: {
      title: "",
      identifier_cr: "",
      category: "COMMERCIAL",
      expiration_date: "",
    },
  });
  useEffect(() => {
    if (open) {
      setStep(0);
      setError("");
      form.reset(
        filing
          ? {
              title: filing.title,
              identifier_cr: filing.identifier_cr,
              category: filing.category as Values["category"],
              expiration_date: filing.expiration_date.slice(0, 10),
            }
          : {
              title: "",
              identifier_cr: "",
              category: "COMMERCIAL",
              expiration_date: "",
            },
      );
    }
  }, [open, filing, form]);
  async function save(values: Values) {
    setError("");
    try {
      const f = await api<Filing>(
        "/filings" + (filing ? "/" + filing.id : ""),
        {
          method: filing ? "PATCH" : "POST",
          body: JSON.stringify({
            ...values,
            ...(filing ? { version: filing.version } : {}),
          }),
        },
      );
      await onSaved(f);
    } catch (e) {
      if (e instanceof ApiError && e.status === 401) {
        onUnauthorized();
        return;
      }
      setError(
        e instanceof ApiError && e.status === 409 ? t.draftConflict : t.error,
      );
    }
  }
  return (
    <Dialog
      open={open}
      onOpenChange={(v) => {
        if (!v && !form.formState.isSubmitting) onClose();
      }}
    >
      <DialogContent
        closeLabel={t.close}
        dir={lang === "ar" ? "rtl" : "ltr"}
        className="form-dialog"
      >
        <DialogHeader>
          <span className="eyebrow">{t.step}</span>
          <DialogTitle>{filing ? t.edit : t.create}</DialogTitle>
          <DialogDescription>{t.reviewHint}</DialogDescription>
        </DialogHeader>
        <Form {...form}>
          <form
            onSubmit={form.handleSubmit(async (values) => {
              if (step === 0) setStep(1);
              else await save(values);
            })}
            className="filing-form"
          >
            {step === 0 ? (
              <>
                {(["title", "identifier_cr", "expiration_date"] as const).map(
                  (name) => (
                    <FormField
                      key={name}
                      control={form.control}
                      name={name}
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>
                            {name === "title"
                              ? t.title
                              : name === "identifier_cr"
                                ? t.cr
                                : t.date}
                          </FormLabel>
                          <FormControl>
                            <Input
                              {...field}
                              type={
                                name === "expiration_date" ? "date" : "text"
                              }
                              inputMode={
                                name === "identifier_cr" ? "numeric" : undefined
                              }
                              maxLength={
                                name === "title"
                                  ? 255
                                  : name === "identifier_cr"
                                    ? 10
                                    : undefined
                              }
                              min={
                                name === "expiration_date"
                                  ? new Date().toISOString().slice(0, 10)
                                  : undefined
                              }
                            />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  ),
                )}
                <FormField
                  control={form.control}
                  name="category"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>{t.category}</FormLabel>
                      <Select
                        dir={lang === "ar" ? "rtl" : "ltr"}
                        value={field.value}
                        onValueChange={field.onChange}
                      >
                        <FormControl>
                          <SelectTrigger className="w-full">
                            <SelectValue />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          {[
                            "COMMERCIAL",
                            "HEALTH",
                            "TRANSPORT",
                            "ENVIRONMENT",
                          ].map((v) => (
                            <SelectItem key={v} value={v}>
                              {labels[v][lang === "ar" ? 1 : 0]}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </>
            ) : (
              <div className="review-values">
                {Object.entries(form.getValues()).map(([k, v]) => (
                  <div key={k}>
                    <small>
                      {
                        (
                          {
                            title: t.title,
                            identifier_cr: t.cr,
                            category: t.category,
                            expiration_date: t.date,
                          } as Record<string, string>
                        )[k]
                      }
                    </small>
                    <strong>{labels[v]?.[lang === "ar" ? 1 : 0] ?? v}</strong>
                  </div>
                ))}
              </div>
            )}
            {error && (
              <p role="alert" className="error">
                {error}
              </p>
            )}
            <div className="form-actions">
              <Button
                type="button"
                variant="ghost"
                disabled={form.formState.isSubmitting}
                onClick={() => (step ? setStep(0) : onClose())}
              >
                {step ? t.back : t.cancel}
              </Button>
              {step === 0 ? (
                <Button type="submit">{t.next}</Button>
              ) : (
                <Button type="submit" disabled={form.formState.isSubmitting}>
                  {form.formState.isSubmitting ? t.working : t.save}
                </Button>
              )}
            </div>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
