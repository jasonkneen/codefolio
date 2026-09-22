import { Toaster } from "sonner";

export function FolioToaster() {
  return (
    <Toaster
      theme="dark"
      position="bottom-center"
      duration={2800}
      toastOptions={{ className: "folio-toast" }}
    />
  );
}
