const imageInput = document.getElementById("imageInput");
const previewCanvas = document.getElementById("previewCanvas");
const analysisCanvas = document.getElementById("analysisCanvas");
const hint = document.getElementById("hint");
const results = document.getElementById("results");
const colorCount = document.getElementById("colorCount");
const colorCountValue = document.getElementById("colorCountValue");
const clearSelectionBtn = document.getElementById("clearSelectionBtn");
const undoPointBtn = document.getElementById("undoPointBtn");
const closeSelectionBtn = document.getElementById("closeSelectionBtn");
const selectionHint = document.getElementById("selectionHint");

const c1Selects = [
  document.getElementById("c1Select1"),
  document.getElementById("c1Select2"),
  document.getElementById("c1Select3")
];
const c2Selects = [
  document.getElementById("c2Select1"),
  document.getElementById("c2Select2"),
  document.getElementById("c2Select3")
];
const c3Selects = [
  document.getElementById("c3Select1"),
  document.getElementById("c3Select2"),
  document.getElementById("c3Select3")
];
const c1Pct = document.getElementById("c1Pct");
const c2Pct = document.getElementById("c2Pct");
const c3Pct = document.getElementById("c3Pct");
const c1Swatch = document.getElementById("c1Swatch");
const c2Swatch = document.getElementById("c2Swatch");
const c3Swatch = document.getElementById("c3Swatch");
const mixTotal = document.getElementById("mixTotal");

const lineC1 = document.getElementById("lineC1");
const lineC2 = document.getElementById("lineC2");
const lineC3 = document.getElementById("lineC3");
const labelC1 = document.getElementById("labelC1");
const labelC2 = document.getElementById("labelC2");
const labelC3 = document.getElementById("labelC3");
const qapPoint = document.getElementById("qapPoint");
const fapPoint = document.getElementById("fapPoint");
const triangleLegend = document.getElementById("triangleLegend");

const COLOR_LEXICON = [
  { name: "Nero", rgb: [0, 0, 0] },
  { name: "Bianco", rgb: [255, 255, 255] },
  { name: "Grigio", rgb: [128, 128, 128] },
  { name: "Rosso", rgb: [220, 60, 45] },
  { name: "Marrone", rgb: [120, 75, 45] },
  { name: "Arancione", rgb: [230, 125, 40] },
  { name: "Giallo", rgb: [245, 210, 60] },
  { name: "Verde", rgb: [65, 140, 70] },
  { name: "Blu", rgb: [60, 95, 200] },
  { name: "Viola", rgb: [130, 80, 170] },
  { name: "Rosa", rgb: [230, 160, 180] },
  { name: "Beige", rgb: [215, 195, 165] }
];

let loadedImage = null;
let polygonNorm = [];
let polygonClosed = false;
let pointerPx = null;
let lastTouchMs = 0;
let currentPalette = [];

colorCount.addEventListener("input", () => {
  colorCountValue.textContent = colorCount.value;
  if (loadedImage) analyzeImage(loadedImage);
});

clearSelectionBtn.addEventListener("click", () => {
  polygonNorm = [];
  polygonClosed = false;
  pointerPx = null;
  currentPalette = [];
  results.innerHTML = "";
  hint.textContent = "Selezione azzerata. Disegna un nuovo poligono.";
  selectionHint.textContent = "Clicca/tocca sull'anteprima per creare un poligono. Premi 'Conferma area' per chiudere.";
  renderPreviewOnly();
  populateColorSelectors();
});

undoPointBtn.addEventListener("click", () => {
  if (polygonNorm.length === 0) return;
  if (polygonClosed) polygonClosed = false;
  polygonNorm.pop();
  if (loadedImage) analyzeImage(loadedImage);
});

closeSelectionBtn.addEventListener("click", () => {
  if (polygonNorm.length >= 3) {
    polygonClosed = true;
    if (loadedImage) analyzeImage(loadedImage);
  }
});

[...c1Selects, ...c2Selects, ...c3Selects].forEach((el) => {
  el.addEventListener("change", () => {
    updatePercentagesFromSelection();
    updateTriangle();
  });
});

previewCanvas.addEventListener("click", (event) => {
  if (Date.now() - lastTouchMs < 350) return;
  addPolygonPointFromEvent(event);
});

