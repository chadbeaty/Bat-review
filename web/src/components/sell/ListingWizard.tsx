"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { listModels, saveModel, type ActionResult } from "@/app/sell/actions";
import { STEPS, stepIndex, type StepKey } from "@/lib/sell/listing";
import type { FeeRule } from "@/lib/fees";
import type { ListingSnapshot, ProductSummary, SellCategory, SellManufacturer } from "@/lib/sell/server";
import { ErrorBanner, FieldError, StepActions, StepHeader, WizardContext, inputClass, useWizard, type Wizard } from "./ui";
import type { ImportPlan } from "@/lib/import/plan";
import { PostImport } from "./PostImport";
import { DetailsStep, DisclosuresStep, PhotosStep, PreviewStep, PriceStep, PublishStep, ShippingStep } from "./steps";

const EARLY: StepKey[] = ["category", "manufacturer", "model"];

/** Keeps the address bar on the current draft and step, so a reload or a shared link resumes in place. */
function syncUrl(basePath: string, listingId: string | null, step: StepKey) {
  const params = new URLSearchParams();
  if (listingId && basePath === "/sell/new") params.set("listing", listingId);
  params.set("step", step);
  window.history.replaceState(null, "", `${basePath}?${params}`);
  window.scrollTo({ top: 0 });
}

/**
 * The 10-step listing flow. Steps 1–3 choose what is being sold; the draft is created when the model is
 * chosen, and every later step saves to it, so the seller can leave and resume from the dashboard.
 */
export function ListingWizard(props: {
  userId: string;
  categories: SellCategory[];
  manufacturers: SellManufacturer[];
  fee: FeeRule | null;
  initial: ListingSnapshot | null;
  initialStep: StepKey;
  basePath: string;
}) {
  const [snapshot, setSnapshot] = useState<ListingSnapshot | null>(props.initial);
  const [step, setStep] = useState<StepKey>(props.initial || EARLY.includes(props.initialStep) ? props.initialStep : "category");
  const [pending, setPending] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [errorStep, setErrorStep] = useState<StepKey | null>(null);
  const [imported, setImported] = useState<ImportPlan | null>(null);
  const [choice, setChoice] = useState({
    categoryId: props.initial?.category.id ?? "",
    manufacturerId: props.initial?.manufacturer?.id ?? "",
  });

  const status = snapshot?.listing.listing_status ?? "draft";
  const published = status !== "draft";

  const goTo = useCallback(
    (key: StepKey) => {
      setErrors({});
      setError(null);
      setErrorStep(null);
      setStep(key);
      syncUrl(props.basePath, snapshot?.listing.id ?? null, key);
    },
    [snapshot?.listing.id, props.basePath]
  );

  const run = useCallback(
    async (action: () => Promise<ActionResult>, then?: StepKey) => {
      setPending(true);
      setErrors({});
      setError(null);
      setErrorStep(null);
      let r: ActionResult;
      try {
        r = await action();
      } catch {
        r = { ok: false, error: "We couldn't reach the server. Check your connection and try again." };
      }
      setPending(false);
      if (r.ok) {
        setSnapshot(r.snapshot);
        if (then) {
          setStep(then);
          syncUrl(props.basePath, r.listingId, then);
        }
      } else {
        setErrors(r.fieldErrors ?? {});
        setError(r.error ?? (r.fieldErrors ? "Check the highlighted fields." : null));
        setErrorStep(r.step ?? null);
      }
      return r;
    },
    [props.basePath]
  );

  const wizard: Wizard = {
    userId: props.userId,
    categories: props.categories,
    manufacturers: props.manufacturers,
    fee: props.fee,
    snapshot,
    setSnapshot,
    goTo,
    next: (from) => STEPS[Math.min(stepIndex(from) + 1, STEPS.length - 1)].key,
    pending,
    errors,
    error,
    errorStep,
    clearErrors: () => {
      setErrors({});
      setError(null);
    },
    setError,
    run,
    published,
    imported,
    setImported,
  };

  const current = stepIndex(step);
  const reachable = (key: StepKey) => {
    if (EARLY.includes(key)) return !published;
    return Boolean(snapshot);
  };

  return (
    <WizardContext.Provider value={wizard}>
      <div className="grid gap-6">
        <nav aria-label="Listing steps" className="-mx-1 overflow-x-auto">
          <ol className="flex min-w-max gap-1 px-1 pb-1 text-sm">
            {STEPS.map((s, i) => {
              const active = s.key === step;
              const can = reachable(s.key) && !pending;
              return (
                <li key={s.key}>
                  <button
                    type="button"
                    onClick={() => can && goTo(s.key)}
                    disabled={!can}
                    aria-current={active ? "step" : undefined}
                    className={`rounded-sm border px-3 py-1.5 ${active ? "border-ink bg-ink text-surface" : can ? "border-line-strong hover:border-ink" : "border-line text-ink-soft opacity-60"}`}
                  >
                    <span className="font-mono">{i + 1}</span> {s.label}
                  </button>
                </li>
              );
            })}
          </ol>
        </nav>
        <p className="sr-only" aria-live="polite">
          Step {current + 1} of {STEPS.length}: {STEPS[current].label}
        </p>
        {snapshot && (
          <p className="text-sm text-ink-soft">
            {published
              ? "This listing is live. Changes are saved straight to it."
              : "Your draft saves at every step. You can leave and resume it any time from Your listings."}
          </p>
        )}

        <div className="card grid gap-6 p-4 sm:p-6">
          {step === "category" && <CategoryStep choice={choice} setChoice={setChoice} />}
          {step === "manufacturer" && <ManufacturerStep choice={choice} setChoice={setChoice} />}
          {step === "model" && <ModelStep choice={choice} />}
          {snapshot && step === "details" && <DetailsStep />}
          {snapshot && step === "photos" && <PhotosStep />}
          {snapshot && step === "price" && <PriceStep />}
          {snapshot && step === "shipping" && <ShippingStep />}
          {snapshot && step === "disclosures" && <DisclosuresStep />}
          {snapshot && step === "preview" && <PreviewStep />}
          {snapshot && step === "publish" && <PublishStep />}
        </div>
      </div>
    </WizardContext.Provider>
  );
}

