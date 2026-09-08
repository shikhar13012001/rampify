/**
 * STUB — no backend exists for this yet. This implements the client-side
 * shape (presign → upload → create job → poll) so ExportModal can already
 * program against it, but three Vercel API routes still need to be built
 * before it actually runs, following the pattern in
 * api/create-checkout-session.ts (auth via Firebase ID token, CORS via
 * api/_adminInit.ts's shared helpers):
 *
 *   POST /api/cloud-export/presign  { fileName }              → { uploadUrl, fileKey }
 *   POST /api/cloud-export/create   { fileKey, curve, ... }    → { jobId }
 *   GET  /api/cloud-export/status?jobId=...                   → JobStatusResponse
 *
 * `presign` would mint a short-lived presigned PUT URL against object storage
 * (S3 or an equivalent from the Vercel Marketplace) so the browser uploads
 * directly rather than proxying the file through a Vercel Function. `create`
 * kicks off the actual render (a queue + worker, or a Vercel Function with a
 * long enough duration budget) and `status` is polled until it reports a
 * downloadable result.
 *
 * Until those exist, calling start() will fail at the first fetch with a 404 —
 * that's expected and surfaces through ExportModal's existing error phase.
 */

import type { ExportEngine, ExportPhase, ExportProgressEvent, ExportRequest, ExportResult } from './ExportEngine';

const POLL_INTERVAL_MS = 3000;
const MAX_POLL_ATTEMPTS = 200; // ~10 minutes at 3s/attempt

interface PresignResponse {
  uploadUrl: string;
  fileKey: string;
}

interface CreateJobResponse {
  jobId: string;
}

interface JobStatusResponse {
  status: 'queued' | 'processing' | 'done' | 'error';
  phase?: ExportPhase;
  percent?: number;
  downloadUrl?: string;
  error?: string;
}

export class CloudAPIEngine implements ExportEngine {
  readonly kind = 'cloud-api' as const;

  private cancelled = false;

  // No local browser-memory ceiling on this path — it can take anything.
  supports(): boolean {
    return true;
  }

  async start(request: ExportRequest, onProgress: (event: ExportProgressEvent) => void): Promise<ExportResult> {
    this.cancelled = false;
    const { project, audioSettings, blurSettings, opticalFlowSettings, resolution } = request;

    onProgress({ phase: 'uploading', percent: 0 });
    const { uploadUrl, fileKey } = await this.presign(project.file.name);

    const sourceBlob = await fetch(project.file.url).then((r) => r.blob());
    await this.uploadToPresignedUrl(uploadUrl, sourceBlob, (percent) =>
      onProgress({ phase: 'uploading', percent }),
    );
    this.throwIfCancelled();

    onProgress({ phase: 'queued', percent: 0 });
    const { jobId } = await this.createJob({
      fileKey,
      duration: project.file.duration,
      segments: project.segments,
      audioSettings,
      blurSettings,
      opticalFlowSettings,
      resolution,
    });

    return this.pollUntilDone(jobId, onProgress);
  }

  cancel(): void {
    this.cancelled = true;
  }

  private throwIfCancelled(): void {
    if (this.cancelled) throw new Error('Cancelled');
  }

  private async presign(fileName: string): Promise<PresignResponse> {
    const res = await fetch('/api/cloud-export/presign', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ fileName }),
    });
    if (!res.ok) throw new Error(`Presign request failed: ${res.status}`);
    return res.json();
  }

  /** XHR rather than fetch — fetch has no upload-progress event. */
  private uploadToPresignedUrl(url: string, blob: Blob, onProgress: (percent: number) => void): Promise<void> {
    return new Promise<void>((resolve, reject) => {
      const xhr = new XMLHttpRequest();
      xhr.open('PUT', url);
      xhr.upload.onprogress = (e) => {
        if (e.lengthComputable) onProgress(Math.round((e.loaded / e.total) * 100));
      };
      xhr.onload = () => {
        if (xhr.status >= 200 && xhr.status < 300) resolve();
        else reject(new Error(`Upload failed: ${xhr.status}`));
      };
      xhr.onerror = () => reject(new Error('Upload network error'));
      xhr.send(blob);
    });
  }

  private async createJob(payload: unknown): Promise<CreateJobResponse> {
    const res = await fetch('/api/cloud-export/create', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    if (!res.ok) throw new Error(`Job creation failed: ${res.status}`);
    return res.json();
  }

  private async pollUntilDone(
    jobId: string,
    onProgress: (event: ExportProgressEvent) => void,
  ): Promise<ExportResult> {
    for (let attempt = 0; attempt < MAX_POLL_ATTEMPTS; attempt++) {
      this.throwIfCancelled();
      await sleep(POLL_INTERVAL_MS);

      const res = await fetch(`/api/cloud-export/status?jobId=${encodeURIComponent(jobId)}`);
      if (!res.ok) throw new Error(`Status check failed: ${res.status}`);
      const status: JobStatusResponse = await res.json();

      if (status.status === 'error') throw new Error(status.error ?? 'Cloud export failed');
      if (status.status === 'done' && status.downloadUrl) {
        onProgress({ phase: 'rendering', percent: 100 });
        return { url: status.downloadUrl };
      }
      onProgress({ phase: status.phase ?? 'rendering', percent: status.percent ?? 0 });
    }
    throw new Error('Cloud export timed out');
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
