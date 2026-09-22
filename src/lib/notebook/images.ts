import { isImageSource } from "./output-safety";

export const IMAGE_INPUT_BYTES = 12 * 1024 * 1024;
export const IMAGE_STORED_BYTES = 1024 * 1024;
export const IMAGE_EDGE = 1800;
export type NotebookImage = { src: string; alt: string; caption: string; width?: number; height?: number };

export function isPersistentImageSource(src: string): boolean {
  return isImageSource(src) && !src.startsWith("blob:");
}
export function imageUrl(value: string): string {
  const src = value.trim();
  const url = new URL(src);
  if (url.protocol !== "https:" && url.protocol !== "http:") throw new Error("Use an https:// or http:// image address.");
  if (url.username || url.password) throw new Error("Image addresses cannot contain passwords.");
  return url.href;
}
export function rasterFormat(bytes: Uint8Array): string | null {
  const ascii = (start: number, end: number) => String.fromCharCode(...bytes.slice(start, end));
  if (bytes[0] === 0x89 && ascii(1, 4) === "PNG" && bytes[4] === 13 && bytes[5] === 10) return "png";
  if (bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return "jpeg";
  if (["GIF87a", "GIF89a"].includes(ascii(0, 6))) return "gif";
  if (ascii(0, 4) === "RIFF" && ascii(8, 12) === "WEBP") return "webp";
  if (ascii(4, 8) === "ftyp" && ["avif", "avis"].includes(ascii(8, 12))) return "avif";
  return null;
}
function dataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(new Error("This image could not be read."));
    reader.readAsDataURL(blob);
  });
}
export async function prepareImage(file: File): Promise<NotebookImage> {
  if (file.size > IMAGE_INPUT_BYTES) throw new Error("Choose an image smaller than 12 MB.");
  const format = rasterFormat(new Uint8Array(await file.slice(0, 16).arrayBuffer()));
  if (!format) throw new Error("Choose a PNG, JPEG, WebP, GIF or AVIF image. SVG and documents are not supported.");
  const bitmap = await createImageBitmap(file).catch(() => { throw new Error("This image could not be decoded. Try another file."); });
  try {
    if (bitmap.width * bitmap.height > 40_000_000) throw new Error("Choose an image below 40 megapixels.");
    const alt = file.name.replace(/\.[^.]+$/, "").replace(/[-_]+/g, " ").slice(0, 500);
    // Keep small originals, including animation and transparency.
    if (file.size <= IMAGE_STORED_BYTES && Math.max(bitmap.width, bitmap.height) <= IMAGE_EDGE) {
      return { src: await dataUrl(new Blob([file], { type: `image/${format}` })), alt, caption: "", width: bitmap.width, height: bitmap.height };
    }
    if (format === "gif") throw new Error("Animated GIFs must be under 1 MB and 1800 pixels. Use an image URL for larger animations.");
    let scale = Math.min(1, IMAGE_EDGE / Math.max(bitmap.width, bitmap.height));
    const canvas = document.createElement("canvas");
    for (let attempt = 0; attempt < 4; attempt++) {
      canvas.width = Math.max(1, Math.round(bitmap.width * scale));
      canvas.height = Math.max(1, Math.round(bitmap.height * scale));
      const context = canvas.getContext("2d");
      if (!context) throw new Error("Image processing is unavailable in this browser.");
      context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
      const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/webp", .86 - attempt * .1));
      if (blob && blob.size <= IMAGE_STORED_BYTES) return { src: await dataUrl(blob), alt, caption: "", width: canvas.width, height: canvas.height };
      scale *= .75;
    }
    throw new Error("This image is too detailed to store. Use a smaller image or an image URL.");
  } finally { bitmap.close(); }
}