type Choice = { categoryId: string; manufacturerId: string };

function CategoryStep({ choice, setChoice }: { choice: Choice; setChoice: (c: Choice) => void }) {
  const w = useWizard();
  const [selected, setSelected] = useState(choice.categoryId);
  const [err, setErr] = useState<string>();
  return (
    <div className="grid gap-6">
      <PostImport setChoice={setChoice} />
      <form
        className="grid gap-5"
        onSubmit={(e) => {
          e.preventDefault();
          if (!selected) return setErr("Choose a category");
          setChoice({ categoryId: selected, manufacturerId: selected === choice.categoryId ? choice.manufacturerId : "" });
          w.goTo("manufacturer");
        }}
      >
        <StepHeader title="What are you selling?" />
        <fieldset className="grid gap-2" aria-describedby={err ? "e-category" : undefined}>
          <legend className="sr-only">Category</legend>
          <div className="grid gap-2 sm:grid-cols-2">
            {w.categories.map((c) => (
              <label
                key={c.id}
                className={`grid cursor-pointer gap-0.5 rounded-md border p-3 ${selected === c.id ? "border-ink bg-paper" : "border-line-strong hover:border-ink"}`}
              >
                <span className="flex items-center gap-2 font-semibold">
                  <input type="radio" name="category" value={c.id} checked={selected === c.id} onChange={() => setSelected(c.id)} />
                  {c.name}
                </span>
                {c.description && <span className="pl-6 text-sm text-ink-soft">{c.description}</span>}
              </label>
            ))}
          </div>
          <FieldError id="e-category" message={err} />
        </fieldset>
        <StepActions label="Continue" />
      </form>
    </div>
  );
}

