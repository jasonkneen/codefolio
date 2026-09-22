import type { ErrorComponentProps } from "@tanstack/react-router";

export function AppErrorComponent({ error }: ErrorComponentProps) {
  return (
    <main className="folio-crash">
      <p className="folio-help-kicker">Codefolio</p>
      <h1>Something went wrong</h1>
      <p>{error.message || "An unexpected error occurred. Try reloading the page."}</p>
    </main>
  );
}
