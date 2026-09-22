import { Button } from "@/components/ui/button";
import { useFolioUi } from "@/lib/notebook/ui";

export function ConfirmHost() {
  const spec = useFolioUi((s) => s.confirm);
  const close = useFolioUi((s) => s.closeConfirm);

  if (!spec) return null;

  const confirm = () => {
    spec.onConfirm();
    close();
  };

  return (
    <div className="folio-modal-scrim" onClick={close}>
      <div
        className="folio-modal"
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="folio-confirm-title"
        aria-describedby="folio-confirm-body"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 id="folio-confirm-title">{spec.title}</h2>
        <p id="folio-confirm-body">{spec.body}</p>
        <div className="folio-modal-actions">
          <Button type="button" variant="ghost" onClick={close} autoFocus={Boolean(spec.danger)}>
            Cancel
          </Button>
          <Button type="button" variant={spec.danger ? "dangerSolid" : "default"} onClick={confirm} autoFocus={!spec.danger}>
            {spec.confirmLabel ?? "Confirm"}
          </Button>
        </div>
      </div>
    </div>
  );
}
