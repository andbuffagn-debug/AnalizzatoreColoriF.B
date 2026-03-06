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

colorCount.addEventListener("input", () => {
  colorCountValue.textContent = colorCount.value;
  if (loadedImage) analyzeImage(loadedImage);
});

clearSelectionBtn.addEventListener("click", () => {
  polygonNorm = [];
  polygonClosed = false;
  pointerPx = null;
  if (loadedImage) analyzeImage(loadedImage);
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

previewCanvas.addEventListener("click", (event) => {
  if (Date.now() - lastTouchMs < 350) return; // evita doppio inserimento dopo touch
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
  if (polygonClosed) {
    polygonNorm = [];
    polygonClosed = false;
  }

  // Se clicca vicino al primo punto, chiude il poligono.
  if (polygonNorm.length >= 3) {
    const first = {
      x: polygonNorm[0].x * previewCanvas.width,
      y: polygonNorm[0].y * previewCanvas.height
    };
    const d = Math.hypot(p.x - first.x, p.y - first.y);
    if (d <= 14) {
      polygonClosed = true;
      analyzeImage(loadedImage);
      return;
    }
  }

  polygonNorm.push({
    x: p.x / previewCanvas.width,
    y: p.y / previewCanvas.height
  });
  analyzeImage(loadedImage);
}

previewCanvas.addEventListener("mousemove", (event) => {
  if (!loadedImage) return;
  pointerPx = pointerToCanvasPx(event, previewCanvas);
  analyzeImage(loadedImage);
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
      analyzeImage(img);
    };
    img.src = reader.result;
  };
  reader.readAsDataURL(file);
});

function analyzeImage(img) {
  const ctx = analysisCanvas.getContext("2d", { willReadFrequently: true });
  const maxSide = 900;
  const scale = Math.min(1, maxSide / Math.max(img.width, img.height));
  const width = Math.max(1, Math.round(img.width * scale));
  const height = Math.max(1, Math.round(img.height * scale));

  analysisCanvas.width = width;
  analysisCanvas.height = height;
  ctx.imageSmoothingEnabled = true;
  ctx.drawImage(img, 0, 0, width, height);

  const imageData = ctx.getImageData(0, 0, width, height);
  const data = imageData.data;
  const polygonPx = getPolygonPx(width, height);
  let rockMask;
  let usedFallbackMask = false;
  let usedManualSelection = false;
  let ratio = 0;

  if (polygonClosed && polygonPx.length >= 3) {
    rockMask = buildPolygonMask(width, height, polygonPx);
    ratio = countOnes(rockMask) / (width * height);
    usedManualSelection = true;
  } else {
    rockMask = buildRockMask(data, width, height);
    let rockPixels = countOnes(rockMask);
    ratio = rockPixels / (width * height);

    // Fallback robusto: se la segmentazione automatica e' troppo piccola o enorme,
    // usa una maschera centrale per evitare risultati inutilizzabili.
    if (ratio < 0.08 || ratio > 0.92) {
      rockMask = buildCenterFallbackMask(width, height);
      rockPixels = countOnes(rockMask);
      ratio = rockPixels / (width * height);
      usedFallbackMask = true;
    }
  }

  renderPreviewWithBlur(img, width, height, rockMask, imageData, polygonPx);
  const bins = new Map();

  const sampleTarget = 50000;
  const totalPixels = width * height;
  const step = Math.max(1, Math.floor(Math.sqrt(totalPixels / sampleTarget)));

  for (let y = 0; y < height; y += step) {
    for (let x = 0; x < width; x += step) {
      const idxPixel = y * width + x;
      if (rockMask[idxPixel] !== 1) continue;
      const i = idxPixel * 4;
      if (data[i + 3] < 10) continue;

      // Quantizzazione piu fine (5 bit per canale) per migliore fedelta.
      const rq = data[i] >> 3;
      const gq = data[i + 1] >> 3;
      const bq = data[i + 2] >> 3;
      const key = (rq << 10) | (gq << 5) | bq;
      const entry = bins.get(key);

      if (entry) {
        entry.w += 1;
      } else {
        bins.set(key, { rgb: [rq * 8 + 4, gq * 8 + 4, bq * 8 + 4], w: 1 });
      }
    }
  }

  const points = [...bins.values()];
  if (points.length === 0) {
    hint.textContent = "Roccia non rilevata con affidabilita. Prova una foto piu centrata e nitida.";
    results.innerHTML = "";
    return;
  }

  const ratioPct = ratio * 100;

  const k = Number(colorCount.value);
  const { centroids, counts } = weightedKMeans(points, k, 30);
  const total = counts.reduce((sum, v) => sum + v, 0);

  const rows = centroids
    .map((rgb, i) => ({
      rgb,
      count: counts[i],
      pct: counts[i] > 0 ? (counts[i] / total) * 100 : 0
    }))
    .filter((item) => item.count > 0)
    .sort((a, b) => b.pct - a.pct);

  hint.textContent = usedFallbackMask
    ? `Analisi roccia (fallback centrale, ${ratioPct.toFixed(1)}% immagine). Trovati ${rows.length} colori principali.`
    : usedManualSelection
      ? `Analisi poligono selezionato (${ratioPct.toFixed(1)}% immagine). Trovati ${rows.length} colori principali.`
      : `Analisi roccia isolata (${ratioPct.toFixed(1)}% dell'immagine). Trovati ${rows.length} colori principali.`;
  selectionHint.textContent = polygonClosed
    ? "Poligono selezionato attivo. Usa 'Reset selezione' per tornare all'auto."
    : polygonNorm.length > 0
      ? "Aggiungi punti e premi 'Conferma area'. Puoi anche fare doppio click, Invio o click sul primo punto."
      : "Clicca/tocca sull'anteprima per creare un poligono. Premi 'Conferma area' per chiudere.";
  renderResults(rows);
}

function renderPreviewWithBlur(img, width, height, rockMask, imageData, polygonPx) {
  previewCanvas.width = width;
  previewCanvas.height = height;
  const pctx = previewCanvas.getContext("2d", { willReadFrequently: true });

  // Sfondo: foto sfocata + velo grigio scuro.
  pctx.save();
  pctx.filter = "blur(14px) brightness(0.5) saturate(0.75)";
  pctx.drawImage(img, 0, 0, width, height);
  pctx.restore();
  pctx.fillStyle = "rgba(40, 45, 52, 0.38)";
  pctx.fillRect(0, 0, width, height);

  // Primo piano: roccia nitida (solo maschera).
  const fg = new ImageData(
    new Uint8ClampedArray(imageData.data),
    imageData.width,
    imageData.height
  );
  for (let i = 0; i < rockMask.length; i += 1) {
    if (rockMask[i] === 0) {
      fg.data[i * 4 + 3] = 0;
    }
  }

  const fgCanvas = document.createElement("canvas");
  fgCanvas.width = width;
  fgCanvas.height = height;
  const fgCtx = fgCanvas.getContext("2d");
  fgCtx.putImageData(fg, 0, 0);
  pctx.drawImage(fgCanvas, 0, 0);

  if (polygonPx.length > 0) {
    pctx.save();
    pctx.strokeStyle = "#00E5FF";
    pctx.lineWidth = 2;
    pctx.setLineDash([8, 5]);
    pctx.beginPath();
    pctx.moveTo(polygonPx[0].x, polygonPx[0].y);
    for (let i = 1; i < polygonPx.length; i += 1) {
      pctx.lineTo(polygonPx[i].x, polygonPx[i].y);
    }
    if (polygonClosed && polygonPx.length >= 3) {
      pctx.closePath();
    } else if (pointerPx) {
      pctx.lineTo(pointerPx.x, pointerPx.y);
    }
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

function buildRockMask(data, width, height) {
  const bgCentroids = estimateBackgroundCentroids(data, width, height);
  const distances = new Float32Array(width * height);
  const borderDistances = [];
  const borderBand = Math.max(4, Math.floor(Math.min(width, height) * 0.06));

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const idx = y * width + x;
      const i = idx * 4;
      const rgb = [data[i], data[i + 1], data[i + 2]];
      const d = minDistanceToCentroids(rgb, bgCentroids);
      distances[idx] = d;

      if (x < borderBand || x >= width - borderBand || y < borderBand || y >= height - borderBand) {
        borderDistances.push(d);
      }
    }
  }

  const p92 = percentile(borderDistances, 92);
  const otsu = otsuThresholdFromDistances(distances);
  const thresholds = [
    Math.max(700, p92 * 1.05),
    Math.max(850, p92 * 1.2),
    Math.max(1000, p92 * 1.35),
    Math.max(1100, otsu)
  ];

  let bestMask = new Uint8Array(width * height);
  let bestScore = -1;

  for (let t = 0; t < thresholds.length; t += 1) {
    const threshold = thresholds[t];
    let mask = new Uint8Array(width * height);
    for (let i = 0; i < mask.length; i += 1) {
      if (distances[i] > threshold) mask[i] = 1;
    }

    mask = closeMask(mask, width, height);
    mask = openMask(mask, width, height);
    mask = selectBestComponent(mask, width, height);

    const areaRatio = countOnes(mask) / Math.max(1, width * height);
    const centerScore = computeMaskCenterScore(mask, width, height);
    const areaScore = 1 - Math.min(1, Math.abs(areaRatio - 0.28) / 0.28);
    const score = centerScore * 1.3 + areaScore;

    if (score > bestScore) {
      bestScore = score;
      bestMask = mask;
    }
  }

  return dilate(bestMask, width, height);
}

function estimateBackgroundCentroids(data, width, height) {
  const borderBand = Math.max(4, Math.floor(Math.min(width, height) * 0.06));
  const histogram = new Map();

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      if (!(x < borderBand || x >= width - borderBand || y < borderBand || y >= height - borderBand)) {
        continue;
      }
      const i = (y * width + x) * 4;
      const rq = data[i] >> 4;
      const gq = data[i + 1] >> 4;
      const bq = data[i + 2] >> 4;
      const key = (rq << 8) | (gq << 4) | bq;
      histogram.set(key, (histogram.get(key) || 0) + 1);
    }
  }

  const topBins = [...histogram.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 6)
    .map(([key]) => {
      const rq = (key >> 8) & 0x0f;
      const gq = (key >> 4) & 0x0f;
      const bq = key & 0x0f;
      return [rq * 16 + 8, gq * 16 + 8, bq * 16 + 8];
    });

  if (topBins.length > 0) return topBins;

  return [[255, 255, 255], [0, 0, 0]];
}