previewCanvas.addEventListener("touchend", (event) => {
  if (!loadedImage || previewCanvas.width === 0 || previewCanvas.height === 0) return;
  event.preventDefault();
  const touch = event.changedTouches?.[0];
  if (!touch) return;
  lastTouchMs = Date.now();
  addPolygonPointAtClient(touch.clientX, touch.clientY);
}, { passive: false });

previewCanvas.addEventListener("mousemove", (event) => {
  if (!loadedImage) return;
  pointerPx = pointerToCanvasPx(event, previewCanvas);
  renderPreviewOnly();
});

previewCanvas.addEventListener("dblclick", () => {
  if (!loadedImage) return;
  if (polygonNorm.length >= 3) {
    polygonClosed = true;
    analyzeImage(loadedImage);
  }
});

window.addEventListener("keydown", (event) => {
  if (event.key !== "Enter") return;
  if (!loadedImage) return;
  if (polygonNorm.length >= 3 && !polygonClosed) {
    polygonClosed = true;
    analyzeImage(loadedImage);
  }
});

imageInput.addEventListener("change", (event) => {
  const file = event.target.files?.[0];
  if (!file) return;

  const reader = new FileReader();
  reader.onload = () => {
    const img = new Image();
    img.onload = () => {
      loadedImage = img;
      polygonNorm = [];
      polygonClosed = false;
      pointerPx = null;
      currentPalette = [];
      renderPreviewOnly();
      populateColorSelectors();
      hint.textContent = "Disegna il poligono sulla roccia e premi 'Conferma area'.";
    };
    img.src = reader.result;
  };
  reader.readAsDataURL(file);
});

function addPolygonPointFromEvent(event) {
  if (!loadedImage || previewCanvas.width === 0 || previewCanvas.height === 0) return;
  const p = pointerToCanvasPx(event, previewCanvas);
  addPolygonPoint(p);
}

function addPolygonPointAtClient(clientX, clientY) {
  const rect = previewCanvas.getBoundingClientRect();
  const scaleX = previewCanvas.width / Math.max(1, rect.width);
  const scaleY = previewCanvas.height / Math.max(1, rect.height);
  const p = {
    x: Math.max(0, Math.min(previewCanvas.width - 1, (clientX - rect.left) * scaleX)),
    y: Math.max(0, Math.min(previewCanvas.height - 1, (clientY - rect.top) * scaleY))
  };
  addPolygonPoint(p);
}

function addPolygonPoint(p) {
  if (!loadedImage) return;

  if (polygonClosed) {
    polygonNorm = [];
    polygonClosed = false;
  }

  if (polygonNorm.length >= 3) {
    const first = {
      x: polygonNorm[0].x * previewCanvas.width,
      y: polygonNorm[0].y * previewCanvas.height
    };
    if (Math.hypot(p.x - first.x, p.y - first.y) <= 14) {
      polygonClosed = true;
      analyzeImage(loadedImage);
      return;
    }
  }

  polygonNorm.push({
    x: p.x / previewCanvas.width,
    y: p.y / previewCanvas.height
  });

  selectionHint.textContent = "Aggiungi punti e premi 'Conferma area' (o doppio click / Invio).";
  renderPreviewOnly();
}

