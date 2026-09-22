import { useEffect, useId, useRef, useState } from "react";
import * as Dialog from "@radix-ui/react-dialog";
import { ImagePlus, Maximize2, Upload, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { imageUrl, prepareImage, type NotebookImage } from "@/lib/notebook/images";

export function ImageCell({ image, onChange }: { image?: NotebookImage; onChange: (image: NotebookImage) => void }) {
  const [editing, setEditing] = useState(!image);
  const [address, setAddress] = useState("");
  const [error, setError] = useState("");
  const [failed, setFailed] = useState(false);
  const [busy, setBusy] = useState(false);
  const request = useRef(0);
  const input = useRef<HTMLInputElement>(null);
  const id = useId();
  useEffect(() => () => { request.current++; }, []);
  useEffect(() => { setFailed(false); }, [image?.src]);
  const upload = async (file?: File) => {
    if (!file) return;
    const run = ++request.current;
    setBusy(true); setError("");
    try {
      const next = await prepareImage(file);
      if (run !== request.current) return;
      onChange(next); setEditing(false);
    } catch (error) { if (run === request.current) setError(error instanceof Error ? error.message : "Image upload failed."); }
    finally { if (run === request.current) setBusy(false); }
  };
  return <div className="folio-image-cell nodrag nopan nowheel" aria-busy={busy}>
    {image && <figure>
      {failed ? <p className="folio-image-failure" role="status">This image could not load. Check its address or replace it.</p> : <img src={image.src} alt={image.alt} width={image.width} height={image.height} loading="lazy" decoding="async" referrerPolicy="no-referrer" onError={() => setFailed(true)} />}
      {image.caption && <figcaption>{image.caption}</figcaption>}
      <div className="folio-image-tools">
        <Button size="sm" variant="ghost" onClick={() => setEditing(!editing)}>{editing ? "Done" : "Edit image"}</Button>
        {!failed && <Dialog.Root>
          <Dialog.Trigger asChild><Button size="sm" variant="ghost"><Maximize2 />View image</Button></Dialog.Trigger>
          <Dialog.Portal>
            <Dialog.Overlay className="folio-image-scrim" />
            <Dialog.Content className="folio-image-lightbox">
              <Dialog.Title className="sr-only">{image.alt || "Image preview"}</Dialog.Title>
              <Dialog.Description className="sr-only">{image.caption || "Larger image preview"}</Dialog.Description>
              <Dialog.Close asChild><Button variant="outline" aria-label="Close image preview"><X />Close</Button></Dialog.Close>
              <img src={image.src} alt={image.alt} referrerPolicy="no-referrer" />
              {image.caption && <p>{image.caption}</p>}
            </Dialog.Content>
          </Dialog.Portal>
        </Dialog.Root>}
      </div>
    </figure>}
    {editing && <div className="folio-image-editor">
      {!image && <div className="folio-image-intro"><ImagePlus /><h3>Add an image</h3></div>}
      <Button variant="outline" disabled={busy} onClick={() => input.current?.click()}><Upload />{busy ? "Preparing image…" : image ? "Replace image" : "Choose image"}</Button>
      <input ref={input} aria-label="Upload image" type="file" accept="image/png,image/jpeg,image/webp,image/gif,image/avif" className="sr-only" tabIndex={-1} onChange={(e) => { const file = e.target.files?.[0]; e.target.value = ""; void upload(file); }} />
      <form onSubmit={(e) => {
        e.preventDefault();
        try {
          const src = imageUrl(address);
          request.current++; setBusy(false); setError("");
          onChange({ src, alt: image?.alt || "", caption: image?.caption || "" });
          setAddress(""); setEditing(false);
        } catch { setError("Enter a complete http:// or https:// image URL without a password."); }
      }}>
        <label htmlFor={`${id}-url`}>Or use an image URL</label>
        <div className="folio-image-url"><input id={`${id}-url`} type="url" value={address} placeholder="https://example.com/image.jpg" onChange={(e) => setAddress(e.target.value)} required /><Button type="submit" variant="outline" disabled={busy}>Use URL</Button></div>
      </form>
      <p className="folio-image-hint">Uploads stay in this desk. Large images resize to still images up to 1800 px. Linked images need an internet connection.</p>
      {image && <>
        <label htmlFor={`${id}-alt`}>Image description <small>For screen readers</small></label>
        <input id={`${id}-alt`} value={image.alt} maxLength={2000} onChange={(e) => onChange({ ...image, alt: e.target.value })} />
        <label htmlFor={`${id}-caption`}>Caption</label>
        <input id={`${id}-caption`} value={image.caption} maxLength={2000} onChange={(e) => onChange({ ...image, caption: e.target.value })} />
      </>}
    </div>}
    {error && <p className="folio-image-failure" role="alert">{error}</p>}
  </div>;
}
