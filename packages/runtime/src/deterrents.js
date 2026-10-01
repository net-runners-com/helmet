// Client-side deterrents: block copy/context-menu/drag, swallow DevTools and
// view-source shortcuts, and wipe the decoded page if a debugger attaches.
// None of these stop a determined viewer; they raise the cost of casual copying.

export function installDeterrents({ contextMenu = true, shortcuts = true, devtools = true, onWipe } = {}) {
  if (contextMenu) {
    for (const t of ["contextmenu", "copy", "cut", "dragstart", "selectstart"]) {
      document.addEventListener(t, (e) => e.preventDefault());
    }
  }
  if (shortcuts) {
    document.addEventListener("keydown", (e) => {
      const k = e.key.toLowerCase();
      const mod = e.metaKey || e.ctrlKey;
      if (
        k === "f12" ||
        (mod && e.shiftKey && ["i", "j", "c"].includes(k)) ||
        (e.metaKey && e.altKey && ["i", "j", "c", "u"].includes(k)) ||
        (mod && ["u", "s", "p"].includes(k))
      ) {
        e.preventDefault();
        e.stopPropagation();
      }
    }, true);
  }
  if (devtools) {
    let wiped = false;
    const wipe = () => {
      if (wiped) return;
      wiped = true;
      for (const node of [...document.childNodes]) if (node !== document.documentElement) node.remove();
      document.head.replaceChildren();
      const note = document.createElement("p");
      note.textContent = "Viewing stopped.";
      note.style.cssText = "margin:40vh 0;text-align:center;color:#fff;font:600 18px sans-serif";
      document.body.replaceChildren(note);
      document.documentElement.removeAttribute("class");
      document.documentElement.style.background = "#111";
      onWipe?.();
    };
    setInterval(() => {
      const t = performance.now();
      // eslint-disable-next-line no-debugger
      debugger;
      if (performance.now() - t > 100) wipe();
    }, 500);
  }
}
