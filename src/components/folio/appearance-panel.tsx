import { useEffect, useState, type CSSProperties } from "react";
import * as Dialog from "@radix-ui/react-dialog";
import { Check, Palette, X } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { APPEARANCE_KEY, FONT_PAIRS, PALETTES, normalizeAppearance, useAppearance } from "@/lib/notebook/appearance";

export function AppearanceSync() {
  useEffect(() => {
    const apply = () => {
      const state = useAppearance.getState();
      const theme = PALETTES.find((p) => p.id === state.palette)!;
      const font = FONT_PAIRS.find((p) => p.id === state.font)!;
      const root = document.documentElement;
      for (const [name, value] of Object.entries(theme.colors)) root.style.setProperty(name, value);
      root.style.setProperty("--font-display", font.display);
      root.style.setProperty("--font-sans", font.body);
      root.style.colorScheme = theme.mode;
      root.dataset.palette = theme.id;
      root.dataset.font = font.id;
      document.querySelector('meta[name="theme-color"]')?.setAttribute("content", theme.colors["--color-desk"]);
    };
    try { useAppearance.setState(normalizeAppearance(JSON.parse(localStorage.getItem(APPEARANCE_KEY) || "null"))); } catch { /* defaults */ }
    apply();
    let warned = false;
    const unsub = useAppearance.subscribe((state) => {
      apply();
      try { localStorage.setItem(APPEARANCE_KEY, JSON.stringify({ palette: state.palette, font: state.font })); }
      catch { if (!warned) toast.error("Appearance changed for this visit. Browser storage is unavailable."); warned = true; }
    });
    const onStorage = (event: StorageEvent) => {
      if (event.key !== APPEARANCE_KEY) return;
      try { useAppearance.setState(normalizeAppearance(JSON.parse(event.newValue || "null"))); } catch { /* ignore malformed external changes */ }
    };
    window.addEventListener("storage", onStorage);
    return () => { unsub(); window.removeEventListener("storage", onStorage); };
  }, []);
  return null;
}

export function AppearancePanel() {
  const [open, setOpen] = useState(false);
  const { palette, font, setAppearance } = useAppearance();
  return (
    <Dialog.Root open={open} onOpenChange={setOpen}>
      <Dialog.Trigger asChild>
        <Button variant="desk" size="icon" className="size-10" aria-label="Appearance" title="Colors and fonts"><Palette /></Button>
      </Dialog.Trigger>
      <Dialog.Portal>
        <Dialog.Overlay className="folio-appearance-scrim" />
        <Dialog.Content className="folio-appearance">
          <header className="folio-appearance-head">
            <div><Dialog.Title>Make it yours</Dialog.Title><Dialog.Description>Colors and typography for your desk.</Dialog.Description></div>
            <Dialog.Close asChild><Button variant="ghost" size="icon" aria-label="Close appearance"><X /></Button></Dialog.Close>
          </header>
          <div className="folio-appearance-body">
            <h3>Palette</h3>
            <div className="folio-palette-grid" role="group" aria-label="Color palette">
              {PALETTES.map((p) => <button type="button" className="folio-palette" key={p.id} aria-pressed={palette === p.id} onClick={() => setAppearance({ palette: p.id })}>
                <span className="folio-palette-preview" style={p.colors as CSSProperties} aria-hidden="true"><span>Aa <i /></span></span>
                <span className="folio-palette-label">{p.name}{palette === p.id && <Check aria-hidden="true" />}</span>
                <small>{p.id === "original" ? "Original" : p.mode === "dark" ? "Dark" : "Light"}</small>
              </button>)}
            </div>
            <h3>Typography</h3>
            <div className="folio-font-list" role="group" aria-label="Font pairing">
              {FONT_PAIRS.map((f) => <button type="button" key={f.id} aria-pressed={font === f.id} onClick={() => setAppearance({ font: f.id })}>
                <span style={{ fontFamily: f.display }}>{f.name}</span><small>{f.note}</small>{font === f.id && <Check aria-hidden="true" />}
              </button>)}
            </div>
            <p className="folio-appearance-note">Applied immediately. Your choice stays in this browser.</p>
            <Button variant="outline" onClick={() => setAppearance({ palette: "original", font: "original" })}>Restore original look</Button>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
