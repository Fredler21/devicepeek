/**
 * DevicePeek agent. Runs inside the previewed page and reports JavaScript errors,
 * broken assets, and layout overflow up to DevicePeek over postMessage.
 *
 * This file is the single source of truth for the agent. The Vite plugin injects it
 * into dev HTML, the CLI serves it at /agent.js, and the app inlines it into the
 * copyable snippet in the Issues panel.
 */
(function () {
  var T = "devicepeek-agent";

  // Nothing to report to when the page is not inside a frame, so stay silent. That
  // keeps the agent harmless if it ever ships to production.
  if (window.parent === window) return;

  function s(o) {
    try {
      parent.postMessage(Object.assign({ source: T, url: location.href }, o), "*");
    } catch (e) {}
  }

  s({ type: "ready" });

  addEventListener(
    "error",
    function (e) {
      var t = e.target || {};
      if (t.tagName === "IMG" || t.tagName === "SCRIPT" || t.tagName === "LINK") {
        s({
          type: "resource",
          level: "error",
          message: (t.tagName === "IMG" ? "Broken image: " : "Failed to load: ") + (t.src || t.href || ""),
        });
      } else {
        s({ type: "js", level: "error", message: e.message, at: (e.filename || "") + ":" + (e.lineno || "") });
      }
    },
    true
  );

  addEventListener("unhandledrejection", function (e) {
    var r = e.reason;
    s({ type: "promise", level: "error", message: "Unhandled rejection: " + (r && r.message ? r.message : String(r)) });
  });

  ["error", "warn"].forEach(function (k) {
    var o = console[k];
    console[k] = function () {
      s({ type: "console", level: k === "warn" ? "warn" : "error", message: [].map.call(arguments, String).join(" ") });
      o.apply(console, arguments);
    };
  });

  function overflow() {
    var e = document.documentElement;
    if (e.scrollWidth > e.clientWidth + 2) {
      s({
        type: "layout",
        level: "warn",
        message: "Horizontal overflow: content " + e.scrollWidth + "px in a " + e.clientWidth + "px viewport",
      });
    }
  }

  addEventListener("load", overflow);
  addEventListener("resize", function () {
    clearTimeout(window.__dpof);
    window.__dpof = setTimeout(overflow, 300);
  });
})();
