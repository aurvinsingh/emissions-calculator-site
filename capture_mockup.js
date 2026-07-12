/*
CAPTURE A LOGIC-FREE DESIGN MOCKUP
Purpose: produce a single mockup.html you can upload to claude.ai and iterate
the LOOK of the calculator without any of the 1,500 lines of logic.

How to use:
1. Open index.html in Chrome, unlock with your access code, and set up the
   screen the way you want it captured (e.g. Workspace tab with a fuel row).
2. Open DevTools (Cmd+Option+J) → Console tab.
3. Paste this whole file's contents and press Enter.
4. A file "mockup.html" downloads. Upload THAT to claude.ai and iterate the
   design there. When you're happy, give the final version to Claude in
   VS Code as the design spec.
*/
(async () => {
  const doc = document.cloneNode(true);
  // strip all scripts — mockup is look-only
  doc.querySelectorAll('script').forEach(s => s.remove());
  // strip the lock screen so the mockup opens on the app itself
  const lock = doc.getElementById('lock');
  if (lock) lock.remove();
  doc.body.classList.remove('locked');
  // inline the stylesheet so the mockup is one self-contained file
  for (const link of doc.querySelectorAll('link[rel="stylesheet"]')) {
    try {
      const css = await (await fetch(link.href)).text();
      const style = doc.createElement('style');
      style.textContent = css;
      link.replaceWith(style);
    } catch (e) { /* keep link if fetch fails */ }
  }
  const html = '<!DOCTYPE html>\n' + doc.documentElement.outerHTML;
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([html], { type: 'text/html' }));
  a.download = 'mockup.html';
  a.click();
  console.log('mockup.html downloaded — upload it to claude.ai');
})();
