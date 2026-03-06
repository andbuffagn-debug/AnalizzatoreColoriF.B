const imageInput = document.getElementById("imageInput");
const preview = document.getElementById("preview");
const canvas = document.getElementById("canvas");
const hint = document.getElementById("hint");
const results = document.getElementById("results");
const colorCount = document.getElementById("colorCount");
const colorCountValue = document.getElementById("colorCountValue");
const c1Select = document.getElementById("c1Select");
const c2Select = document.getElementById("c2Select");
const c3Select = document.getElementById("c3Select");
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

let loadedImage = null;
let currentPalette = [];
const COLOR_LEXICON = [
  { name: "Rosso", rgb: [255, 0, 0] },
  { name: "Verde", rgb: [0, 128, 0] },
  { name: "Blu", rgb: [0, 0, 255] },
  { name: "Giallo", rgb: [255, 255, 0] },
  { name: "Arancione", rgb: [255, 165, 0] },
  { name: "Viola", rgb: [128, 0, 128] },
  { name: "Fucsia", rgb: [255, 0, 255] },
  { name: "Ciano", rgb: [0, 255, 255] },
  { name: "Turchese", rgb: [64, 224, 208] },
  { name: "Lime", rgb: [50, 205, 50] },
  { name: "Azzurro", rgb: [135, 206, 235] },
  { name: "Navy", rgb: [0, 0, 128] },
  { name: "Marrone", rgb: [139, 69, 19] },
  { name: "Beige", rgb: [245, 245, 220] },
  { name: "Crema", rgb: [255, 253, 208] },
  { name: "Oro", rgb: [255, 215, 0] },
  { name: "Argento", rgb: [192, 192, 192] },
  { name: "Corallo", rgb: [255, 127, 80] },
  { name: "Salvia", rgb: [188, 184, 138] },
  { name: "Rosa", rgb: [255, 192, 203] },
  { name: "Pesca", rgb: [255, 218, 185] },
  { name: "Bordeaux", rgb: [128, 0, 32] },
  { name: "Oliva", rgb: [128, 128, 0] },
  { name: "teal", rgb: [0, 128, 128] },
  { name: "Lavanda", rgb: [230, 230, 250] },
  { name: "Indaco", rgb: [75, 0, 130] },
  { name: "Grigio", rgb: [128, 128, 128] },
  { name: "Bianco", rgb: [255, 255, 255] },
  { name: "Nero", rgb: [0, 0, 0] }
];

colorCount.addEventListener("input", () => {
  colorCountValue.textContent = colorCount.value;
  if (loadedImage) analyzeImage(loadedImage);
});

[c1Select, c2Select, c3Select].forEach((el) => {
  el.addEventListener("change", () => {
    ensureDistinctSelections();
    updatePercentagesFromSelection();
    updateTriangle();
  });
});

imageInput.addEventListener("change", (event) => {
  const file = event.target.files?.[0];
  if (!file) return;

  const reader = new FileReader();
  reader.onload = () => {
    const img = new Image();
    img.onload = () => {
      loadedImage = img;
      preview.src = reader.result;
      analyzeImage(img);
    };
    img.src = reader.result;
  };
  reader.readAsDataURL(file);
});

