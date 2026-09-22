import { createRootRoute, HeadContent, Outlet, Scripts } from "@tanstack/react-router";
import { FolioCanvas } from "@/components/canvas/folio-canvas";
import appCss from "../styles.css?url";

const APP_NAME = "Codefolio";

export const Route = createRootRoute({
  head: () => ({
    meta: [
      { charSet: "utf-8" },
      { name: "viewport", content: "width=device-width, initial-scale=1" },
      { title: APP_NAME },
      { name: "theme-color", content: "#141311" },
      {
        name: "description",
        content:
          "Codefolio — executable JavaScript notebooks on a canvas. Notes, code, and results in one document.",
      },
    ],
    links: [
      { rel: "icon", type: "image/svg+xml", href: "/favicon.svg" },
      { rel: "stylesheet", href: appCss },
      { rel: "preconnect", href: "https://fonts.googleapis.com" },
      { rel: "preconnect", href: "https://fonts.gstatic.com", crossOrigin: "anonymous" },
      {
        rel: "stylesheet",
        href: "https://fonts.googleapis.com/css2?family=Figtree:ital,wght@0,400;0,500;0,600;1,400&family=IBM+Plex+Mono:ital,wght@0,400;0,500;1,400&family=Newsreader:ital,opsz,wght@0,6..72,500;1,6..72,500&display=swap",
      },
    ],
  }),
  component: () => (
    <html lang="en" className="antialiased" suppressHydrationWarning>
      <head>
        <HeadContent />
      </head>
      <body>
        <main className="folio-app">
          <FolioCanvas />
        </main>
        <Outlet />
        <Scripts />
      </body>
    </html>
  ),
});
