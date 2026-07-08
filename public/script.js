/* ============================================================
   Live Collaborative Whiteboard — Client
   Canvas drawing, normalized-coordinate sync over Socket.IO,
   live cursors, marker tray, room handling.
   ============================================================ */

(() => {
  "use strict";

  /* -----------------------------------------------------------
     Room + identity
     ----------------------------------------------------------- */

  function getOrCreateRoom() {
    const params = new URLSearchParams(location.search);
    let room = params.get("room");
    if (!room) {
      room = Math.random().toString(36).slice(2, 8);
      params.set("room", room);
      history.replaceState(null, "", `${location.pathname}?${params.toString()}`);
    }
    return room;
  }

  const ROOM = getOrCreateRoom();
  const MY_NAME = "Guest-" + Math.floor(Math.random() * 900 + 100);
  const MY_COLOR = ["#ff6b4a", "#3b82c4", "#4caf6d", "#9b6bc9", "#f2a93b"][
    Math.floor(Math.random() * 5)
  ];

  document.getElementById("room-code").textContent = ROOM;

  /* -----------------------------------------------------------
     Canvas setup
     ----------------------------------------------------------- */

  const canvas = document.getElementById("board");
  const ctx = canvas.getContext("2d");

  /** All strokes we know about, in normalized (0-1) coordinates, so we can replay on resize. */
  let history_ = [];

  function resizeCanvas() {
    const ratio = window.devicePixelRatio || 1;
    canvas.width = window.innerWidth * ratio;
    canvas.height = window.innerHeight * ratio;
    ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
    redrawAll();
  }

  function redrawAll() {
    ctx.clearRect(0, 0, window.innerWidth, window.innerHeight);
    history_.forEach((seg) => drawSegment(seg));
  }

  function drawSegment(seg) {
    const w = window.innerWidth;
    const h = window.innerHeight;
    ctx.save();
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.lineWidth = seg.size;
    if (seg.eraser) {
      ctx.globalCompositeOperation = "destination-out";
      ctx.strokeStyle = "rgba(0,0,0,1)";
    } else {
      ctx.globalCompositeOperation = "source-over";
      ctx.strokeStyle = seg.color;
    }
    ctx.beginPath();
    ctx.moveTo(seg.x0 * w, seg.y0 * h);
    ctx.lineTo(seg.x1 * w, seg.y1 * h);
    ctx.stroke();
    ctx.restore();
  }

  window.addEventListener("resize", resizeCanvas);
  resizeCanvas();

  /* -----------------------------------------------------------
     Marker tray state
     ----------------------------------------------------------- */

  const MARKERS = [
    { name: "black",  hex: "#23262b" },
    { name: "red",    hex: "#e4483c" },
    { name: "blue",   hex: "#3b82c4" },
    { name: "green",  hex: "#4caf6d" },
    { name: "orange", hex: "#f2a93b" },
    { name: "purple", hex: "#9b6bc9" },
  ];

  let activeColor = MARKERS[0].hex;
  let activeSize = Number(document.getElementById("size-slider").value);
  let eraserOn = false;

  const markerSet = document.getElementById("marker-set");
  function renderMarkers() {
    markerSet.innerHTML = "";
    MARKERS.forEach((m) => {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "marker";
      btn.style.setProperty("--m-color", m.hex);
      btn.setAttribute("aria-label", `${m.name} marker`);
      btn.setAttribute("aria-pressed", String(m.hex === activeColor && !eraserOn));
      btn.addEventListener("click", () => {
        activeColor = m.hex;
        eraserOn = false;
        setEraserButton(false);
        renderMarkers();
      });
      markerSet.appendChild(btn);
    });
  }
  renderMarkers();

  document.getElementById("size-slider").addEventListener("input", (e) => {
    activeSize = Number(e.target.value);
  });

  const eraserBtn = document.getElementById("eraser-btn");
  function setEraserButton(on) {
    eraserOn = on;
    eraserBtn.setAttribute("aria-pressed", String(on));
    renderMarkers();
  }
  eraserBtn.addEventListener("click", () => setEraserButton(!eraserOn));

  document.getElementById("clear-btn").addEventListener("click", () => {
    if (confirm("Clear the board for everyone?")) {
      socket.emit("clear");
    }
  });

  /* -----------------------------------------------------------
     Copy invite link
     ----------------------------------------------------------- */

  document.getElementById("copy-link").addEventListener("click", async () => {
    try {
      await navigator.clipboard.writeText(location.href);
    } catch (err) {
      console.warn("Clipboard write failed, falling back.", err);
    }
    const toast = document.getElementById("copied-toast");
    toast.hidden = false;
    // restart animation
    toast.style.animation = "none";
    void toast.offsetWidth;
    toast.style.animation = "";
    setTimeout(() => { toast.hidden = true; }, 2200);
  });

  /* -----------------------------------------------------------
     Socket.IO
     ----------------------------------------------------------- */

  const socket = io();
  let batchId = null;

  socket.on("connect", () => {
    document.getElementById("connection-banner").hidden = true;
    socket.emit("join", { room: ROOM, name: MY_NAME, color: MY_COLOR });
  });

  socket.io.on("reconnect_attempt", () => {
    document.getElementById("connection-banner").hidden = false;
  });

  socket.on("load-strokes", (strokes) => {
    history_ = strokes;
    redrawAll();
  });

  socket.on("draw", (seg) => {
    history_.push(seg);
    drawSegment(seg);
  });

  socket.on("clear", () => {
    history_ = [];
    redrawAll();
  });

  socket.on("remove-batch", (id) => {
    history_ = history_.filter((s) => s.batchId !== id);
    redrawAll();
  });

  socket.on("users", (users) => {
    document.getElementById("presence-count").textContent = users.length;
  });

  /* -----------------------------------------------------------
     Live cursors
     ----------------------------------------------------------- */

  const cursorLayer = document.getElementById("cursor-layer");
  const cursors = new Map();

  function upsertCursor(id, x, y, color, label) {
    let el = cursors.get(id);
    if (!el) {
      el = document.createElement("div");
      el.className = "cursor";
      el.innerHTML = `<span class="cursor__dot"></span><span class="cursor__label"></span>`;
      cursorLayer.appendChild(el);
      cursors.set(id, el);
    }
    el.style.left = `${x * window.innerWidth}px`;
    el.style.top = `${y * window.innerHeight}px`;
    el.querySelector(".cursor__dot").style.background = color;
    el.querySelector(".cursor__label").style.background = color;
    if (label) el.querySelector(".cursor__label").textContent = label;
  }

  socket.on("cursor", (data) => {
    upsertCursor(data.id, data.x, data.y, data.color, data.name);
  });

  socket.on("cursor-leave", (id) => {
    const el = cursors.get(id);
    if (el) {
      el.remove();
      cursors.delete(id);
    }
  });

  /* -----------------------------------------------------------
     Drawing input (mouse + touch/pen via Pointer Events)
     ----------------------------------------------------------- */

  let drawing = false;
  let lastX = 0;
  let lastY = 0;
  let cursorThrottle = 0;

  function toNormalized(evt) {
    const rect = canvas.getBoundingClientRect();
    return {
      x: (evt.clientX - rect.left) / rect.width,
      y: (evt.clientY - rect.top) / rect.height,
    };
  }

  canvas.addEventListener("pointerdown", (evt) => {
    canvas.setPointerCapture(evt.pointerId);
    drawing = true;
    batchId = `${socket.id || "local"}-${Date.now()}`;
    const p = toNormalized(evt);
    lastX = p.x;
    lastY = p.y;
  });

  canvas.addEventListener("pointermove", (evt) => {
    const p = toNormalized(evt);

    // Broadcast cursor position at ~30fps regardless of drawing state.
    const now = performance.now();
    if (now - cursorThrottle > 33) {
      cursorThrottle = now;
      socket.emit("cursor", { x: p.x, y: p.y, color: MY_COLOR, name: MY_NAME });
    }

    if (!drawing) return;

    const seg = {
      x0: lastX,
      y0: lastY,
      x1: p.x,
      y1: p.y,
      color: activeColor,
      size: eraserOn ? Math.max(activeSize * 3, 20) : activeSize,
      eraser: eraserOn,
      batchId,
    };
    history_.push(seg);
    drawSegment(seg);
    socket.emit("draw", seg);

    lastX = p.x;
    lastY = p.y;
  });

  function endStroke() {
    drawing = false;
    batchId = null;
  }

  canvas.addEventListener("pointerup", endStroke);
  canvas.addEventListener("pointercancel", endStroke);
  canvas.addEventListener("pointerleave", endStroke);
})();
