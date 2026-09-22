import { useSaveStatus } from "@/lib/notebook/persistence";
import { AppearancePanel } from "@/components/folio/appearance-panel";
import { useEffect, useRef, useState } from "react";
import { CircleHelp, Download, FileCode2, FilePlus2, FolderOpen, MoreHorizontal, PanelTop, RotateCcw, Upload } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { MAX_DESK_BYTES } from "@/lib/notebook/output-safety";
import { downloadDesk, parseFolioExport, serializeDesk } from "@/lib/notebook/io";
import { useFolioStore } from "@/lib/notebook/store";
import { useFolioUi } from "@/lib/notebook/ui";
import { ProjectPreview } from "./project-preview";

export function FolioChrome() {
  const saveMessage = useSaveStatus((s) => s.message);
  const addNotebook = useFolioStore((s) => s.addNotebook);
  const addSourceFiles = useFolioStore((s) => s.addSourceFiles);
  const nodes = useFolioStore((s) => s.nodes);
  const edges = useFolioStore((s) => s.edges);
  const replaceDesk = useFolioStore((s) => s.replaceDesk);
  const resetToStarters = useFolioStore((s) => s.resetToStarters);
  const openHelp = useFolioUi((s) => s.openHelp);
  const ask = useFolioUi((s) => s.ask);
  const [menuOpen, setMenuOpen] = useState(false);
  const [previewOpen, setPreviewOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const sourceRef = useRef<HTMLInputElement>(null);
  const folderRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!menuOpen) return;
    const onDoc = (event: MouseEvent) => {
      if (!menuRef.current?.contains(event.target as Node)) setMenuOpen(false);
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setMenuOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    window.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDoc);
      window.removeEventListener("keydown", onKey);
    };
  }, [menuOpen]);

  const onExport = () => {
    downloadDesk(serializeDesk(nodes, edges));
    setMenuOpen(false);
    toast("Desk exported");
  };

  const onImportFile = async (file: File | undefined) => {
    if (!file) return;
    if (file.size > MAX_DESK_BYTES) {
      toast.error("This desk is too large. Choose a file smaller than 64 MB.");
      return;
    }
    try {
      const parsed = parseFolioExport(JSON.parse(await file.text()));
      if (!parsed) {
        toast.error("That file isn’t a Codefolio desk.");
        return;
      }
      ask({
        title: "Import desk",
        body: "Replace the current desk? Export it first to keep a copy. Imported code runs only when you choose Run; review code from other people before running it.",
        confirmLabel: "Import",
        onConfirm: () => {
          replaceDesk(parsed.nodes, parsed.edges);
          toast(parsed.nodes.length === 1 ? "Imported 1 notebook" : `Imported ${parsed.nodes.length} notebooks`);
        },
      });
    } catch {
      toast.error("Couldn’t read that file.");
    }
  };

  const onSourceFiles = async (selected: FileList | null) => {
    if (!selected?.length) return;
    const files = [...selected].filter(file => /\.(?:[cm]?[jt]sx?)$/i.test(file.name) && !file.webkitRelativePath.split("/").some(part => part === "node_modules" || part === ".git"));
    if (!files.length) { toast.error("No JavaScript or TypeScript files were found."); return; }
    if (files.length > 100) { toast.error("Choose at most 100 source files at a time."); return; }
    const relative = files.map(file => file.webkitRelativePath || file.name);
    const first = relative[0]?.split("/")[0];
    const stripRoot = first && relative.every(path => path.startsWith(`${first}/`));
    try {
      const entries = await Promise.all(files.map(async (file, index) => {
        if (file.size > 200_000) throw Error(`${file.name} exceeds the source size limit.`);
        return { path: stripRoot ? relative[index].slice(first.length + 1) : relative[index], source: await file.text() };
      }));
      const added = addSourceFiles(entries);
      toast(added ? `Added ${added} source ${added === 1 ? "notebook" : "notebooks"}` : "Source notebooks updated");
    } catch (error) { toast.error(error instanceof Error ? error.message : "Couldn’t import the source files."); }
  };

  return (
    <header className="folio-chrome">
      <div className="folio-brand">
        <span className="folio-mark" aria-hidden />
        <div>
          <div className="folio-brand-row">
            <h1>Codefolio</h1>
            <span className="folio-beta">Beta</span>
          </div>
        </div>
      </div>
      <div className="folio-chrome-actions">
        <AppearancePanel />
        {nodes.some(node => node.data.sourcePath) && <Button type="button" variant="desk" onClick={() => setPreviewOpen(true)}><PanelTop />Canvas preview</Button>}
        <Button type="button" onClick={() => addNotebook()}>
          <FilePlus2 />
          <span className="folio-new-full">New notebook</span>
          <span className="folio-new-short">New</span>
        </Button>
        <Button type="button" variant="desk" size="icon" className="size-10" onClick={openHelp} aria-label="Help" title="Help (?)">
          <CircleHelp />
        </Button>
        <div className="folio-menu-wrap" ref={menuRef}>
          <Button
            type="button"
            variant="desk"
            size="icon"
            className="size-10"
            aria-label="Desk menu"
            aria-expanded={menuOpen}
            onClick={() => setMenuOpen((v) => !v)}
          >
            <MoreHorizontal />
          </Button>
          {menuOpen ? (
            <div className="folio-menu" role="menu">
              <p className="folio-menu-save" role="status">{saveMessage}</p>
              <button type="button" role="menuitem" onClick={onExport}>
                <Download />
                Export desk
              </button>
              <button type="button" role="menuitem" onClick={() => { setMenuOpen(false); sourceRef.current?.click(); }}>
                <FileCode2 />
                Import source files
              </button>
              <button type="button" role="menuitem" onClick={() => { setMenuOpen(false); folderRef.current?.click(); }}>
                <FolderOpen />
                Import source folder
              </button>
              <button
                type="button"
                role="menuitem"
                onClick={() => {
                  setMenuOpen(false);
                  fileRef.current?.click();
                }}
              >
                <Upload />
                Import desk
              </button>
              <button
                type="button"
                role="menuitem"
                onClick={() => {
                  setMenuOpen(false);
                  ask({
                    title: "Restore starter pages",
                    body: "Replace this desk with the original notebooks? Export first if you want a copy.",
                    confirmLabel: "Restore",
                    danger: true,
                    onConfirm: () => {
                      resetToStarters();
                      toast("Starter pages restored");
                    },
                  });
                }}
              >
                <RotateCcw />
                Restore starters
              </button>
            </div>
          ) : null}
        </div>
        <input
          ref={sourceRef}
          type="file"
          accept=".js,.jsx,.ts,.tsx,.mjs,.cjs"
          multiple
          className="sr-only"
          aria-hidden
          tabIndex={-1}
          onChange={(e) => { const files = e.target.files; void onSourceFiles(files); e.target.value = ""; }}
        />
        <input
          ref={folderRef}
          type="file"
          {...{ webkitdirectory: "" }}
          className="sr-only"
          aria-hidden
          tabIndex={-1}
          onChange={(e) => { const files = e.target.files; void onSourceFiles(files); e.target.value = ""; }}
        />
        <input
          ref={fileRef}
          type="file"
          accept="application/json,.json"
          className="sr-only"
          aria-hidden
          tabIndex={-1}
          onChange={(e) => {
            const file = e.target.files?.[0];
            e.target.value = "";
            void onImportFile(file);
          }}
        />
      </div>
      {previewOpen && <ProjectPreview onClose={() => setPreviewOpen(false)} />}
    </header>
  );
}
