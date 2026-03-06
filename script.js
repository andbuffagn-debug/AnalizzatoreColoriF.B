const imageInput = document.getElementById("imageInput");
const preview = document.getElementById("preview");
const canvas = document.getElementById("canvas");
const hint = document.getElementById("hint");
const results = document.getElementById("results");
const colorCount = document.getElementById("colorCount");
const colorCountValue = document.getElementById("colorCountValue");

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
  { name: "Azzurro", rgb: [135, 206, 235] },
  { name: "Marrone", rgb: [139, 69, 19] },
  { name: "Beige", rgb: [245, 245, 220] },
  { name: "Rosa", rgb: [255, 192, 203] },
  { name: "Grigio", rgb: [128, 128, 128] },
  { name: "Bianco", rgb: [255, 255, 255] },
  { name: "Nero", rgb: [0, 0, 0] }
];

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

  const sampleTarget = 45000;
  const totalPixels = width * height;
  const step = Math.max(1, Math.floor(Math.sqrt(totalPixels / sampleTarget)));

  for (let y = 0; y < height; y += step) {
    for (let x = 0; x < width; x += step) {
      const i = (y * width + x) * 4;
      if (data[i + 3] < 10) continue;

      const rq = data[i] >> 4;
      const gq = data[i + 1] >> 4;
      const bq = data[i + 2] >> 4;
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

function renderResults(rows) {
  hint.textContent = `Trovati ${rows.length} colori principali.`;
  results.innerHTML = rows
    .map((row) => {
      const hex = toHex(row.rgb);
      const name = colorNameFromRgb(row.rgb);
      return `
      <div class="result-row">
        <div class="swatch" style="background:${hex}"></div>
        <div class="hex">${name} (${hex})</div>
        <div class="percent">${row.pct.toFixed(2)}%</div>
      </div>`;
    })
    .join("");
}
