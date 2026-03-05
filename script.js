const imageInput = document.getElementById("imageInput");
const preview = document.getElementById("preview");
const canvas = document.getElementById("canvas");
const hint = document.getElementById("hint");
const results = document.getElementById("results");
const colorCount = document.getElementById("colorCount");
const colorCountValue = document.getElementById("colorCountValue");

let loadedImage = null;

colorCount.addEventListener("input", () => {
  colorCountValue.textContent = colorCount.value;
  if (loadedImage) analyzeImage(loadedImage);
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
  hint.textContent = `Trovati ${rows.length} colori principali.`;
  results.innerHTML = rows
    .map((row) => {
      const hex = toHex(row.rgb);
      const pct = row.pct.toFixed(2);
      return `
      <div class="result-row">
        <div class="swatch" style="background:${hex}"></div>
        <div class="hex">${hex}</div>
        <div class="percent">${pct}%</div>
      </div>`;
    })
    .join("");
}
