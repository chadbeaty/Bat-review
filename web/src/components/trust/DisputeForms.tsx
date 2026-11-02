"use client";

import { useActionState, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { StatefulForm, type FormState } from "./StatefulForm";
import { openDispute, postDisputeMessage } from "@/app/disputes/actions";
import { DISPUTE_TYPES, EVIDENCE_MAX_BYTES, EVIDENCE_MAX_FILES, EVIDENCE_TYPES } from "@/lib/trust/disputes";

/** Opens a case. Photos go straight from the browser to the private evidence bucket, then the case is created. */
export function DisputeForm({ orderId, userId, disputeId }: { orderId: string; userId: string; disputeId: string }) {
  const [files, setFiles] = useState<File[]>([]);
  const [evidence, setEvidence] = useState("[]");
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);

  const [state, run, pending] = useActionState<FormState, FormData>(openDispute, null);

  async function upload(chosen: File[]) {
    setUploadError(null);
    if (chosen.length > EVIDENCE_MAX_FILES) return setUploadError(`Attach up to ${EVIDENCE_MAX_FILES} files.`);
    for (const f of chosen) {
      if (!EVIDENCE_TYPES.includes(f.type)) return setUploadError("Photos must be JPEG, PNG or WebP, or a PDF.");
      if (f.size > EVIDENCE_MAX_BYTES) return setUploadError("Each file can be up to 8 MB.");
    }
    const supabase = createClient();
    if (!supabase) return setUploadError("Uploads aren't available right now.");
    setUploading(true);
    const paths: string[] = [];
    for (const [i, f] of chosen.entries()) {
      const ext = f.type === "application/pdf" ? "pdf" : f.type.split("/")[1];
      const path = `${userId}/${disputeId}/${i + 1}-${Date.now()}.${ext}`;
      const { error } = await supabase.storage.from("dispute-evidence").upload(path, f, { contentType: f.type, upsert: false });
      if (error) {
        setUploading(false);
        setEvidence("[]");
        return setUploadError("A file could not be uploaded. Try again.");
      }
      paths.push(path);
    }
    setUploading(false);
    setFiles(chosen);
    setEvidence(JSON.stringify(paths));
  }

  return (
    <form action={run} className="grid gap-4" aria-label="Open a case">
      <input type="hidden" name="orderId" value={orderId} />
      <input type="hidden" name="disputeId" value={disputeId} />
      <input type="hidden" name="evidence" value={evidence} />
      <label className="field" htmlFor="dispute-type">
        <span>What went wrong?</span>
        <select id="dispute-type" name="type" className="input" required defaultValue="">
          <option value="" disabled>
            Choose one
          </option>
          {Object.entries(DISPUTE_TYPES).map(([value, label]) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </select>
      </label>
      <label className="field" htmlFor="dispute-description">
        <span>Describe what happened</span>
        <textarea id="dispute-description" name="description" rows={5} minLength={10} maxLength={5000} required className="input" />
      </label>
      <label className="field" htmlFor="dispute-evidence">
        <span>
          Photos <span className="font-normal text-ink-soft">(optional, up to {EVIDENCE_MAX_FILES}; JPEG, PNG, WebP or PDF)</span>
        </span>
        <input
          id="dispute-evidence"
          type="file"
          accept={EVIDENCE_TYPES.join(",")}
          multiple
          className="input"
          onChange={(e) => void upload(Array.from(e.target.files ?? []))}
        />
      </label>
      {uploading && <p role="status">Uploading…</p>}
      {!uploading && files.length > 0 && !uploadError && (
        <p role="status" className="text-sm text-success">
          {files.length} {files.length === 1 ? "file" : "files"} attached.
        </p>
      )}
      {uploadError && (
        <p role="alert" className="text-danger">
          {uploadError}
        </p>
      )}
      {state?.error && (
        <p role="alert" className="text-danger">
          {state.error}
        </p>
      )}
      <button type="submit" className="btn btn-primary justify-self-start" disabled={pending || uploading}>
        {pending ? "Opening…" : "Open case"}
      </button>
    </form>
  );
}

export function DisputeReply({ disputeId }: { disputeId: string }) {
  return (
    <StatefulForm action={postDisputeMessage} label="Reply on this case">
      <input type="hidden" name="disputeId" value={disputeId} />
      <label className="field" htmlFor="dispute-reply">
        <span>Add a message</span>
        <textarea id="dispute-reply" name="body" rows={3} maxLength={4000} required className="input" />
      </label>
      <button type="submit" className="btn btn-outline justify-self-start">
        Send
      </button>
    </StatefulForm>
  );
}
