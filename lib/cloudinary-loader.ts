import type { ImageLoaderProps } from "next/image";

const UPLOAD = "/image/upload/";

/**
 * next/image loader for Cloudinary images (project posters). Cloudinary resizes and picks the format
 * itself, so the browser loads straight from its CDN — nothing is proxied through our server, so
 * there's no upstream timeout to hit. Client-only (a loader is a function prop).
 */
export function cloudinaryLoader({ src, width, quality }: ImageLoaderProps) {
  const at = src.indexOf(UPLOAD);
  if (at < 0) return src;
  const transform = `w_${width},c_limit,f_auto,q_${quality ?? "auto"}`;
  return `${src.slice(0, at + UPLOAD.length)}${transform}/${src.slice(at + UPLOAD.length)}`;
}

export const isCloudinaryImage = (src: string) => src.startsWith("https://res.cloudinary.com/") && src.includes(UPLOAD);