function ManufacturerStep({ choice, setChoice }: { choice: Choice; setChoice: (c: Choice) => void }) {
  const w = useWizard();
  const [selected, setSelected] = useState(choice.manufacturerId);
  const [filter, setFilter] = useState("");
  const [err, setErr] = useState<string>();
  const shown = w.manufacturers.filter((m) => m.name.toLowerCase().includes(filter.trim().toLowerCase()) || m.id === selected);
  return (
    <form
      className="grid gap-5"
      onSubmit={(e) => {
        e.preventDefault();
        if (!selected) return setErr("Choose a brand");
        setChoice({ ...choice, manufacturerId: selected });
        w.goTo("model");
      }}
    >
      <StepHeader title="Who made it?" intro="Pick the brand printed on the item. Choose Other if it isn't listed." />
      <label className="field" htmlFor="brand-filter">
        <span>Find a brand</span>
        <input id="brand-filter" className="input" value={filter} onChange={(e) => setFilter(e.target.value)} autoComplete="off" />
      </label>
      <fieldset className="grid gap-2" aria-describedby={err ? "e-brand" : undefined}>
        <legend className="sr-only">Brand</legend>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 md:grid-cols-4">
          {shown.map((m) => (
            <label
              key={m.id}
              className={`flex cursor-pointer items-center gap-2 rounded-md border px-3 py-2 ${selected === m.id ? "border-ink bg-paper" : "border-line-strong hover:border-ink"}`}
            >
              <input type="radio" name="manufacturer" value={m.id} checked={selected === m.id} onChange={() => setSelected(m.id)} />
              {m.name}
            </label>
          ))}
        </div>
        <FieldError id="e-brand" message={err} />
      </fieldset>
      <StepActions back="category" label="Continue" />
    </form>
  );
}

