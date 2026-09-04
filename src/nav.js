(() => {
  const SLIDE_W = 1280, SLIDE_H = 720;
  let slides = [];
  let hidden = [];
  const stage = document.getElementById("stage");
  const scaler = document.getElementById("scaler");
  const prev = document.getElementById("prev");
  const next = document.getElementById("next");
  const counter = document.getElementById("counter");
  const dotWrap = document.getElementById("dots");
  const burger = document.getElementById("burger");
  const panel = document.getElementById("panel");
  const panelList = document.getElementById("panelList");
  const panelClose = document.getElementById("panelClose");
  const scrim = document.getElementById("scrim");
  let i = 0;

  // Hidden state starts from the Markdown (data-hidden) and can be flipped
  // for the current session from the panel. It is deliberately not persisted:
  // the source of truth stays in the .md.
  function readSlides() {
    slides = Array.from(scaler.querySelectorAll(".slide"));
    hidden = slides.map(s => s.dataset.hidden === "true");
  }
  const isShown = n => !hidden[n];
  const shownIndexes = () => slides.map((_, n) => n).filter(isShown);

  function fit() {
    const cs = getComputedStyle(stage);
    const availW = stage.clientWidth - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight);
    const availH = stage.clientHeight - parseFloat(cs.paddingTop) - parseFloat(cs.paddingBottom);
    const scale = Math.min(availW / SLIDE_W, availH / SLIDE_H);
    scaler.style.transform = "scale(" + scale + ")";
    scaler.style.margin =
      ((availH - SLIDE_H) / 2) + "px " + ((availW - SLIDE_W) / 2) + "px";
  }

  // ---- slide panel ------------------------------------------------------
  // Thumbnails are live clones of the real slides, scaled down. Rendering the
  // actual markup means a thumbnail can never drift from the slide it shows.
  function buildPanel() {
    panelList.innerHTML = "";
    slides.forEach((slide, n) => {
      const item = document.createElement("div");
      item.className = "thumb";
      item.dataset.index = n;

      const frame = document.createElement("div");
      frame.className = "thumb-frame";
      const inner = document.createElement("div");
      inner.className = "thumb-scale";
      const clone = slide.cloneNode(true);
      // The clone must not carry .active: it would pollute every
      // `.slide.active` query, and the panel sits before the stage in the DOM
      // so the clone would win. `.thumb-scale .slide` displays it instead.
      clone.classList.remove("active");
      clone.removeAttribute("id");
      inner.appendChild(clone);
      frame.appendChild(inner);
      frame.addEventListener("click", () => { go(n); closePanel(); });

      const meta = document.createElement("div");
      meta.className = "thumb-meta";
      const num = document.createElement("span");
      num.className = "thumb-num";
      const over = document.createElement("span");
      over.className = "thumb-over";
      over.hidden = true;
      const toggle = document.createElement("button");
      toggle.className = "thumb-toggle";
      toggle.type = "button";
      toggle.addEventListener("click", (e) => {
        e.stopPropagation();
        hidden[n] = !hidden[n];
        // Never strand the viewer on a slide just hidden, and never hide the
        // last visible slide out from under the deck.
        if (hidden[n] && shownIndexes().length === 0) { hidden[n] = false; }
        else if (hidden[n] && n === i) { const s = shownIndexes(); if (s.length) go(s[0]); }
        render();
      });

      meta.appendChild(num);
      meta.appendChild(over);
      meta.appendChild(toggle);
      item.appendChild(frame);
      item.appendChild(meta);
      panelList.appendChild(item);
    });
    sizeThumbs();
  }

  function sizeThumbs() {
    panelList.querySelectorAll(".thumb-frame").forEach(f => {
      const s = f.clientWidth / SLIDE_W;
      f.querySelector(".thumb-scale").style.transform = "scale(" + s + ")";
    });
  }

  function openPanel() { panel.classList.add("open"); scrim.classList.add("on"); sizeThumbs(); }
  function closePanel() { panel.classList.remove("open"); scrim.classList.remove("on"); }
  function togglePanel() { panel.classList.contains("open") ? closePanel() : openPanel(); }

  burger.addEventListener("click", togglePanel);
  panelClose.addEventListener("click", closePanel);
  scrim.addEventListener("click", closePanel);

  // ---- dots -------------------------------------------------------------
  function buildDots() {
    dotWrap.innerHTML = "";
    shownIndexes().forEach(n => {
      const d = document.createElement("button");
      d.className = "dot";
      d.type = "button";
      d.dataset.index = n;
      d.setAttribute("aria-label", "Go to slide " + (n + 1));
      d.addEventListener("click", () => go(n));
      dotWrap.appendChild(d);
    });
  }

  // ---- render -----------------------------------------------------------
  function render() {
    slides.forEach((s, k) => s.classList.toggle("active", k === i));

    const shown = shownIndexes();
    // Numbering counts visible slides only, so a hidden slide does not leave
    // a gap in "3 / 9". A hidden slide shows its position plus a marker.
    const pos = shown.indexOf(i);
    if (pos === -1) {
      // Show position within the full deck too, so it is obvious where you
      // landed - "hidden" alone loses all sense of place.
      counter.textContent = "hidden · " + (i + 1) + " of " + slides.length;
      counter.classList.add("hidden-mark");
    } else {
      counter.textContent = (pos + 1) + " / " + shown.length;
      counter.classList.remove("hidden-mark");
    }

    buildDots();
    Array.from(dotWrap.children).forEach(d => d.classList.toggle("on", +d.dataset.index === i));

    prev.disabled = pos <= 0 && pos !== -1;
    next.disabled = pos === shown.length - 1 && pos !== -1;
    if (pos === -1) { prev.disabled = false; next.disabled = false; }

    panelList.querySelectorAll(".thumb").forEach(t => {
      const n = +t.dataset.index;
      t.classList.toggle("current", n === i);
      t.classList.toggle("is-hidden", hidden[n]);
      t.querySelector(".thumb-num").textContent =
        hidden[n] ? "Hidden" : "Slide " + (shownIndexes().indexOf(n) + 1);
      t.querySelector(".thumb-toggle").textContent = hidden[n] ? "Show" : "Hide";
      // data-over is written by the fit pass before refresh() runs, so the
      // panel shows which slides overflow without measuring again.
      const over = slides[n] && slides[n].dataset.over;
      t.classList.toggle("is-over", !!over);
      const flag = t.querySelector(".thumb-over");
      if (over) {
        flag.textContent = over + "px over";
        flag.hidden = false;
      } else {
        flag.hidden = true;
      }
    });

    if (location.hash !== "#" + (i + 1)) history.replaceState(null, "", "#" + (i + 1));
  }

  function go(n) {
    i = Math.max(0, Math.min(slides.length - 1, n));
    render();
  }

  // Step through visible slides only; hidden ones are reachable by deep link
  // or from the panel, which is the whole point of hiding them.
  function step(dir) {
    const shown = shownIndexes();
    if (!shown.length) return;
    const pos = shown.indexOf(i);
    if (pos === -1) {
      const nextUp = dir > 0 ? shown.find(n => n > i) : [...shown].reverse().find(n => n < i);
      go(nextUp !== undefined ? nextUp : shown[dir > 0 ? 0 : shown.length - 1]);
      return;
    }
    const t = pos + dir;
    if (t >= 0 && t < shown.length) go(shown[t]);
  }

  prev.addEventListener("click", () => step(-1));
  next.addEventListener("click", () => step(1));

  document.addEventListener("keydown", (e) => {
    if (document.querySelector("dialog[open]")) return;
    if (e.key === "ArrowRight" || e.key === " " || e.key === "PageDown") { e.preventDefault(); step(1); }
    else if (e.key === "ArrowLeft" || e.key === "PageUp") { e.preventDefault(); step(-1); }
    else if (e.key === "Home") { e.preventDefault(); const s = shownIndexes(); if (s.length) go(s[0]); }
    else if (e.key === "End") { e.preventDefault(); const s = shownIndexes(); if (s.length) go(s[s.length - 1]); }
    else if (e.key === "Escape") { closePanel(); }
    else if (e.key === "s" || e.key === "S") { e.preventDefault(); togglePanel(); }
    else if (e.key === "f" || e.key === "F") {
      e.preventDefault();
      if (document.fullscreenElement) document.exitFullscreen();
      else document.documentElement.requestFullscreen?.();
    }
    else if (e.key === "t" || e.key === "T") {
      e.preventDefault();
      const root = document.documentElement;
      root.setAttribute("data-theme",
        root.getAttribute("data-theme") === "dark" ? "light" : "dark");
    }
  });

  function fromHash() {
    const n = parseInt((location.hash || "").replace("#", ""), 10);
    return Number.isFinite(n) && n > 0 ? n - 1 : 0;
  }
  // Without this listener, changing the hash on an already-loaded page does
  // nothing: deep links silently show slide 1, and a screenshot loop that
  // navigates by hash captures the same slide N times.
  window.addEventListener("hashchange", () => {
    const n = fromHash();
    if (n !== i) go(n);
  });

  window.addEventListener("resize", fit);
  document.addEventListener("fullscreenchange", fit);
  // window.resize alone is not enough: it never fires when the deck is inside
  // an iframe or app panel that is resized without the window changing, and it
  // can lag behind a live window drag. ResizeObserver watches the element's
  // own box, so it fires for every cause - panel drag, zoom, full screen.
  if (window.ResizeObserver) {
    new ResizeObserver(fit).observe(stage);
    new ResizeObserver(sizeThumbs).observe(panelList);
  }
  // Called once on mount and again after every re-render. Everything that
  // depends on the slide list is rebuilt; listeners above are attached once.
  function refresh(keepIndex) {
    readSlides();
    if (!slides.length) return;
    fitMetricValuesAfterFonts(slides);
    buildPanel();
    const target = keepIndex === undefined ? fromHash() : Math.min(keepIndex, slides.length - 1);
    go(target);
    fit();
  }

  window.quireNav = { refresh, sync: render, current: () => i, go };
  refresh();
})();
