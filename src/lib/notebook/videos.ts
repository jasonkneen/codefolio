export type NotebookVideo = { src: string; name: string; caption: string };
export const VIDEO_INPUT_BYTES = 12 * 1024 * 1024;
export function isVideoSource(src: string): boolean {
  return /^data:video\/(?:mp4|webm|ogg);base64,[A-Za-z0-9+/]+={0,2}$/.test(src);
}
export async function prepareVideo(file: File): Promise<NotebookVideo> {
  if (file.size > VIDEO_INPUT_BYTES) throw Error("Choose a video smaller than 12 MB.");
  const bytes = new Uint8Array(await file.slice(0, 32).arrayBuffer());
  const ascii = (a: number, b: number) => String.fromCharCode(...bytes.slice(a, b));
  const mime = ascii(4, 8) === 'ftyp' && !['avif', 'avis', 'heic', 'heix', 'mif1'].includes(ascii(8, 12)) ? 'video/mp4'
    : bytes[0] === 0x1a && bytes[1] === 0x45 && bytes[2] === 0xdf && bytes[3] === 0xa3 ? 'video/webm'
    : ascii(0, 4) === 'OggS' ? 'video/ogg' : null;
  if (!mime) throw Error("Choose an MP4, WebM or Ogg video.");
  const src = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(Error("This video could not be read."));
    reader.readAsDataURL(new Blob([file], { type: mime }));
  });
  return { src, name: file.name.slice(0, 500), caption: '' };
}