function analyzeImage(img) {
  const { width, height, imageData } = drawImageToAnalysisCanvas(img);
  const polygonPx = getPolygonPx(width, height);

  if (!polygonClosed || polygonPx.length < 3) {
    hint.textContent = "Per analizzare i colori devi chiudere il poligono ('Conferma area').";
    results.innerHTML = "";
    currentPalette = [];
    populateColorSelectors();
    renderPreviewWithMask(img, width, height, imageData, null, polygonPx);
    return;
  }

  const rockMask = buildPolygonMask(width, height, polygonPx);
  const selectedCount = countOnes(rockMask);
  if (selectedCount < 30) {
    hint.textContent = "Area selezionata troppo piccola. Disegna un poligono piu grande.";
    results.innerHTML = "";
    currentPalette = [];
    populateColorSelectors();
    renderPreviewWithMask(img, width, height, imageData, rockMask, polygonPx);
    return;
  }

  renderPreviewWithMask(img, width, height, imageData, rockMask, polygonPx);

  const points = sampleMaskedColorPoints(imageData.data, width, height, rockMask);
  if (points.length === 0) {
    hint.textContent = "Nessun colore valido nell'area selezionata.";
    results.innerHTML = "";
    currentPalette = [];
    populateColorSelectors();
    return;
  }

  const k = Number(colorCount.value);
  const { centroids, counts } = weightedKMeans(points, k, 28);

  let rows = centroids
    .map((rgb, i) => ({ rgb, weight: counts[i] }))
    .filter((x) => x.weight > 0);

  rows = mergeSimilarRows(rows);
  rows = mergeByColorFamily(rows);
  rows = normalizeRowsToPercent(rows);

  currentPalette = rows
    .sort((a, b) => b.pct - a.pct)
    .map((r) => {
      const hex = toHex(r.rgb);
      const name = buildColorLabel(r.rgb, hex);
      return { ...r, hex, name };
    });

  const ratioPct = (selectedCount / (width * height)) * 100;
  hint.textContent = `Analisi poligono selezionato (${ratioPct.toFixed(1)}% immagine). Trovati ${currentPalette.length} colori principali.`;
  selectionHint.textContent = "Poligono selezionato attivo. Usa 'Reset selezione' per disegnare una nuova area.";

  renderResults(currentPalette);
  populateColorSelectors();
  updatePercentagesFromSelection();
  updateTriangle();
}

function drawImageToAnalysisCanvas(img) {
  const ctx = analysisCanvas.getContext("2d", { willReadFrequently: true });
  const maxSide = 900;
  const scale = Math.min(1, maxSide / Math.max(img.width, img.height));
  const width = Math.max(1, Math.round(img.width * scale));
  const height = Math.max(1, Math.round(img.height * scale));

  analysisCanvas.width = width;
  analysisCanvas.height = height;
  ctx.imageSmoothingEnabled = true;
  ctx.drawImage(img, 0, 0, width, height);

  return { width, height, imageData: ctx.getImageData(0, 0, width, height) };
}

function renderPreviewOnly() {
  if (!loadedImage) return;
  const { width, height, imageData } = drawImageToAnalysisCanvas(loadedImage);
  const polygonPx = getPolygonPx(width, height);
  renderPreviewWithMask(loadedImage, width, height, imageData, null, polygonPx);
}

function renderPreviewWithMask(img, width, height, imageData, rockMask, polygonPx) {
  previewCanvas.width = width;
  previewCanvas.height = height;
  const pctx = previewCanvas.getContext("2d", { willReadFrequently: true });

  pctx.clearRect(0, 0, width, height);
  if (rockMask) {
    pctx.save();
    pctx.filter = "blur(14px) brightness(0.5) saturate(0.75)";
    pctx.drawImage(img, 0, 0, width, height);
    pctx.restore();
    pctx.fillStyle = "rgba(40, 45, 52, 0.38)";
    pctx.fillRect(0, 0, width, height);

    const fg = new ImageData(new Uint8ClampedArray(imageData.data), width, height);
    for (let i = 0; i < rockMask.length; i += 1) {
      if (rockMask[i] === 0) fg.data[i * 4 + 3] = 0;
    }
    const fgCanvas = document.createElement("canvas");
    fgCanvas.width = width;
    fgCanvas.height = height;
    fgCanvas.getContext("2d").putImageData(fg, 0, 0);
    pctx.drawImage(fgCanvas, 0, 0);
  } else {
    pctx.drawImage(img, 0, 0, width, height);
  }

  if (polygonPx.length > 0) {
    pctx.save();
    pctx.strokeStyle = "#00E5FF";
    pctx.lineWidth = 2;
    pctx.setLineDash([8, 5]);
    pctx.beginPath();
    pctx.moveTo(polygonPx[0].x, polygonPx[0].y);
    for (let i = 1; i < polygonPx.length; i += 1) pctx.lineTo(polygonPx[i].x, polygonPx[i].y);
    if (polygonClosed && polygonPx.length >= 3) pctx.closePath();
    else if (pointerPx) pctx.lineTo(pointerPx.x, pointerPx.y);
    pctx.stroke();
    pctx.setLineDash([]);
    for (let i = 0; i < polygonPx.length; i += 1) {
      pctx.beginPath();
      pctx.fillStyle = "#00E5FF";
      pctx.arc(polygonPx[i].x, polygonPx[i].y, 3, 0, Math.PI * 2);
      pctx.fill();
    }
    pctx.restore();
  }
}

