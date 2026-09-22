import { FolioChrome } from "@/components/canvas/folio-chrome";

export function DeskFallback() {
  return (
    <>
      <FolioChrome />
      <div className="folio-desk-loading" role="status">Opening your desk…</div>
    </>
  );
}
