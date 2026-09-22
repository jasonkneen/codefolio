import { useLayoutEffect, useState } from "react";
import { Button } from "@/components/ui/button";

const SEEN_KEY = "folio-beta-welcome";

export function WelcomeGate() {
  const [open, setOpen] = useState(false);

  useLayoutEffect(() => {
    try {
      setOpen(window.localStorage.getItem(SEEN_KEY) !== "1");
    } catch {
      setOpen(true);
    }
  }, []);

  if (!open) return null;

  const enter = () => {
    try {
      window.localStorage.setItem(SEEN_KEY, "1");
    } catch {
      /* private mode — still let them in */
    }
    setOpen(false);
  };

  return (
    <div className="folio-welcome" role="dialog" aria-modal="true" aria-labelledby="folio-welcome-title">
      <div className="folio-welcome-card">
        <p className="folio-welcome-kicker stagger-item">Public beta</p>
        <h2 id="folio-welcome-title" className="stagger-item">
          Codefolio
        </h2>
        <p className="folio-welcome-lede stagger-item">
          Executable JavaScript notebooks on a canvas. Notes, code, and results in one document.
        </p>
        <div className="folio-welcome-cols stagger-item">
          <section>
            <h3>In this beta</h3>
            <ul>
              <li>Markdown notes and a real JS kernel</li>
              <li>Charts, HTML, and canvas from a cell</li>
              <li>The desk is saved in this browser</li>
            </ul>
          </section>
          <section>
            <h3>Not yet</h3>
            <ul>
              <li>Accounts or cloud save</li>
              <li>Sharing a desk with someone else</li>
              <li>Collaboration on a page</li>
            </ul>
          </section>
        </div>
        <p className="folio-welcome-note stagger-item">
          Export from the desk menu if you want a copy. Press ? anytime for shortcuts.
        </p>
        <div className="folio-welcome-actions stagger-item">
          <Button type="button" onClick={enter}>
            Open the desk
          </Button>
        </div>
      </div>
    </div>
  );
}