function minDistanceToCentroids(rgb, centroids) {
  let min = Number.POSITIVE_INFINITY;
  for (let i = 0; i < centroids.length; i += 1) {
    const d = colorDistanceSq(rgb, centroids[i]);
    if (d < min) min = d;
  }
  return min;
}

function percentile(values, p) {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const idx = Math.min(sorted.length - 1, Math.max(0, Math.floor((p / 100) * (sorted.length - 1))));
  return sorted[idx];
}

function otsuThresholdFromDistances(distances) {
  const bins = 256;
  const hist = new Array(bins).fill(0);
  let maxV = 1;

  for (let i = 0; i < distances.length; i += 1) {
    if (distances[i] > maxV) maxV = distances[i];
  }

  for (let i = 0; i < distances.length; i += 1) {
    const b = Math.min(bins - 1, Math.floor((distances[i] / maxV) * (bins - 1)));
    hist[b] += 1;
  }

  const total = distances.length;
  let sum = 0;
  for (let i = 0; i < bins; i += 1) sum += i * hist[i];

  let sumB = 0;
  let wB = 0;
  let maxBetween = -1;
  let thresholdBin = 0;

  for (let i = 0; i < bins; i += 1) {
    wB += hist[i];
    if (wB === 0) continue;
    const wF = total - wB;
    if (wF === 0) break;
    sumB += i * hist[i];
    const mB = sumB / wB;
    const mF = (sum - sumB) / wF;
    const between = wB * wF * (mB - mF) * (mB - mF);
    if (between > maxBetween) {
      maxBetween = between;
      thresholdBin = i;
    }
  }

  return (thresholdBin / (bins - 1)) * maxV;
}

