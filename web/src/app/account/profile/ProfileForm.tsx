"use client";

import { useActionState, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { AVATAR_TYPES, MAX_AVATAR_BYTES, photoProblem } from "@/lib/sell/listing";
import type { FormState } from "@/lib/validation/auth";
import { resizeImage } from "@/components/sell/resize-image";
import { removeAvatar, saveAvatar, saveProfile } from "./actions";

type Values = { username: string; displayName: string; bio: string; city: string; state: string; postalCode: string };

const FIELDS: { name: keyof Values; label: string; hint?: string; optional?: boolean; autoComplete?: string; multiline?: boolean; maxLength: number }[] = [
  { name: "username", label: "Username", hint: "3–24 letters, numbers or underscores. Shown on your listings.", autoComplete: "username", maxLength: 24 },
  { name: "displayName", label: "Display name", optional: true, autoComplete: "name", maxLength: 60 },
  { name: "bio", label: "Bio", optional: true, multiline: true, maxLength: 1000, hint: "A line or two about you: where you play, what you collect." },
  { name: "city", label: "City", optional: true, autoComplete: "address-level2", maxLength: 80 },
  { name: "state", label: "State", optional: true, hint: "2-letter code, for example TN.", autoComplete: "address-level1", maxLength: 2 },
  { name: "postalCode", label: "ZIP code", optional: true, hint: "Private. Used as the default ship-from ZIP for new listings.", autoComplete: "postal-code", maxLength: 10 },
];

export function ProfileForm({ userId, initial, photoUrl }: { userId: string; initial: Values; photoUrl: string | null }) {
  const [state, action, pending] = useActionState<FormState, FormData>(saveProfile, { values: initial });
  const values = { ...initial, ...state.values } as Values;
  const [photo, setPhoto] = useState(photoUrl);
  const [photoMsg, setPhotoMsg] = useState<{ error?: string; ok?: string }>({});
  const [uploading, setUploading] = useState(false);
  const input = useRef<HTMLInputElement>(null);

  async function upload(file: File | undefined) {
    if (!file) return;
    setPhotoMsg({});
    const problem = photoProblem(file, { types: AVATAR_TYPES, maxBytes: 10 * 1024 * 1024 });
    if (problem) return setPhotoMsg({ error: problem });
    const supabase = createClient();
    if (!supabase) return setPhotoMsg({ error: "Photo uploads aren't available right now." });
    setUploading(true);
    try {
      const { blob, type, ext } = await resizeImage(file, 512, 0.85);
      if (blob.size > MAX_AVATAR_BYTES) throw new Error("Use a photo up to 2 MB.");
      const path = `${userId}/avatar-${crypto.randomUUID().replace(/-/g, "")}.${ext}`;
      const { error } = await supabase.storage.from("avatars").upload(path, blob, { contentType: type, upsert: false });
      if (error) throw new Error("Upload failed. Try again.");
      const r = await saveAvatar(path);
      if (!r.ok) throw new Error(r.error);
      setPhoto(r.url ?? null);
      setPhotoMsg({ ok: "Photo updated." });
    } catch (e) {
      setPhotoMsg({ error: e instanceof Error ? e.message : "Upload failed. Try again." });
    } finally {
      setUploading(false);
      if (input.current) input.current.value = "";
    }
  }

  return (
    <div className="grid gap-6">
      <section className="card grid gap-3 p-5" aria-labelledby="photo-heading">
        <h2 id="photo-heading" className="font-semibold">
          Profile photo
        </h2>
        <div className="flex flex-wrap items-center gap-4">
          <div className="h-20 w-20 overflow-hidden rounded-full border border-line bg-paper">
            {photo ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={photo} alt="Your profile photo" className="h-full w-full object-cover" />
            ) : (
              <div className="grid h-full place-items-center text-2xl font-bold text-ink-soft" aria-hidden>
                {values.username.charAt(0).toUpperCase()}
              </div>
            )}
          </div>
          <div className="flex flex-wrap gap-2">
            <label htmlFor="avatar-input" className="btn btn-outline cursor-pointer">
              {uploading ? "Uploading…" : photo ? "Change photo" : "Add photo"}
            </label>
            <input
              ref={input}
              id="avatar-input"
              type="file"
              accept={AVATAR_TYPES.join(",")}
              className="sr-only"
              disabled={uploading}
              onChange={(e) => upload(e.target.files?.[0])}
            />
            {photo && (
              <button
                type="button"
                className="btn btn-outline"
                disabled={uploading}
                onClick={async () => {
                  const r = await removeAvatar();
                  if (r.ok) setPhoto(null);
                  setPhotoMsg(r.ok ? { ok: "Photo removed." } : { error: r.error });
                }}
              >
                Remove
              </button>
            )}
          </div>
        </div>
        <p className="text-sm text-ink-soft">JPG, PNG or WEBP. It&apos;s cropped to a circle and resized in your browser.</p>
        {photoMsg.error && (
          <p role="alert" className="text-sm text-danger">
            {photoMsg.error}
          </p>
        )}
        {photoMsg.ok && (
          <p role="status" className="text-sm text-success">
            {photoMsg.ok}
          </p>
        )}
      </section>

      <form action={action} className="card grid gap-4 p-5" noValidate>
        {state.error && (
          <p role="alert" className="rounded-md border border-danger/30 bg-danger/5 px-3 py-2 text-sm text-danger">
            {state.error}
          </p>
        )}
        {state.message && (
          <p role="status" className="rounded-md border border-success/30 bg-success/5 px-3 py-2 text-sm text-success">
            {state.message}
          </p>
        )}
        {FIELDS.map((f) => {
          const err = state.fieldErrors?.[f.name];
          const props = {
            id: `p-${f.name}`,
            name: f.name,
            defaultValue: values[f.name],
            maxLength: f.maxLength,
            autoComplete: f.autoComplete,
            "aria-invalid": Boolean(err),
            "aria-describedby": err ? `e-${f.name}` : f.hint ? `h-${f.name}` : undefined,
            className: `input ${err ? "border-danger" : ""}`,
          };
          return (
            <label key={`${f.name}-${values[f.name]}`} className="field" htmlFor={props.id}>
              <span>
                {f.label}
                {f.optional && <span className="font-normal text-ink-soft"> (optional)</span>}
              </span>
              {f.multiline ? <textarea rows={3} {...props} /> : <input {...props} />}
              {f.hint && !err && (
                <span id={`h-${f.name}`} className="text-sm font-normal text-ink-soft">
                  {f.hint}
                </span>
              )}
              {err && (
                <span id={`e-${f.name}`} className="text-sm font-normal text-danger">
                  {err}
                </span>
              )}
            </label>
          );
        })}
        <button type="submit" className="btn btn-primary justify-self-start" disabled={pending}>
          {pending ? "Saving…" : "Save profile"}
        </button>
      </form>
    </div>
  );
}