function sampleMaskedColorPoints(data, width, height, mask) {
  const bins = new Map();
  const sampleTarget = 120000;
  const totalPixels = width * height;
  const step = Math.max(1, Math.floor(Math.sqrt(totalPixels / sampleTarget)));

  for (let y = 0; y < height; y += step) {
    for (let x = 0; x < width; x += step) {
      const idxPixel = y * width + x;
      if (mask[idxPixel] !== 1) continue;
      const i = idxPixel * 4;
      if (data[i + 3] < 10) continue;

      const rq = data[i] >> 3;
      const gq = data[i + 1] >> 3;
      const bq = data[i + 2] >> 3;
      const key = (rq << 10) | (gq << 5) | bq;

      const entry = bins.get(key);
      if (entry) entry.w += 1;
      else bins.set(key, { rgb: [rq * 8 + 4, gq * 8 + 4, bq * 8 + 4], w: 1 });
    }
  }

  return [...bins.values()];
}

function mergeSimilarRows(rows) {
  const work = rows.map((r) => ({ rgb: [...r.rgb], weight: r.weight }));

  while (true) {
    let bestI = -1;
    let bestJ = -1;
    let bestD = Number.POSITIVE_INFINITY;

    for (let i = 0; i < work.length; i += 1) {
      for (let j = i + 1; j < work.length; j += 1) {
        const d = Math.sqrt(colorDistanceSq(work[i].rgb, work[j].rgb));
        const satI = saturation(work[i].rgb);
        const satJ = saturation(work[j].rgb);
        const threshold = satI < 0.16 && satJ < 0.16 ? 34 : 24;
        if (d <= threshold && d < bestD) {
          bestD = d;
          bestI = i;
          bestJ = j;
        }
      }
    }

    if (bestI === -1) break;

    const a = work[bestI];
    const b = work[bestJ];
    const tw = a.weight + b.weight;
    const merged = {
      rgb: [
        Math.round((a.rgb[0] * a.weight + b.rgb[0] * b.weight) / tw),
        Math.round((a.rgb[1] * a.weight + b.rgb[1] * b.weight) / tw),
        Math.round((a.rgb[2] * a.weight + b.rgb[2] * b.weight) / tw)
      ],
      weight: tw
    };

    work[bestI] = merged;
    work.splice(bestJ, 1);
  }

  return work;
}

function mergeByColorFamily(rows) {
  const grouped = new Map();

  for (let i = 0; i < rows.length; i += 1) {
    const row = rows[i];
    const family = colorFamilyForMerge(row.rgb);
    const g = grouped.get(family);
    if (!g) {
      grouped.set(family, {
        sumR: row.rgb[0] * row.weight,
        sumG: row.rgb[1] * row.weight,
        sumB: row.rgb[2] * row.weight,
        weight: row.weight
      });
    } else {
      g.sumR += row.rgb[0] * row.weight;
      g.sumG += row.rgb[1] * row.weight;
      g.sumB += row.rgb[2] * row.weight;
      g.weight += row.weight;
    }
  }

  return [...grouped.values()].map((g) => ({
    rgb: [
      Math.round(g.sumR / g.weight),
      Math.round(g.sumG / g.weight),
      Math.round(g.sumB / g.weight)
    ],
    weight: g.weight
  }));
}

function colorFamilyForMerge(rgb) {
  const [r, g, b] = rgb;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const light = (max + min) / 2 / 255;
  const sat = saturation(rgb);
  const spread = max - min;

  // Mantiene i riflessi bianchi separati, evitando che vengano assorbiti da beige/grigi.
  if ((light > 0.84 && sat < 0.22) || (light > 0.78 && sat < 0.14 && spread < 30)) return "Bianco";
  if (light < 0.14 && sat < 0.25) return "Nero";

  return colorNameFromRgb(rgb);
}

function normalizeRowsToPercent(rows) {
  const total = rows.reduce((s, r) => s + r.weight, 0);
  if (total <= 0) return [];
  const out = rows.map((r) => ({ ...r, pct: (r.weight / total) * 100 }));
  out.sort((a, b) => b.pct - a.pct);
  return out;
}