function openMask(mask, width, height) {
  return dilate(erode(mask, width, height), width, height);
}

function closeMask(mask, width, height) {
  return erode(dilate(mask, width, height), width, height);
}

function erode(mask, width, height) {
  const out = new Uint8Array(mask.length);
  for (let y = 1; y < height - 1; y += 1) {
    for (let x = 1; x < width - 1; x += 1) {
      const idx = y * width + x;
      let keep = 1;
      for (let yy = -1; yy <= 1; yy += 1) {
        for (let xx = -1; xx <= 1; xx += 1) {
          if (mask[idx + yy * width + xx] === 0) {
            keep = 0;
            yy = 2;
            break;
          }
        }
      }
      out[idx] = keep;
    }
  }
  return out;
}

function dilate(mask, width, height) {
  const out = new Uint8Array(mask.length);
  for (let y = 1; y < height - 1; y += 1) {
    for (let x = 1; x < width - 1; x += 1) {
      const idx = y * width + x;
      let on = 0;
      for (let yy = -1; yy <= 1; yy += 1) {
        for (let xx = -1; xx <= 1; xx += 1) {
          if (mask[idx + yy * width + xx] === 1) {
            on = 1;
            yy = 2;
            break;
          }
        }
      }
      out[idx] = on;
    }
  }
  return out;
}

