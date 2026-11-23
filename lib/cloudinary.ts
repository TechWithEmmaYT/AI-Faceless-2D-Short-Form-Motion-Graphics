import "server-only";

import { v2 as cloudinary } from "cloudinary";

/**
 * Cloudinary hosts every voiceover, sound and music file (re-hosted from Fish Audio or uploaded by
 * Claude Code). Everything for a project lives under motionstudio/<userId>/<projectId>/<kind>/, and
 * every server-side check verifies that prefix, so one user's key can never touch another's files.
 * Audio is a "video" resource in Cloudinary's model.
 */

export type AssetKind = "voice" | "sound" | "music";

const SIGNATURE_TTL_S = 60 * 60; // Cloudinary accepts a signed timestamp for one hour

/** A Cloudinary problem whose message is written for the agent (safe to show as-is). */
export class CloudinaryError extends Error {}

export class CloudinaryNotConfiguredError extends CloudinaryError {
  constructor() {
    super("Cloudinary isn't configured on this MotionStudio server (CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY, CLOUDINARY_API_SECRET). Tell the user to add them to the environment.");
  }
}

/** The SDK rejects with a plain object ({ error: { message, http_code } }), not an Error. */
function cloudinaryFailure(error: unknown, doing: string): CloudinaryError {
  const detail =
    (error as { error?: { message?: string } })?.error?.message ?? (error instanceof Error ? error.message : String(error));
  return new CloudinaryError(`Cloudinary couldn't ${doing}: ${detail.split("\n")[0]!.slice(0, 240)}`);
}

function config() {
  const cloudName = process.env.CLOUDINARY_CLOUD_NAME;
  const apiKey = process.env.CLOUDINARY_API_KEY;
  const apiSecret = process.env.CLOUDINARY_API_SECRET;
  if (!cloudName || !apiKey || !apiSecret) throw new CloudinaryNotConfiguredError();
  cloudinary.config({ cloud_name: cloudName, api_key: apiKey, api_secret: apiSecret, secure: true });
  return { cloudName, apiKey, apiSecret };
}

export function assetFolder(userId: string, projectId: string, kind: AssetKind) {
  return `motionstudio/${userId}/${projectId}/${kind}`;
}

/** True when a public id is inside this user's project folder for that kind. */
export function ownsPublicId(publicId: string, userId: string, projectId: string, kind: AssetKind) {
  return publicId.startsWith(`${assetFolder(userId, projectId, kind)}/`) && !publicId.includes("..");
}

/**
 * A signed, single-file upload: valid for one hour, only for this folder and this file name.
 * The API secret never leaves the server; the signature can't be reused for another path.
 */
export function signedUpload(folder: string, name: string) {
  const { cloudName, apiKey, apiSecret } = config();
  const timestamp = Math.floor(Date.now() / 1000);
  const params = { folder, public_id: name, timestamp, overwrite: "true" as const };
  const signature = cloudinary.utils.api_sign_request(params, apiSecret);
  return {
    url: `https://api.cloudinary.com/v1_1/${cloudName}/video/upload`,
    fields: { ...params, api_key: apiKey, signature },
    publicId: `${folder}/${name}`,
    expiresAt: new Date((timestamp + SIGNATURE_TTL_S) * 1000).toISOString(),
  };
}

export type AudioAsset = { publicId: string; url: string; durationSec: number; bytes: number; format: string };

/** Reads an uploaded file's facts from Cloudinary (it measures the duration itself). */
export async function getAudioAsset(publicId: string): Promise<AudioAsset | null> {
  config();
  try {
    const r = await cloudinary.api.resource(publicId, { resource_type: "video" });
    return { publicId: r.public_id, url: r.secure_url, durationSec: Number(r.duration ?? 0), bytes: Number(r.bytes ?? 0), format: String(r.format ?? "") };
  } catch (error) {
    const status = (error as { error?: { http_code?: number } })?.error?.http_code;
    if (status === 404) return null;
    throw cloudinaryFailure(error, `read "${publicId}"`);
  }
}

/** Has Cloudinary fetch a public https URL (e.g. a Fish Audio clip) into the project's folder. */
export async function uploadFromUrl(url: string, folder: string, name: string): Promise<AudioAsset> {
  config();
  const r = await cloudinary.uploader
    .upload(url, { resource_type: "video", folder, public_id: name, overwrite: true })
    .catch((error: unknown) => {
      throw cloudinaryFailure(error, "copy that URL (check it's a public link straight to an audio file)");
    });
  return { publicId: r.public_id, url: r.secure_url, durationSec: Number(r.duration ?? 0), bytes: Number(r.bytes ?? 0), format: String(r.format ?? "") };
}

/**
 * Stores a project's poster (a JPEG still from the studio) at motionstudio/<userId>/<projectId>/poster/poster,
 * replacing the previous one. The returned URL carries Cloudinary's version, so caches see the new image.
 */
export async function uploadPoster(jpeg: Uint8Array, userId: string, projectId: string): Promise<string> {
  config();
  const dataUri = `data:image/jpeg;base64,${Buffer.from(jpeg).toString("base64")}`;
  const r = await cloudinary.uploader
    .upload(dataUri, {
      resource_type: "image",
      folder: `motionstudio/${userId}/${projectId}/poster`,
      public_id: "poster",
      overwrite: true,
      invalidate: true,
    })
    .catch((error: unknown) => {
      throw cloudinaryFailure(error, "store the poster");
    });
  return r.secure_url;
}