function renderResults(rows) {
  results.innerHTML = rows
    .map((row) => {
      const rgbText = `RGB(${row.rgb[0]}, ${row.rgb[1]}, ${row.rgb[2]})`;
      return `
      <div class="result-row">
        <div class="swatch" style="background:${row.hex}"></div>
        <div class="hex">${row.name} • ${row.hex} • ${rgbText}</div>
        <div class="percent">${row.pct.toFixed(2)}%</div>
      </div>`;
    })
    .join("");
}

function populateColorSelectors() {
  const palette = currentPalette.length > 0
    ? currentPalette
    : [
      { hex: "#D45D5D", name: "Rosso medio", pct: 33.34 },
      { hex: "#2E86AB", name: "Blu medio", pct: 33.33 },
      { hex: "#9F7AEA", name: "Viola medio", pct: 33.33 }
    ];

  const allGroups = [c1Selects, c2Selects, c3Selects];
  allGroups.forEach((group) => {
    const prev = getSelectedHexesFromSlots(group);
    fillSlotSelects(group, palette, prev);
  });

  setDefaultGroupSelection(c1Selects, palette, [0, 1, 2]);
  setDefaultGroupSelection(c2Selects, palette, [1, 2, 3]);
  setDefaultGroupSelection(c3Selects, palette, [2, 3, 4]);

  updatePercentagesFromSelection();
  updateTriangle();
}

function updatePercentagesFromSelection() {
  const values = [
    sumPercentagesForSelection(getSelectedHexesFromSlots(c1Selects)),
    sumPercentagesForSelection(getSelectedHexesFromSlots(c2Selects)),
    sumPercentagesForSelection(getSelectedHexesFromSlots(c3Selects))
  ];
  const normalized = normalizeByProportion(values);
  c1Pct.value = normalized[0].toFixed(2);
  c2Pct.value = normalized[1].toFixed(2);
  c3Pct.value = normalized[2].toFixed(2);
}

function normalizeByProportion(values) {
  const sum = values[0] + values[1] + values[2];
  if (sum <= 0) return [33.34, 33.33, 33.33];
  const out = values.map((v) => round2((v / sum) * 100));
  const fix = round2(100 - (out[0] + out[1] + out[2]));
  out[2] = round2(out[2] + fix);
  return out;
}

function updateTriangle() {
  const c1Hexes = getSelectedHexesFromSlots(c1Selects);
  const c2Hexes = getSelectedHexesFromSlots(c2Selects);
  const c3Hexes = getSelectedHexesFromSlots(c3Selects);

  const c1 = representativeColor(c1Hexes) || "#D45D5D";
  const c2 = representativeColor(c2Hexes) || "#2E86AB";
  const c3 = representativeColor(c3Hexes) || "#9F7AEA";
  const p1 = clampNumber(c1Pct.value);
  const p2 = clampNumber(c2Pct.value);
  const p3 = clampNumber(c3Pct.value);

  c1Swatch.style.background = c1;
  c2Swatch.style.background = c2;
  c3Swatch.style.background = c3;

  mixTotal.textContent = `Totale: ${round2(p1 + p2 + p3).toFixed(2)}%`;

  const A = { x: 200, y: 36 };
  const B = { x: 62, y: 276 };
  const C = { x: 338, y: 276 };

  drawParallelToOpposite(lineC1, B, A, C, A, p1 / 100, c1);
  drawParallelToOpposite(lineC2, A, B, C, B, p2 / 100, c2);
  drawParallelToOpposite(lineC3, A, C, B, C, p3 / 100, c3);

  labelC1.textContent = `C1 (Q/F) ${p1.toFixed(1)}%`;
  labelC2.textContent = `C2 (A) ${p2.toFixed(1)}%`;
  labelC3.textContent = `C3 (P) ${p3.toFixed(1)}%`;
  triangleLegend.textContent =
    `C1→Q/F: ${shortNamesForHexes(c1Hexes)} • C2→A: ${shortNamesForHexes(c2Hexes)} • C3→P: ${shortNamesForHexes(c3Hexes)}`;

  updateStreckeisenPoints(p1, p2, p3, A, B, C);
}

