import * as tus from "tus-js-client";
import { supabase, FILES_BUCKET } from "./supabaseClient.js";

/**
 * Why this file exists
 * ---------------------
 * Supabase's plain `supabase.storage.from(bucket).upload()` sends the whole
 * file in ONE HTTP request. That's fine for small product photos (how
 * 4 HAUS uses it) but for anything in the tens/hundreds of MB it's fragile:
 * the request can hit the platform's request-size limit, a flaky connection
 * kills the whole upload with no way to resume, and large files can freeze
 * the browser tab while it's held in memory as one blob.
 *
 * Supabase Storage also exposes a **resumable upload endpoint that speaks
 * the TUS protocol** (https://tus.io). It chunks the file, uploads piece by
 * piece, and can resume from where it left off if the connection drops.
 * That's what this function uses — it's the fix for "ไฟล์ใหญ่อัปโหลดไม่ได้".
 *
 * Bucket-side requirement: in Supabase Studio → Storage → (bucket) →
 * "File size limit", raise it from the default (50MB on most plans) to
 * whatever ceiling you want (e.g. 500MB). See supabase/migrations/README
 * for the exact dashboard steps — this can't be set via SQL.
 */

const CHUNK_SIZE = 6 * 1024 * 1024; // 6MB — required chunk size for Supabase's TUS endpoint

/**
 * Upload a File/Blob to Supabase Storage with resumable chunked upload.
 *
 * @param {File} file
 * @param {string} objectPath - path inside the bucket, e.g. "projects/23-34027-128/BOQ.xlsx"
 * @param {(percent: number) => void} [onProgress]
 * @returns {Promise<{ path: string }>}
 */
export async function uploadFileResumable(file, objectPath, onProgress) {
  const { data: sessionData } = await supabase.auth.getSession();
  const accessToken = sessionData.session?.access_token;
  if (!accessToken) throw new Error("ต้องเข้าสู่ระบบก่อนอัปโหลดไฟล์");

  const projectUrl = import.meta.env.VITE_SUPABASE_URL;
  const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

  return new Promise((resolve, reject) => {
    const upload = new tus.Upload(file, {
      endpoint: `${projectUrl}/storage/v1/upload/resumable`,
      retryDelays: [0, 3000, 5000, 10000, 20000],
      chunkSize: CHUNK_SIZE,
      headers: {
        authorization: `Bearer ${accessToken}`,
        apikey: anonKey,
        "x-upsert": "true",
      },
      uploadDataDuringCreation: true,
      removeFingerprintOnSuccess: true,
      metadata: {
        bucketName: FILES_BUCKET,
        objectName: objectPath,
        contentType: file.type || "application/octet-stream",
        cacheControl: "3600",
      },
      onError: (error) => reject(error),
      onProgress: (bytesUploaded, bytesTotal) => {
        if (onProgress) onProgress(Math.round((bytesUploaded / bytesTotal) * 100));
      },
      onSuccess: () => resolve({ path: objectPath }),
    });

    // Resume an interrupted upload of the same file instead of starting over.
    upload.findPreviousUploads().then((previousUploads) => {
      if (previousUploads.length > 0) {
        upload.resumeFromPreviousUpload(previousUploads[0]);
      }
      upload.start();
    });
  });
}

export function getPublicFileUrl(objectPath) {
  const { data } = supabase.storage.from(FILES_BUCKET).getPublicUrl(objectPath);
  return data.publicUrl;
}

export async function deleteFile(objectPath) {
  const { error } = await supabase.storage.from(FILES_BUCKET).remove([objectPath]);
  if (error) throw error;
}