function selectBestComponent(mask, width, height) {
  const visited = new Uint8Array(mask.length);
  const queue = new Int32Array(mask.length);
  const out = new Uint8Array(mask.length);
  const cx = width / 2;
  const cy = height / 2;
  const maxDist = Math.hypot(cx, cy) || 1;
  let bestScore = -1;

  for (let start = 0; start < mask.length; start += 1) {
    if (mask[start] !== 1 || visited[start] === 1) continue;
    let qh = 0;
    let qt = 0;
    queue[qt] = start;
    qt += 1;
    visited[start] = 1;

    const comp = [];
    let size = 0;
    let sumX = 0;
    let sumY = 0;
    let touchesBorder = false;

    while (qh < qt) {
      const idx = queue[qh];
      qh += 1;
      comp.push(idx);
      size += 1;
      const x = idx % width;
      const y = (idx - x) / width;
      sumX += x;
      sumY += y;
      if (x === 0 || y === 0 || x === width - 1 || y === height - 1) touchesBorder = true;

      const neigh = [idx - 1, idx + 1, idx - width, idx + width];
      for (let n = 0; n < 4; n += 1) {
        const ni = neigh[n];
        if (ni < 0 || ni >= mask.length) continue;
        const nx = ni % width;
        if ((n === 0 && nx > x) || (n === 1 && nx < x)) continue;
        if (mask[ni] !== 1 || visited[ni] === 1) continue;
        visited[ni] = 1;
        queue[qt] = ni;
        qt += 1;
      }
    }

    const mx = sumX / Math.max(1, size);
    const my = sumY / Math.max(1, size);
    const centerBonus = 1 + (1 - Math.min(1, Math.hypot(mx - cx, my - cy) / maxDist));
    const borderPenalty = touchesBorder ? 0.2 : 1;
    const score = size * centerBonus * borderPenalty;

    if (score > bestScore) {
      bestScore = score;
      out.fill(0);
      for (let i = 0; i < comp.length; i += 1) out[comp[i]] = 1;
    }
  }

  return out;
}

function countOnes(mask) {
  let n = 0;
  for (let i = 0; i < mask.length; i += 1) n += mask[i];
  return n;
}

function pointerToCanvasPx(event, canvasEl) {
  const rect = canvasEl.getBoundingClientRect();
  const scaleX = canvasEl.width / Math.max(1, rect.width);
  const scaleY = canvasEl.height / Math.max(1, rect.height);
  const x = (event.clientX - rect.left) * scaleX;
  const y = (event.clientY - rect.top) * scaleY;
  return {
    x: Math.max(0, Math.min(canvasEl.width - 1, x)),
    y: Math.max(0, Math.min(canvasEl.height - 1, y))
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
      if (pointInPolygon(x + 0.5, y + 0.5, polygon)) {
        mask[y * width + x] = 1;
      }
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

function computeMaskCenterScore(mask, width, height) {
  let sumX = 0;
  let sumY = 0;
  let cnt = 0;
  for (let i = 0; i < mask.length; i += 1) {
    if (mask[i] !== 1) continue;
    const x = i % width;
    const y = (i - x) / width;
    sumX += x;
    sumY += y;
    cnt += 1;
  }
  if (cnt === 0) return 0;
  const cx = width / 2;
  const cy = height / 2;
  const mx = sumX / cnt;
  const my = sumY / cnt;
  const d = Math.hypot(mx - cx, my - cy);
  const maxD = Math.hypot(cx, cy) || 1;
  return 1 - Math.min(1, d / maxD);
}

function buildCenterFallbackMask(width, height) {
  const mask = new Uint8Array(width * height);
  const cx = width / 2;
  const cy = height / 2;
  const rx = width * 0.28;
  const ry = height * 0.42;

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const nx = (x - cx) / rx;
      const ny = (y - cy) / ry;
      if ((nx * nx) + (ny * ny) <= 1.0) {
        mask[y * width + x] = 1;
      }
    }
  }

  // Leggera dilatazione per coprire bene l'oggetto centrale.
  return dilate(mask, width, height);
}