function updateStreckeisenPoints(p1, p2, p3, vTop, vLeft, vRight) {
  const sum = p1 + p2 + p3;
  if (sum <= 0) return;
  const wTop = p1 / sum;
  const wLeft = p2 / sum;
  const wRight = p3 / sum;

  const x = vTop.x * wTop + vLeft.x * wLeft + vRight.x * wRight;
  const y = vTop.y * wTop + vLeft.y * wLeft + vRight.y * wRight;

  qapPoint.setAttribute("cx", x.toFixed(2));
  qapPoint.setAttribute("cy", y.toFixed(2));
  fapPoint.setAttribute("cx", x.toFixed(2));
  fapPoint.setAttribute("cy", y.toFixed(2));
}

function drawParallelToOpposite(lineEl, from1, vertex, from2, vertexRef, t, color) {
  const u = Math.max(0, Math.min(1, t));
  const pStart = lerpPoint(from1, vertex, u);
  const pEnd = lerpPoint(from2, vertexRef, u);
  lineEl.setAttribute("x1", pStart.x.toFixed(2));
  lineEl.setAttribute("y1", pStart.y.toFixed(2));
  lineEl.setAttribute("x2", pEnd.x.toFixed(2));
  lineEl.setAttribute("y2", pEnd.y.toFixed(2));
  lineEl.setAttribute("stroke", color);
}

function lerpPoint(a, b, t) {
  return { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t };
}

function pointerToCanvasPx(event, canvasEl) {
  const rect = canvasEl.getBoundingClientRect();
  const scaleX = canvasEl.width / Math.max(1, rect.width);
  const scaleY = canvasEl.height / Math.max(1, rect.height);
  return {
    x: Math.max(0, Math.min(canvasEl.width - 1, (event.clientX - rect.left) * scaleX)),
    y: Math.max(0, Math.min(canvasEl.height - 1, (event.clientY - rect.top) * scaleY))
  };
}

function getPolygonPx(width, height) {
  if (polygonNorm.length === 0) return [];
  return polygonNorm.map((p) => ({
    x: Math.max(0, Math.min(width - 1, p.x * width)),
    y: Math.max(0, Math.min(height - 1, p.y * height))
  }));
}

function buildPolygonMask(width, height, polygon) {
  const mask = new Uint8Array(width * height);
  if (polygon.length < 3) return mask;

  let minX = width - 1;
  let minY = height - 1;
  let maxX = 0;
  let maxY = 0;
  for (let i = 0; i < polygon.length; i += 1) {
    minX = Math.min(minX, polygon[i].x);
    minY = Math.min(minY, polygon[i].y);
    maxX = Math.max(maxX, polygon[i].x);
    maxY = Math.max(maxY, polygon[i].y);
  }

  const x1 = Math.max(0, Math.floor(minX));
  const y1 = Math.max(0, Math.floor(minY));
  const x2 = Math.min(width - 1, Math.ceil(maxX));
  const y2 = Math.min(height - 1, Math.ceil(maxY));

  for (let y = y1; y <= y2; y += 1) {
    for (let x = x1; x <= x2; x += 1) {
      if (pointInPolygon(x + 0.5, y + 0.5, polygon)) mask[y * width + x] = 1;
    }
  }

  return mask;
}

function pointInPolygon(x, y, polygon) {
  let inside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i, i += 1) {
    const xi = polygon[i].x;
    const yi = polygon[i].y;
    const xj = polygon[j].x;
    const yj = polygon[j].y;
    const intersect = ((yi > y) !== (yj > y))
      && (x < ((xj - xi) * (y - yi)) / ((yj - yi) || 1e-9) + xi);
    if (intersect) inside = !inside;
  }
  return inside;
}