function ModelStep({ choice }: { choice: Choice }) {
  const w = useWizard();
  const category = w.categories.find((c) => c.id === choice.categoryId);
  const brand = w.manufacturers.find((m) => m.id === choice.manufacturerId);
  const [models, setModels] = useState<ProductSummary[] | null>(null);
  const [query, setQuery] = useState("");
  const existing = w.snapshot;
  const [selected, setSelected] = useState<string>(existing?.product?.id ?? "");
  const [notListed, setNotListed] = useState(Boolean(existing && !existing.product && existing.submission));
  const [request, setRequest] = useState({
    modelName: existing?.submission?.modelName ?? "",
    modelYear: existing?.submission?.modelYear ? String(existing.submission.modelYear) : "",
    manufacturerName: "",
  });

  useEffect(() => {
    if (!choice.categoryId || !choice.manufacturerId) return;
    let live = true;
    listModels(choice.categoryId, choice.manufacturerId).then((m) => {
      if (!live) return;
      setModels(m);
      if (m.length === 0) setNotListed(true);
    });
    return () => {
      live = false;
    };
  }, [choice.categoryId, choice.manufacturerId]);

  const shown = useMemo(() => {
    const words = query.toLowerCase().split(/\s+/).filter(Boolean);
    return (models ?? []).filter((m) => words.every((t) => `${m.name} ${m.certifications.join(" ")} ${m.modelYear ?? ""}`.toLowerCase().includes(t)));
  }, [models, query]);

  if (!category || !brand) {
    return (
      <div className="grid gap-4">
        <StepHeader title="Choose a category and brand first" />
        <button type="button" className="btn btn-outline justify-self-start" onClick={() => w.goTo("category")}>
          Go to step 1
        </button>
      </div>
    );
  }

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const year = request.modelYear.trim() ? Number(request.modelYear) : null;
    w.run(
      () =>
        saveModel(existing?.listing.id ?? null, {
          categoryId: category.id,
          manufacturerId: brand.id,
          productId: notListed ? null : selected || null,
          request: notListed
            ? { modelName: request.modelName, modelYear: Number.isFinite(year) ? year : null, manufacturerName: brand.slug === "other" ? request.manufacturerName : undefined }
            : null,
        }),
      "details"
    );
  };

  return (
    <form className="grid gap-5" onSubmit={submit}>
      <StepHeader title={`Which ${brand.slug === "other" ? "" : brand.name + " "}model?`} intro={`${category.name} · ${brand.name}`} />
      <ErrorBanner />
      {!notListed && (
        <>
          <label className="field" htmlFor="model-search">
            <span>Search models</span>
            <input
              id="model-search"
              type="search"
              className="input"
              placeholder="Name, year or stamp"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              autoComplete="off"
            />
          </label>
          {models == null ? (
            <p className="text-sm text-ink-soft" role="status">
              Loading models…
            </p>
          ) : (
            <fieldset className="grid gap-2" aria-describedby={w.errors.productId ? "e-productId" : undefined}>
              <legend className="sr-only">Model</legend>
              {shown.length === 0 && <p className="text-sm text-ink-soft">No catalog models match that search.</p>}
              <ul className="grid max-h-[26rem] gap-1 overflow-y-auto">
                {shown.map((m) => (
                  <li key={m.id}>
                    <label
                      className={`flex cursor-pointer items-start gap-2 rounded-md border px-3 py-2 ${selected === m.id ? "border-ink bg-paper" : "border-line hover:border-ink"}`}
                    >
                      <input type="radio" name="product" className="mt-1" value={m.id} checked={selected === m.id} onChange={() => setSelected(m.id)} />
                      <span className="grid">
                        <span className="font-medium">{m.name}</span>
                        <span className="text-sm text-ink-soft">
                          {[m.certifications.join(" / "), m.listedWeights.length ? `${m.listedWeights.join(", ")} oz` : null].filter(Boolean).join(" · ")}
                        </span>
                      </span>
                    </label>
                  </li>
                ))}
              </ul>
              <FieldError id="e-productId" message={w.errors.productId} />
            </fieldset>
          )}
          <button type="button" className="justify-self-start text-sm font-semibold underline" onClick={() => setNotListed(true)}>
            My model isn&apos;t listed
          </button>
        </>
      )}
      {notListed && (
        <div className="grid gap-4">
          <p className="rounded-md border border-line bg-paper p-3 text-sm">
            Tell us the model and keep going. We&apos;ll send a request to add it to the catalog, and you can track it under Catalog
            requests in your account.
          </p>
          {brand.slug === "other" && (
            <label className="field" htmlFor="req-brand">
              <span>Brand name</span>
              <input
                id="req-brand"
                className={inputClass(w.errors["request.manufacturerName"])}
                value={request.manufacturerName}
                onChange={(e) => setRequest({ ...request, manufacturerName: e.target.value })}
              />
              <FieldError id="e-req-brand" message={w.errors["request.manufacturerName"]} />
            </label>
          )}
          <label className="field" htmlFor="req-model">
            <span>Model name</span>
            <input
              id="req-model"
              className={inputClass(w.errors["request.modelName"])}
              value={request.modelName}
              placeholder="For example Freak Black Maxload"
              aria-invalid={Boolean(w.errors["request.modelName"])}
              aria-describedby={w.errors["request.modelName"] ? "e-req-model" : undefined}
              onChange={(e) => setRequest({ ...request, modelName: e.target.value })}
            />
            <FieldError id="e-req-model" message={w.errors["request.modelName"]} />
          </label>
          <label className="field" htmlFor="req-year">
            <span>
              Model year <span className="font-normal text-ink-soft">(optional)</span>
            </span>
            <input
              id="req-year"
              inputMode="numeric"
              className={inputClass(w.errors["request.modelYear"])}
              value={request.modelYear}
              onChange={(e) => setRequest({ ...request, modelYear: e.target.value.replace(/\D/g, "").slice(0, 4) })}
            />
            <FieldError id="e-req-year" message={w.errors["request.modelYear"]} />
          </label>
          {models && models.length > 0 && (
            <button type="button" className="justify-self-start text-sm font-semibold underline" onClick={() => setNotListed(false)}>
              Back to the catalog list
            </button>
          )}
        </div>
      )}
      <StepActions back="manufacturer" disabled={!notListed && !selected} />
    </form>
  );
}