function analyzeImage(img) {
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  const maxSide = 900;
  const scale = Math.min(1, maxSide / Math.max(img.width, img.height));
  const width = Math.max(1, Math.round(img.width * scale));
  const height = Math.max(1, Math.round(img.height * scale));

  canvas.width = width;
  canvas.height = height;
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(img, 0, 0, width, height);

  const data = ctx.getImageData(0, 0, width, height).data;
  const bins = new Map();

  // Campionamento adattivo, poi aggregazione in bin colore per analisi stabile.
  const sampleTarget = 45000;
  const totalPixels = width * height;
  const step = Math.max(1, Math.floor(Math.sqrt(totalPixels / sampleTarget)));

  for (let y = 0; y < height; y += step) {
    for (let x = 0; x < width; x += step) {
      const i = (y * width + x) * 4;
      const a = data[i + 3];
      if (a < 10) continue;
      const r = data[i];
      const g = data[i + 1];
      const b = data[i + 2];

      // 4 bit per canale: riduce il rumore senza perdere i colori dominanti.
      const rq = r >> 4;
      const gq = g >> 4;
      const bq = b >> 4;
      const key = (rq << 8) | (gq << 4) | bq;
      const entry = bins.get(key);
      if (entry) {
        entry.w += 1;
      } else {
        bins.set(key, { rgb: [rq * 16 + 8, gq * 16 + 8, bq * 16 + 8], w: 1 });
      }
    }
  }

  const points = [...bins.values()];
  if (points.length === 0) {
    hint.textContent = "Immagine non valida o senza pixel visibili.";
    results.innerHTML = "";
    return;
  }

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

  renderResults(rows);
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

      if (nr !== centroids[c][0] || ng !== centroids[c][1] || nb !== centroids[c][2]) {
        moved = true;
      }
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

  // Primo centroide: colore più frequente.
  let mostFrequent = 0;
  for (let i = 1; i < points.length; i += 1) {
    if (points[i].w > points[mostFrequent].w) mostFrequent = i;
  }
  centroids.push([...points[mostFrequent].rgb]);

  // Successivi: massima distanza pesata dal centroide più vicino.
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

function renderResults(rows) {
  currentPalette = rows.map((r) => {
    const hex = toHex(r.rgb);
    return {
      hex,
      name: colorNameFromRgb(r.rgb),
      pct: r.pct
    };
  });
  populateColorSelectors();

  hint.textContent = `Trovati ${rows.length} colori principali.`;
  results.innerHTML = currentPalette
    .map((row) => {
      const pct = row.pct.toFixed(2);
      return `
      <div class="result-row">
        <div class="swatch" style="background:${row.hex}"></div>
        <div class="hex">${row.name} (${row.hex})</div>
        <div class="percent">${pct}%</div>
      </div>`;
    })
    .join("");
}

function populateColorSelectors() {
  const fallback = [
    { hex: "#D45D5D", name: "Rosso", pct: 33.34 },
    { hex: "#2E86AB", name: "Blu", pct: 33.33 },
    { hex: "#9F7AEA", name: "Viola", pct: 33.33 }
  ];
  const palette = currentPalette.length > 0 ? currentPalette : fallback;
  const selects = [c1Select, c2Select, c3Select];

  selects.forEach((select) => {
    const previous = select.value;
    select.innerHTML = palette
      .map((item) => `<option value="${item.hex}">${item.name} (${item.hex})</option>`)
      .join("");
    if (palette.some((item) => item.hex === previous)) {
      select.value = previous;
    }
  });

  if (palette.length >= 3) {
    c1Select.value = palette[0].hex;
    c2Select.value = palette[1].hex;
    c3Select.value = palette[2].hex;
  } else if (palette.length === 2) {
    c1Select.value = palette[0].hex;
    c2Select.value = palette[1].hex;
    c3Select.value = palette[0].hex;
  } else {
    c1Select.value = palette[0].hex;
    c2Select.value = palette[0].hex;
    c3Select.value = palette[0].hex;
  }

  ensureDistinctSelections();
  updatePercentagesFromSelection();
  updateTriangle();
}

function ensureDistinctSelections() {
  const palette = [
    ...new Set(
      [...c1Select.options].map((opt) => opt.value).filter((value) => Boolean(value))
    )
  ];
  if (palette.length < 3) return;

  const picks = [c1Select.value, c2Select.value, c3Select.value];
  const used = new Set();

  for (let i = 0; i < picks.length; i += 1) {
    if (!used.has(picks[i])) {
      used.add(picks[i]);
      continue;
    }
    const replacement = palette.find((hex) => !used.has(hex));
    if (replacement) {
      picks[i] = replacement;
      used.add(replacement);
    }
  }

  c1Select.value = picks[0];
  c2Select.value = picks[1];
  c3Select.value = picks[2];
}

function updatePercentagesFromSelection() {
  const selected = [c1Select.value, c2Select.value, c3Select.value];
  const baseValues = selected.map((hex) => getDetectedPercentage(hex));
  const baseSum = baseValues[0] + baseValues[1] + baseValues[2];

  let values = [33.34, 33.33, 33.33];
  if (baseSum > 0) {
    values = baseValues.map((v) => (v / baseSum) * 100);
    values = [round2(values[0]), round2(values[1]), round2(values[2])];
    const fix = round2(100 - (values[0] + values[1] + values[2]));
    values[2] = round2(values[2] + fix);
  }

  c1Pct.value = values[0].toFixed(2);
  c2Pct.value = values[1].toFixed(2);
  c3Pct.value = values[2].toFixed(2);
}

function clampNumber(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return 0;
  return Math.max(0, Math.min(100, n));
}

function round2(n) {
  return Math.round(n * 100) / 100;
}

function updateTriangle() {
  const c1 = c1Select.value || "#D45D5D";
  const c2 = c2Select.value || "#2E86AB";
  const c3 = c3Select.value || "#9F7AEA";
  const c1Name = getSelectedColorName(c1Select, c1);
  const c2Name = getSelectedColorName(c2Select, c2);
  const c3Name = getSelectedColorName(c3Select, c3);

  c1Swatch.style.background = c1;
  c2Swatch.style.background = c2;
  c3Swatch.style.background = c3;

  const p1 = clampNumber(c1Pct.value);
  const p2 = clampNumber(c2Pct.value);
  const p3 = clampNumber(c3Pct.value);
  const total = round2(p1 + p2 + p3);
  mixTotal.textContent = `Totale: ${total.toFixed(2)}%`;

  const A = { x: 200, y: 36 };
  const B = { x: 62, y: 276 };
  const C = { x: 338, y: 276 };

  drawParallelToOpposite(lineC1, B, A, C, A, p1 / 100, c1);
  drawParallelToOpposite(lineC2, A, B, C, B, p2 / 100, c2);
  drawParallelToOpposite(lineC3, A, C, B, C, p3 / 100, c3);

  labelC1.textContent = `C1 ${c1Name} ${c1} (${p1.toFixed(2)}%)`;
  labelC2.textContent = `C2 ${c2Name} ${c2} (${p2.toFixed(2)}%)`;
  labelC3.textContent = `C3 ${c3Name} ${c3} (${p3.toFixed(2)}%)`;

  updateStreckeisenPoints(p1, p2, p3, A, B, C);
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
  return {
    x: a.x + (b.x - a.x) * t,
    y: a.y + (b.y - a.y) * t
  };
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

function getDetectedPercentage(hex) {
  const found = currentPalette.find((item) => item.hex === hex);
  return found ? found.pct : 0;
}

function getColorNameByHex(hex) {
  const found = currentPalette.find((item) => item.hex === hex);
  if (found) return found.name;
  return colorNameFromRgb(hexToRgb(hex));
}

function getSelectedColorName(selectEl, hex) {
  const option = [...selectEl.options].find((opt) => opt.value === hex);
  if (!option) return getColorNameByHex(hex);
  return option.textContent.replace(/\s+\(#?[0-9A-Fa-f]{6}\)\s*$/, "");
}

function colorNameFromRgb(rgb) {
  let bestName = "Colore";
  let bestDistance = Number.POSITIVE_INFINITY;

  for (let i = 0; i < COLOR_LEXICON.length; i += 1) {
    const entry = COLOR_LEXICON[i];
    const d = colorDistanceSq(rgb, entry.rgb);
    if (d < bestDistance) {
      bestDistance = d;
      bestName = entry.name;
    }
  }

  return bestName;
}

function hexToRgb(hex) {
  const clean = hex.replace("#", "");
  if (clean.length !== 6) return [0, 0, 0];
  return [
    parseInt(clean.slice(0, 2), 16),
    parseInt(clean.slice(2, 4), 16),
    parseInt(clean.slice(4, 6), 16)
  ];
}

populateColorSelectors();