function weightedKMeans(points, requestedK, maxIterations) {
  const k = Math.min(requestedK, points.length);
  if (k === 0) return { centroids: [], counts: [] };

  const centroids = initCentroids(points, k);
  const counts = new Array(k).fill(0);

  for (let iter = 0; iter < maxIterations; iter += 1) {
    const sums = new Array(k).fill(0).map(() => [0, 0, 0]);
    const distFrom = new Array(points.length).fill(0);
    counts.fill(0);

    for (let i = 0; i < points.length; i += 1) {
      const p = points[i];
      let best = 0;
      let bestDist = Number.POSITIVE_INFINITY;

      for (let c = 0; c < k; c += 1) {
        const d = colorDistanceSq(p.rgb, centroids[c]);
        if (d < bestDist) {
          best = c;
          bestDist = d;
        }
      }

      distFrom[i] = bestDist;
      counts[best] += p.w;
      sums[best][0] += p.rgb[0] * p.w;
      sums[best][1] += p.rgb[1] * p.w;
      sums[best][2] += p.rgb[2] * p.w;
    }

    let moved = false;
    for (let c = 0; c < k; c += 1) {
      if (counts[c] === 0) {
        const idx = farthestPointIndex(points, distFrom);
        centroids[c] = [...points[idx].rgb];
        moved = true;
        continue;
      }

      const nr = Math.round(sums[c][0] / counts[c]);
      const ng = Math.round(sums[c][1] / counts[c]);
      const nb = Math.round(sums[c][2] / counts[c]);
      if (nr !== centroids[c][0] || ng !== centroids[c][1] || nb !== centroids[c][2]) moved = true;
      centroids[c] = [nr, ng, nb];
    }

    if (!moved) break;
  }

  return { centroids, counts };
}

function initCentroids(points, k) {
  const centroids = [];
  let most = 0;
  for (let i = 1; i < points.length; i += 1) if (points[i].w > points[most].w) most = i;
  centroids.push([...points[most].rgb]);

  while (centroids.length < k) {
    let bestIdx = 0;
    let bestScore = -1;
    for (let i = 0; i < points.length; i += 1) {
      let minDist = Number.POSITIVE_INFINITY;
      for (let c = 0; c < centroids.length; c += 1) {
        const d = colorDistanceSq(points[i].rgb, centroids[c]);
        if (d < minDist) minDist = d;
      }
      const score = minDist * points[i].w;
      if (score > bestScore) {
        bestScore = score;
        bestIdx = i;
      }
    }
    centroids.push([...points[bestIdx].rgb]);
  }

  return centroids;
}

function farthestPointIndex(points, distances) {
  let bestIndex = 0;
  let bestScore = -1;
  for (let i = 0; i < points.length; i += 1) {
    const score = distances[i] * points[i].w;
    if (score > bestScore) {
      bestScore = score;
      bestIndex = i;
    }
  }
  return bestIndex;
}

function colorDistanceSq(a, b) {
  const dr = a[0] - b[0];
  const dg = a[1] - b[1];
  const db = a[2] - b[2];
  return dr * dr + dg * dg + db * db;
}

function toHex(rgb) {
  return `#${rgb.map((v) => v.toString(16).padStart(2, "0")).join("")}`.toUpperCase();
}

function saturation(rgb) {
  const max = Math.max(rgb[0], rgb[1], rgb[2]);
  const min = Math.min(rgb[0], rgb[1], rgb[2]);
  return max === 0 ? 0 : (max - min) / max;
}

function colorNameFromRgb(rgb) {
  let bestName = "Colore";
  let bestDist = Number.POSITIVE_INFINITY;
  for (let i = 0; i < COLOR_LEXICON.length; i += 1) {
    const d = colorDistanceSq(rgb, COLOR_LEXICON[i].rgb);
    if (d < bestDist) {
      bestDist = d;
      bestName = COLOR_LEXICON[i].name;
    }
  }
  return bestName;
}

function colorDescriptor(rgb) {
  const [r, g, b] = rgb;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const delta = max - min;
  const light = (max + min) / 2 / 255;
  const sat = max === 0 ? 0 : delta / max;

  let tone = "medio";
  if (light < 0.25) tone = "scuro";
  else if (light > 0.78) tone = "chiaro";

  let flavor = "";
  if (sat >= 0.16) {
    const warm = r - b;
    const greenish = g - ((r + b) / 2);
    if (warm > 24) flavor = " caldo";
    else if (warm < -24) flavor = " freddo";
    else if (greenish > 22) flavor = " oliva";
  }

  return `${tone}${flavor}`.trim();
}