function weightedKMeans(points, requestedK, maxIterations) {
  const k = Math.min(requestedK, points.length);
  if (k === 0) return { centroids: [], counts: [] };

  const centroids = initCentroids(points, k);
  const counts = new Array(k).fill(0);

  for (let iter = 0; iter < maxIterations; iter += 1) {
    const sums = new Array(k).fill(0).map(() => [0, 0, 0]);
    const distanceFromCentroid = new Array(points.length).fill(0);
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

      distanceFromCentroid[i] = bestDist;
      counts[best] += p.w;
      sums[best][0] += p.rgb[0] * p.w;
      sums[best][1] += p.rgb[1] * p.w;
      sums[best][2] += p.rgb[2] * p.w;
    }

    let moved = false;
    for (let c = 0; c < k; c += 1) {
      if (counts[c] === 0) {
        const replacementIndex = farthestPointIndex(points, distanceFromCentroid);
        centroids[c] = [...points[replacementIndex].rgb];
        moved = true;
        continue;
      }

      const nr = Math.round(sums[c][0] / counts[c]);
      const ng = Math.round(sums[c][1] / counts[c]);
      const nb = Math.round(sums[c][2] / counts[c]);

      if (nr !== centroids[c][0] || ng !== centroids[c][1] || nb !== centroids[c][2]) moved = true;

      centroids[c][0] = nr;
      centroids[c][1] = ng;
      centroids[c][2] = nb;
    }

    if (!moved) break;
  }

  return { centroids, counts };
}

function initCentroids(points, k) {
  const centroids = [];
  let mostFrequent = 0;

  for (let i = 1; i < points.length; i += 1) {
    if (points[i].w > points[mostFrequent].w) mostFrequent = i;
  }
  centroids.push([...points[mostFrequent].rgb]);

  while (centroids.length < k) {
    let bestIndex = 0;
    let bestScore = -1;

    for (let i = 0; i < points.length; i += 1) {
      const p = points[i];
      let minDist = Number.POSITIVE_INFINITY;

      for (let c = 0; c < centroids.length; c += 1) {
        const d = colorDistanceSq(p.rgb, centroids[c]);
        if (d < minDist) minDist = d;
      }

      const score = minDist * p.w;
      if (score > bestScore) {
        bestScore = score;
        bestIndex = i;
      }
    }
    centroids.push([...points[bestIndex].rgb]);
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
  const lightness = (max + min) / 2 / 255;
  const saturation = max === 0 ? 0 : delta / max;

  let tone = "medio";
  if (lightness < 0.26) tone = "scuro";
  else if (lightness > 0.78) tone = "chiaro";

  let flavor = "";
  if (saturation < 0.16) {
    flavor = "";
  } else {
    const warm = r - b;
    const greenish = g - ((r + b) / 2);
    if (warm > 24) flavor = " caldo";
    else if (warm < -24) flavor = " freddo";
    else if (greenish > 22) flavor = " oliva";
  }

  return `${tone}${flavor}`;
}

function renderResults(rows) {
  const usedLabels = new Map();
  results.innerHTML = rows
    .map((row) => {
      const hex = toHex(row.rgb);
      const rgbText = `RGB(${row.rgb[0]}, ${row.rgb[1]}, ${row.rgb[2]})`;
      const base = colorNameFromRgb(row.rgb);
      const desc = colorDescriptor(row.rgb);
      const rawLabel = `${base} ${desc}`.trim();
      const seen = (usedLabels.get(rawLabel) || 0) + 1;
      usedLabels.set(rawLabel, seen);
      const hexTag = hex.slice(1, 5);
      const name = seen > 1 ? `${rawLabel} (${hexTag})` : rawLabel;
      return `
      <div class="result-row">
        <div class="swatch" style="background:${hex}"></div>
        <div class="hex">${name} • ${hex} • ${rgbText}</div>
        <div class="percent">${row.pct.toFixed(2)}%</div>
      </div>`;
    })
    .join("");
}