function buildColorLabel(rgb, hex) {
  const base = colorNameFromRgb(rgb);
  const [r, g, b] = rgb;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const light = (max + min) / 2 / 255;
  const sat = saturation(rgb);

  if (base === "Grigio") {
    if (light < 0.22) return "Grigio antracite";
    if (light < 0.35) return "Grigio ardesia";
    if (light < 0.5) return "Grigio pietra";
    if (light < 0.68) return "Grigio cenere";
    if (light < 0.82) return "Grigio perla";
    return "Grigio ghiaccio";
  }

  if (base === "Beige") {
    if (light > 0.78) return "Avorio";
    if (sat < 0.18) return "Tortora";
    if (r > g + 8) return "Beige sabbia";
    return "Beige crema";
  }

  if (base === "Marrone") {
    if (light < 0.28) return "Marrone bruno";
    if (sat > 0.35) return "Marrone ruggine";
    return "Marrone castagna";
  }

  if (base === "Verde") {
    if (sat < 0.2) return "Verde salvia";
    if (light < 0.35) return "Verde bosco";
    return "Verde oliva";
  }

  if (base === "Bianco") {
    if (sat < 0.11 && light > 0.9) return "Bianco lucido";
    if (sat < 0.09 && light > 0.84) return "Bianco latte";
    return "Bianco caldo";
  }

  const desc = colorDescriptor(rgb);
  return `${base} ${desc}`.trim();
}

function shortNameForHex(hex) {
  const found = currentPalette.find((p) => p.hex === hex);
  return found ? found.name.split(" (")[0] : hex;
}

function fillSlotSelects(slotSelects, palette, prevValues) {
  for (let i = 0; i < slotSelects.length; i += 1) {
    const select = slotSelects[i];
    const prev = prevValues[i] || "";
    select.innerHTML =
      `<option value="">Nessuno</option>${
        palette.map((p) => `<option value="${p.hex}">${p.name} (${p.hex})</option>`).join("")
      }`;
    select.value = palette.some((p) => p.hex === prev) ? prev : "";
  }
}

function setDefaultGroupSelection(slotSelects, palette, fallbackIndices) {
  if (getSelectedHexesFromSlots(slotSelects).length > 0) return;
  for (let i = 0; i < slotSelects.length; i += 1) {
    const idx = fallbackIndices[i];
    if (idx !== undefined && idx < palette.length) {
      slotSelects[i].value = palette[idx].hex;
    } else {
      slotSelects[i].value = "";
    }
  }
}

function getSelectedHexesFromSlots(slotSelects) {
  const uniq = [];
  for (let i = 0; i < slotSelects.length; i += 1) {
    const hex = slotSelects[i].value;
    if (!hex || uniq.includes(hex)) continue;
    uniq.push(hex);
  }
  return uniq;
}

function sumPercentagesForSelection(hexes) {
  let sum = 0;
  for (let i = 0; i < hexes.length; i += 1) {
    const found = currentPalette.find((p) => p.hex === hexes[i]);
    if (found) sum += found.pct;
  }
  return sum;
}

function representativeColor(hexes) {
  if (hexes.length === 0) return null;
  if (hexes.length === 1) return hexes[0];

  let r = 0;
  let g = 0;
  let b = 0;
  let count = 0;
  for (let i = 0; i < hexes.length; i += 1) {
    const rgb = hexToRgb(hexes[i]);
    if (!rgb) continue;
    r += rgb[0];
    g += rgb[1];
    b += rgb[2];
    count += 1;
  }
  if (count === 0) return null;
  return toHex([Math.round(r / count), Math.round(g / count), Math.round(b / count)]);
}

function shortNamesForHexes(hexes) {
  if (!hexes || hexes.length === 0) return "-";
  const names = hexes.map((h) => shortNameForHex(h));
  if (names.length <= 2) return names.join(" + ");
  return `${names[0]} + ${names[1]} + ${names.length - 2} altri`;
}

function hexToRgb(hex) {
  const clean = hex.replace("#", "");
  if (clean.length !== 6) return null;
  return [
    parseInt(clean.slice(0, 2), 16),
    parseInt(clean.slice(2, 4), 16),
    parseInt(clean.slice(4, 6), 16)
  ];
}

function countOnes(mask) {
  let n = 0;
  for (let i = 0; i < mask.length; i += 1) n += mask[i];
  return n;
}

function clampNumber(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return 0;
  return Math.max(0, Math.min(100, n));
}

function round2(n) {
  return Math.round(n * 100) / 100;
}

populateColorSelectors();
