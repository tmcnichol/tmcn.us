// 2-Photo Rubik's Cube Face Scanner
// Extracts 6 face colors from 2 photos using draggable grid overlays

class PhotoScanner {
    constructor(app) {
        this.app = app;
        this.step = 1; // 1 = U/F/R, 2 = D/B/L
        this.image = null;
        this.canvas = null;
        this.ctx = null;
        this.displayScale = 1;
        this.quads = []; // 3 quads per photo
        this.dragging = null; // {quadIdx, cornerIdx}
        this.extractedColors = {}; // face index -> [9 color codes]

        // Face assignments per step
        // Each face includes an index remap to handle perspective orientation.
        // The remap converts [sampled grid position 0-8] -> [cube model position 0-8].
        // Grid positions are sampled as:  0 1 2 / 3 4 5 / 6 7 8  (row-major, TL to BR of quad)
        //
        // Step 1 (U/F/R corner view):
        //   U face: as seen from top-front-right, the quad's TL is actually the cube's UFL corner.
        //           Need 90° CW rotation: sampled[0]->model[2], [1]->[5], [2]->[8], etc.
        //   F and R faces: viewed head-on from the corner, no rotation needed.
        //
        // Step 2 (D/B/L corner view):
        //   D face: as seen from bottom-back-left, need 90° CW rotation (same as U).
        //   B and L faces: no rotation needed.

        const ROT_NONE = [0,1,2,3,4,5,6,7,8];
        const ROT_CW90 = [6,3,0,7,4,1,8,5,2];   // 90° clockwise
        const ROT_CCW90 = [2,5,8,1,4,7,0,3,6];   // 90° counter-clockwise
        const ROT_180 = [8,7,6,5,4,3,2,1,0];     // 180° rotation

        // remap: maps sampled grid indices to cube model positions (for storing to CubeModel)
        // previewRemap: maps sampled grid indices to preview display positions (to match photo orientation)
        this.faceMap = {
            1: [
                { face: U, name: 'U', color: '#FFD500', remap: ROT_CW90, previewRemap: ROT_CW90 },
                { face: F, name: 'F', color: '#009B48', remap: ROT_NONE, previewRemap: ROT_NONE },
                { face: R, name: 'R', color: '#FF5800', remap: ROT_NONE, previewRemap: ROT_NONE },
            ],
            2: [
                { face: D, name: 'D', color: '#FFFFFF', remap: ROT_CW90, previewRemap: ROT_CW90 },
                { face: B, name: 'B', color: '#0046AD', remap: ROT_NONE, previewRemap: ROT_NONE },
                { face: L, name: 'L', color: '#B71234', remap: ROT_NONE, previewRemap: ROT_NONE },
            ],
        };

        this._bound = {
            mouseDown: (e) => this._onMouseDown(e),
            mouseMove: (e) => this._onMouseMove(e),
            mouseUp: (e) => this._onMouseUp(e),
            touchStart: (e) => this._onTouchStart(e),
            touchMove: (e) => this._onTouchMove(e),
            touchEnd: (e) => this._onTouchEnd(e),
        };
    }

    // ==================== Modal Lifecycle ====================

    open() {
        this.step = 1;
        this.extractedColors = {};
        this.image = null;
        this.quads = [];

        const modal = document.getElementById('photoScanModal');
        modal.classList.remove('hidden');
        this._updateStepUI();

        this.canvas = document.getElementById('scanCanvas');
        this.ctx = this.canvas.getContext('2d');

        document.getElementById('scanPhotoInput').value = '';
        document.getElementById('scanPhotoInput').onchange = (e) => this._loadImage(e);
        document.getElementById('scanConfirmBtn').onclick = () => this._confirm();
        document.getElementById('scanCancelBtn').onclick = () => this.close();
        document.getElementById('scanCloseBtn').onclick = () => this.close();

        this.canvas.addEventListener('mousedown', this._bound.mouseDown);
        this.canvas.addEventListener('mousemove', this._bound.mouseMove);
        window.addEventListener('mouseup', this._bound.mouseUp);
        this.canvas.addEventListener('touchstart', this._bound.touchStart, { passive: false });
        this.canvas.addEventListener('touchmove', this._bound.touchMove, { passive: false });
        window.addEventListener('touchend', this._bound.touchEnd);

        // Clear canvas
        this.canvas.width = 500;
        this.canvas.height = 400;
        this.ctx.fillStyle = '#1a1a2e';
        this.ctx.fillRect(0, 0, 500, 400);
        this.ctx.fillStyle = '#555';
        this.ctx.font = '16px sans-serif';
        this.ctx.textAlign = 'center';
        this.ctx.fillText('Upload a photo to begin', 250, 200);

        this._clearPreviews();
        document.getElementById('scanConfirmBtn').disabled = true;
    }

    close() {
        document.getElementById('photoScanModal').classList.add('hidden');
        this.canvas.removeEventListener('mousedown', this._bound.mouseDown);
        this.canvas.removeEventListener('mousemove', this._bound.mouseMove);
        window.removeEventListener('mouseup', this._bound.mouseUp);
        this.canvas.removeEventListener('touchstart', this._bound.touchStart);
        this.canvas.removeEventListener('touchmove', this._bound.touchMove);
        window.removeEventListener('touchend', this._bound.touchEnd);
    }

    _updateStepUI() {
        const faces = this.faceMap[this.step];
        const faceNames = faces.map(f => f.name).join(' / ');
        document.getElementById('scanTitle').textContent =
            `Step ${this.step} of 2: Scan ${faceNames} Faces`;
        document.getElementById('scanConfirmBtn').textContent =
            this.step === 1 ? 'Confirm & Next' : 'Confirm & Apply';

        // Update preview labels
        for (let i = 0; i < 3; i++) {
            const preview = document.getElementById(`scanFace${i}`);
            if (preview) {
                preview.querySelector('.scan-face-label').textContent = faces[i].name;
                preview.querySelector('.scan-face-label').style.color = faces[i].color;
            }
        }
    }

    _clearPreviews() {
        for (let i = 0; i < 3; i++) {
            const grid = document.querySelector(`#scanFace${i} .scan-face-grid`);
            if (!grid) continue;
            grid.innerHTML = '';
            for (let j = 0; j < 9; j++) {
                const cell = document.createElement('div');
                cell.className = 'scan-preview-cell';
                cell.style.backgroundColor = '#333';
                grid.appendChild(cell);
            }
        }
    }

    // ==================== Image Loading ====================

    _loadImage(e) {
        const file = e.target.files[0];
        if (!file) return;

        const reader = new FileReader();
        reader.onload = (ev) => {
            const img = new Image();
            img.onload = () => {
                this.image = img;
                const maxW = 600, maxH = 500;
                let w = img.width, h = img.height;
                if (w > maxW) { h *= maxW / w; w = maxW; }
                if (h > maxH) { w *= maxH / h; h = maxH; }
                w = Math.round(w);
                h = Math.round(h);

                this.canvas.width = w;
                this.canvas.height = h;
                this.displayScale = w / img.width;

                // Try auto-detection first, fall back to default quads
                const detected = this._autoDetectFaces(w, h);
                if (detected) {
                    this.quads = detected;
                    this._links = this._buildLinks();
                } else {
                    this._initDefaultQuads(w, h);
                }
                this._redraw();
                this._updatePreviews();
                document.getElementById('scanConfirmBtn').disabled = false;
            };
            img.src = ev.target.result;
        };
        reader.readAsDataURL(file);
    }

    // ==================== Default Quad Positions ====================

    _initDefaultQuads(w, h) {
        const cx = w / 2, cy = h / 2;
        const s = Math.min(w, h) * 0.28; // face size

        if (this.step === 1) {
            // U/F/R corner — large faces filling the photo
            const center = { x: cx - s * 0.1, y: cy - s * 0.2 };    // 3-way junction (slightly left/up of center)
            const uTL = { x: cx - s * 1.5, y: cy - s * 0.8 };       // U+F shared left
            const uTR = { x: cx + s * 0.4, y: cy - s * 1.6 };       // U top-right
            const uR  = { x: cx + s * 1.5, y: cy - s * 0.6 };       // U+R shared right
            const fBL = { x: cx - s * 1.5, y: cy + s * 1.0 };       // F bottom-left
            const bot  = { x: cx - s * 0.1, y: cy + s * 1.5 };      // F+R shared bottom
            const rBR = { x: cx + s * 1.5, y: cy + s * 1.0 };       // R bottom-right

            this.quads = [
                [uTL, uTR, uR, center],          // U face
                [uTL, center, bot, fBL],          // F face
                [center, uR, rBR, bot],           // R face
            ];
        } else {
            // D/B/L corner — large faces filling the photo (mirrored)
            const center = { x: cx + s * 0.1, y: cy + s * 0.2 };    // 3-way junction
            const dBR = { x: cx + s * 1.5, y: cy + s * 0.8 };       // D+L shared right
            const dBL = { x: cx - s * 0.4, y: cy + s * 1.6 };       // D bottom-left
            const dL  = { x: cx - s * 1.5, y: cy + s * 0.6 };       // D+B shared left
            const lTR = { x: cx + s * 1.5, y: cy - s * 1.0 };       // L top-right
            const top  = { x: cx + s * 0.1, y: cy - s * 1.5 };      // B+L shared top
            const bTL = { x: cx - s * 1.5, y: cy - s * 1.0 };       // B top-left

            this.quads = [
                [center, dBR, dBL, dL],           // D face
                [bTL, top, center, dL],            // B face
                [top, lTR, dBR, center],           // L face
            ];
        }
        this._links = this._buildLinks();
    }

    _buildLinks() {
        const links = {};
        // "same" groups: corners that snap to the same position
        const shared = this.step === 1
            ? [
                [[0,0], [1,0]],         // U TL = F TL (left edge)
                [[0,2], [2,1]],         // U BR = R TR (right edge)
                [[0,3], [1,1], [2,0]],  // U BL = F TR = R TL (3-way center junction)
                [[1,2], [2,3]],         // F BR = R BL (bottom)
              ]
            : [
                [[0,0], [1,2], [2,3]],  // D TL = B BR = L BL (3-way center junction)
                [[0,1], [2,2]],         // D BR = L BR (right edge)
                [[0,3], [1,3]],         // D BL = B BL (left edge)
                [[1,1], [2,0]],         // B TR = L TL (top)
              ];
        for (const group of shared) {
            for (let i = 0; i < group.length; i++) {
                const k = group[i][0]+','+group[i][1];
                links[k] = links[k] || [];
                for (let j = 0; j < group.length; j++) {
                    if (i !== j) links[k].push({q: group[j][0], c: group[j][1], mode: 'same'});
                }
            }
        }
        // "delta" links: corners that move by the same delta (for 3-way center junction)
        // The center junction (F[1]=R[0] or B[2]=L[3]) is the middle of U's/D's bottom edge.
        // When center is dragged, also move the U/D corners that bracket it.
        const deltaLinks = [];
        for (const [sourceKey, ...targets] of deltaLinks) {
            links[sourceKey] = links[sourceKey] || [];
            for (const [q, c] of targets) {
                links[sourceKey].push({q, c, mode: 'delta'});
            }
        }
        return links;
    }

    // ==================== Auto-Detection ====================

    _rgbToHsl(r, g, b) {
        r /= 255; g /= 255; b /= 255;
        const max = Math.max(r, g, b), min = Math.min(r, g, b);
        const l = (max + min) / 2;
        const d = max - min;
        const s = d < 0.001 ? 0 : d / (1 - Math.abs(2 * l - 1) + 0.0001);
        let h = 0;
        if (d > 0.001) {
            if (max === r) h = ((g - b) / d) % 6;
            else if (max === g) h = (b - r) / d + 2;
            else h = (r - g) / d + 4;
            h *= 60;
            if (h < 0) h += 360;
        }
        return { h, s, l };
    }

    _computeIntegralImage(gray, w, h) {
        const integral = new Float64Array(w * h);
        for (let y = 0; y < h; y++) {
            let rowSum = 0;
            for (let x = 0; x < w; x++) {
                rowSum += gray[y * w + x];
                integral[y * w + x] = rowSum + (y > 0 ? integral[(y - 1) * w + x] : 0);
            }
        }
        return integral;
    }

    _integralSum(integral, w, x0, y0, x1, y1) {
        const a = x0 > 0 && y0 > 0 ? integral[(y0 - 1) * w + x0 - 1] : 0;
        const b = y0 > 0 ? integral[(y0 - 1) * w + x1] : 0;
        const c = x0 > 0 ? integral[y1 * w + x0 - 1] : 0;
        const d = integral[y1 * w + x1];
        return d - b - c + a;
    }

    _sobelMagnitude(gray, w, h) {
        const mag = new Float32Array(w * h);
        for (let y = 1; y < h - 1; y++) {
            for (let x = 1; x < w - 1; x++) {
                const i = y * w + x;
                const gx = -gray[i - w - 1] + gray[i - w + 1]
                         - 2 * gray[i - 1] + 2 * gray[i + 1]
                         - gray[i + w - 1] + gray[i + w + 1];
                const gy = -gray[i - w - 1] - 2 * gray[i - w] - gray[i - w + 1]
                         + gray[i + w - 1] + 2 * gray[i + w] + gray[i + w + 1];
                mag[i] = Math.sqrt(gx * gx + gy * gy);
            }
        }
        return mag;
    }

    _buildBorderMask(data, w, h) {
        // Convert to grayscale
        const gray = new Float32Array(w * h);
        for (let i = 0; i < w * h; i++) {
            gray[i] = 0.299 * data[i * 4] + 0.587 * data[i * 4 + 1] + 0.114 * data[i * 4 + 2];
        }

        // Integral image for adaptive thresholding
        const integral = this._computeIntegralImage(gray, w, h);
        const radius = Math.max(4, Math.round(Math.min(w, h) * 0.08));

        // Sobel edge magnitude
        const edgeMag = this._sobelMagnitude(gray, w, h);

        // Compute adaptive threshold for edge magnitude
        const edgeIntegral = this._computeIntegralImage(edgeMag, w, h);

        // Build border mask: dark relative to neighborhood AND has edge structure
        const mask = new Uint8Array(w * h);
        for (let y = 1; y < h - 1; y++) {
            for (let x = 1; x < w - 1; x++) {
                const i = y * w + x;
                // Local mean brightness
                const x0 = Math.max(0, x - radius), y0 = Math.max(0, y - radius);
                const x1 = Math.min(w - 1, x + radius), y1 = Math.min(h - 1, y + radius);
                const area = (x1 - x0 + 1) * (y1 - y0 + 1);
                const localMean = this._integralSum(integral, w, x0, y0, x1, y1) / area;
                const localEdgeMean = this._integralSum(edgeIntegral, w, x0, y0, x1, y1) / area;

                // Pixel is a border if darker than neighborhood AND has edge energy
                const isDark = gray[i] < localMean - 25;
                const hasEdge = edgeMag[i] > Math.max(localEdgeMean * 0.8, 15);
                mask[i] = (isDark && hasEdge) ? 1 : 0;
            }
        }
        return mask;
    }

    _scoreWindowGrid(borderMask, w, x0, y0, winW, winH) {
        // Project border pixels onto horizontal and vertical axes
        const hProj = new Float32Array(winH);
        const vProj = new Float32Array(winW);
        let totalBorder = 0;

        for (let dy = 0; dy < winH; dy++) {
            for (let dx = 0; dx < winW; dx++) {
                const val = borderMask[(y0 + dy) * w + (x0 + dx)];
                if (val) {
                    hProj[dy]++;
                    vProj[dx]++;
                    totalBorder++;
                }
            }
        }

        if (totalBorder < 5) return 0;

        // Score peakiness: high variance in projections = grid lines
        const hMean = totalBorder / winH;
        const vMean = totalBorder / winW;
        let hVar = 0, vVar = 0;
        for (let i = 0; i < winH; i++) hVar += (hProj[i] - hMean) * (hProj[i] - hMean);
        for (let i = 0; i < winW; i++) vVar += (vProj[i] - vMean) * (vProj[i] - vMean);
        hVar /= winH;
        vVar /= winW;

        // Normalize by mean to get coefficient of variation
        const hScore = hMean > 0 ? Math.sqrt(hVar) / hMean : 0;
        const vScore = vMean > 0 ? Math.sqrt(vVar) / vMean : 0;

        // Density: proportion of pixels that are borders
        const density = totalBorder / (winW * winH);

        // Combined score: needs both axes to have structure AND reasonable density
        return hScore * vScore * density * 1000;
    }

    _findCubeByGridDensity(borderMask, data, w, h) {
        // Build a saturation density map: for each pixel, is it a vivid cube-like color?
        // Then find the tightest bounding box around the densest cluster of vivid pixels.
        const vivid = new Uint8Array(w * h);
        let vividCount = 0;
        for (let i = 0; i < w * h; i++) {
            const r = data[i * 4], g = data[i * 4 + 1], b = data[i * 4 + 2];
            const hsl = this._rgbToHsl(r, g, b);
            // Vivid: high saturation cube colors (not wood/skin tones)
            // Exclude warm browns/skin (hue 10-45, moderate sat)
            const isWarmBrown = hsl.h >= 10 && hsl.h <= 45 && hsl.s < 0.8;
            const isVivid = hsl.s > 0.45 && !isWarmBrown && hsl.l > 0.15 && hsl.l < 0.85;
            const isWhite = hsl.l > 0.85 && hsl.s < 0.2;
            if (isVivid || isWhite) {
                vivid[i] = 1;
                vividCount++;
            }
        }

        if (vividCount < w * h * 0.02) return null; // Too few vivid pixels

        // Find the center of mass of vivid pixels
        let sumX = 0, sumY = 0, count = 0;
        for (let y = 0; y < h; y++) {
            for (let x = 0; x < w; x++) {
                if (vivid[y * w + x]) { sumX += x; sumY += y; count++; }
            }
        }
        const cx = sumX / count, cy = sumY / count;

        // Compute standard deviation to estimate cube size
        let varX = 0, varY = 0;
        for (let y = 0; y < h; y++) {
            for (let x = 0; x < w; x++) {
                if (vivid[y * w + x]) {
                    varX += (x - cx) * (x - cx);
                    varY += (y - cy) * (y - cy);
                }
            }
        }
        const stdX = Math.sqrt(varX / count);
        const stdY = Math.sqrt(varY / count);

        // Bounding box = centroid ± 1.8 * std dev (covers ~95% of vivid pixels)
        const spread = 1.8;
        const minX = Math.max(0, Math.round(cx - stdX * spread));
        const maxX = Math.min(w - 1, Math.round(cx + stdX * spread));
        const minY = Math.max(0, Math.round(cy - stdY * spread));
        const maxY = Math.min(h - 1, Math.round(cy + stdY * spread));

        if (maxX - minX < 5 || maxY - minY < 5) return null;

        return { minX, maxX, minY, maxY, cx, cy, score: count };
    }

    _validateCubeCandidate(data, w, h, bbox) {
        // Sample points within the bbox and check for color diversity
        const hueBins = new Array(12).fill(0); // 30-degree bins
        let samples = 0;
        for (let gy = 0; gy < 5; gy++) {
            for (let gx = 0; gx < 5; gx++) {
                const sx = Math.round(bbox.minX + (gx + 0.5) / 5 * (bbox.maxX - bbox.minX));
                const sy = Math.round(bbox.minY + (gy + 0.5) / 5 * (bbox.maxY - bbox.minY));
                if (sx < 0 || sx >= w || sy < 0 || sy >= h) continue;
                const pi = (sy * w + sx) * 4;
                const hsl = this._rgbToHsl(data[pi], data[pi + 1], data[pi + 2]);
                if (hsl.s > 0.2) {
                    hueBins[Math.floor(hsl.h / 30) % 12]++;
                }
                samples++;
            }
        }
        // Count distinct hue clusters (bins with > 0 samples)
        const activeBins = hueBins.filter(b => b > 0).length;
        return activeBins >= 3; // Need at least 3 distinct hue regions
    }

    _autoDetectFaces(canvasW, canvasH) {
        try {
            // Downscale for analysis
            const scale = 0.25;
            const aw = Math.round(canvasW * scale);
            const ah = Math.round(canvasH * scale);
            const aCanvas = document.createElement('canvas');
            aCanvas.width = aw;
            aCanvas.height = ah;
            const aCtx = aCanvas.getContext('2d');
            aCtx.drawImage(this.image, 0, 0, aw, ah);
            const imageData = aCtx.getImageData(0, 0, aw, ah);
            const data = imageData.data;

            // Stage 1: Build border mask (dark edges between stickers)
            const borderMask = this._buildBorderMask(data, aw, ah);

            // Stage 2: Find cube by grid density + color diversity scoring
            const region = this._findCubeByGridDensity(borderMask, data, aw, ah);
            if (!region) return null;

            // Stage 3: Validate with color diversity
            if (!this._validateCubeCandidate(data, aw, ah, region)) return null;

            // Scale region to canvas coordinates
            const invScale = 1 / scale;
            const left = region.minX * invScale;
            const right = region.maxX * invScale;
            const top = region.minY * invScale;
            const bottom = region.maxY * invScale;
            const cubeW = right - left;
            const cubeH = bottom - top;

            // Place quads using proportional bounding-box placement
            if (this.step === 1) {
                const jx = left + cubeW * 0.50;
                const jy = top + cubeH * 0.40;
                return [
                    [
                        { x: left + cubeW * 0.05, y: top + cubeH * 0.15 },
                        { x: left + cubeW * 0.55, y: top },
                        { x: right - cubeW * 0.02, y: top + cubeH * 0.18 },
                        { x: jx, y: jy },
                    ],
                    [
                        { x: left + cubeW * 0.05, y: top + cubeH * 0.15 },
                        { x: jx, y: jy },
                        { x: left + cubeW * 0.50, y: bottom },
                        { x: left + cubeW * 0.02, y: bottom - cubeH * 0.1 },
                    ],
                    [
                        { x: jx, y: jy },
                        { x: right - cubeW * 0.02, y: top + cubeH * 0.18 },
                        { x: right, y: bottom - cubeH * 0.12 },
                        { x: left + cubeW * 0.50, y: bottom },
                    ],
                ];
            } else {
                const jx = left + cubeW * 0.50;
                const jy = top + cubeH * 0.60;
                return [
                    [
                        { x: jx, y: jy },
                        { x: right - cubeW * 0.02, y: bottom - cubeH * 0.18 },
                        { x: left + cubeW * 0.45, y: bottom },
                        { x: left + cubeW * 0.02, y: bottom - cubeH * 0.15 },
                    ],
                    [
                        { x: left, y: top + cubeH * 0.12 },
                        { x: left + cubeW * 0.50, y: top },
                        { x: jx, y: jy },
                        { x: left + cubeW * 0.02, y: bottom - cubeH * 0.15 },
                    ],
                    [
                        { x: left + cubeW * 0.50, y: top },
                        { x: right, y: top + cubeH * 0.1 },
                        { x: right - cubeW * 0.02, y: bottom - cubeH * 0.18 },
                        { x: jx, y: jy },
                    ],
                ];
            }
        } catch (e) {
            console.warn('Auto-detection failed:', e);
            return null;
        }
    }

    // ==================== Drawing ====================

    _redraw() {
        if (!this.image) return;
        const ctx = this.ctx;
        const w = this.canvas.width, h = this.canvas.height;

        // Draw image
        ctx.drawImage(this.image, 0, 0, w, h);

        // Draw each quad overlay
        const faces = this.faceMap[this.step];
        for (let qi = 0; qi < this.quads.length; qi++) {
            const quad = this.quads[qi];
            const face = faces[qi];

            // Draw quad outline
            ctx.beginPath();
            ctx.moveTo(quad[0].x, quad[0].y);
            for (let i = 1; i < 4; i++) ctx.lineTo(quad[i].x, quad[i].y);
            ctx.closePath();
            ctx.strokeStyle = face.color;
            ctx.lineWidth = 2.5;
            ctx.stroke();

            // Semi-transparent fill
            ctx.fillStyle = face.color + '15';
            ctx.fill();

            // Draw 3x3 grid lines inside quad
            ctx.strokeStyle = face.color + '60';
            ctx.lineWidth = 1;
            for (let i = 1; i < 3; i++) {
                const u = i / 3;
                // Horizontal-ish line
                const lStart = this._bilinear(quad, 0, u);
                const lEnd = this._bilinear(quad, 1, u);
                ctx.beginPath();
                ctx.moveTo(lStart.x, lStart.y);
                ctx.lineTo(lEnd.x, lEnd.y);
                ctx.stroke();
                // Vertical-ish line
                const tStart = this._bilinear(quad, u, 0);
                const tEnd = this._bilinear(quad, u, 1);
                ctx.beginPath();
                ctx.moveTo(tStart.x, tStart.y);
                ctx.lineTo(tEnd.x, tEnd.y);
                ctx.stroke();
            }

            // Draw 9 sample point indicators
            const colors = this._sampleQuad(qi);
            for (let row = 0; row < 3; row++) {
                for (let col = 0; col < 3; col++) {
                    const u = (col + 0.5) / 3;
                    const v = (row + 0.5) / 3;
                    const pt = this._bilinear(quad, u, v);
                    const colorName = colors[row * 3 + col];
                    ctx.beginPath();
                    ctx.arc(pt.x, pt.y, 6, 0, Math.PI * 2);
                    ctx.fillStyle = COLOR_HEX[colorName];
                    ctx.fill();
                    ctx.strokeStyle = '#000';
                    ctx.lineWidth = 1.5;
                    ctx.stroke();
                }
            }

            // Draw corner handles
            for (let ci = 0; ci < 4; ci++) {
                const pt = quad[ci];
                const isActive = this.dragging && this.dragging.quadIdx === qi && this.dragging.cornerIdx === ci;
                ctx.beginPath();
                ctx.arc(pt.x, pt.y, isActive ? 12 : 9, 0, Math.PI * 2);
                ctx.fillStyle = face.color;
                ctx.fill();
                ctx.strokeStyle = '#fff';
                ctx.lineWidth = 2;
                ctx.stroke();
            }

            // Face label near top-left corner
            const labelPt = quad[0];
            ctx.fillStyle = face.color;
            ctx.font = 'bold 14px sans-serif';
            ctx.textAlign = 'center';
            ctx.fillText(face.name, labelPt.x, labelPt.y - 14);
        }
    }

    // ==================== Bilinear Interpolation ====================

    _bilinear(quad, u, v) {
        // quad = [{x,y}, {x,y}, {x,y}, {x,y}] = TL, TR, BR, BL
        const tl = quad[0], tr = quad[1], br = quad[2], bl = quad[3];
        const topX = tl.x + (tr.x - tl.x) * u;
        const topY = tl.y + (tr.y - tl.y) * u;
        const botX = bl.x + (br.x - bl.x) * u;
        const botY = bl.y + (br.y - bl.y) * u;
        return {
            x: topX + (botX - topX) * v,
            y: topY + (botY - topY) * v,
        };
    }

    // ==================== Color Sampling ====================

    _sampleQuad(quadIdx) {
        const quad = this.quads[quadIdx];
        const colors = [];
        // We need a clean image to sample from (without overlays)
        // Use a temporary canvas
        const tmpCanvas = document.createElement('canvas');
        tmpCanvas.width = this.canvas.width;
        tmpCanvas.height = this.canvas.height;
        const tmpCtx = tmpCanvas.getContext('2d');
        tmpCtx.drawImage(this.image, 0, 0, tmpCanvas.width, tmpCanvas.height);

        for (let row = 0; row < 3; row++) {
            for (let col = 0; col < 3; col++) {
                const u = (col + 0.5) / 3;
                const v = (row + 0.5) / 3;
                const pt = this._bilinear(quad, u, v);
                const rgb = this._samplePixels(tmpCtx, tmpCanvas.width, tmpCanvas.height, pt.x, pt.y);
                colors.push(this.app.classifyColor(rgb.r, rgb.g, rgb.b));
            }
        }
        return colors;
    }

    _samplePixels(ctx, cw, ch, x, y) {
        const radius = Math.max(3, Math.floor(Math.min(cw, ch) / 120));
        const sx = Math.max(0, Math.floor(x) - radius);
        const sy = Math.max(0, Math.floor(y) - radius);
        const sw = Math.min(radius * 2 + 1, cw - sx);
        const sh = Math.min(radius * 2 + 1, ch - sy);
        if (sw <= 0 || sh <= 0) return { r: 128, g: 128, b: 128 };

        const data = ctx.getImageData(sx, sy, sw, sh).data;
        let rSum = 0, gSum = 0, bSum = 0, count = 0;
        for (let i = 0; i < data.length; i += 4) {
            rSum += data[i]; gSum += data[i + 1]; bSum += data[i + 2]; count++;
        }
        return { r: rSum / count, g: gSum / count, b: bSum / count };
    }

    // ==================== Preview Updates ====================

    _updatePreviews() {
        const faces = this.faceMap[this.step];
        for (let qi = 0; qi < this.quads.length; qi++) {
            const sampledColors = this._sampleQuad(qi);
            const premap = faces[qi].previewRemap;
            const grid = document.querySelector(`#scanFace${qi} .scan-face-grid`);
            if (!grid) continue;
            const cells = grid.querySelectorAll('.scan-preview-cell');
            for (let i = 0; i < 9 && i < cells.length; i++) {
                // Show rotated to match photo orientation
                cells[premap[i]].style.backgroundColor = COLOR_HEX[sampledColors[i]];
            }
        }
    }

    // ==================== Mouse/Touch Handlers ====================

    _canvasCoords(e) {
        const rect = this.canvas.getBoundingClientRect();
        return {
            x: (e.clientX - rect.left) * (this.canvas.width / rect.width),
            y: (e.clientY - rect.top) * (this.canvas.height / rect.height),
        };
    }

    _hitTestHandle(mx, my) {
        const threshold = 18;
        for (let qi = 0; qi < this.quads.length; qi++) {
            for (let ci = 0; ci < 4; ci++) {
                const pt = this.quads[qi][ci];
                const dx = mx - pt.x, dy = my - pt.y;
                if (dx * dx + dy * dy < threshold * threshold) {
                    return { quadIdx: qi, cornerIdx: ci };
                }
            }
        }
        return null;
    }

    _onMouseDown(e) {
        const { x, y } = this._canvasCoords(e);
        this.dragging = this._hitTestHandle(x, y);
        if (this.dragging) {
            this.canvas.style.cursor = 'grabbing';
            e.preventDefault();
        }
    }

    _applyLinkedDrag(qi, ci, x, y) {
        const old = this.quads[qi][ci];
        const dx = x - old.x, dy = y - old.y;
        this.quads[qi][ci] = { x, y };
        const linked = this._links[qi+','+ci];
        if (linked) {
            for (const link of linked) {
                if (link.mode === 'same') {
                    this.quads[link.q][link.c] = { x, y };
                } else if (link.mode === 'delta') {
                    const pt = this.quads[link.q][link.c];
                    const newPt = { x: pt.x + dx, y: pt.y + dy };
                    this.quads[link.q][link.c] = newPt;
                    // Cascade: also move any "same"-linked corners of this delta-moved corner
                    const cascade = this._links[link.q+','+link.c];
                    if (cascade) {
                        for (const cl of cascade) {
                            if (cl.mode === 'same') {
                                this.quads[cl.q][cl.c] = { x: newPt.x, y: newPt.y };
                            }
                        }
                    }
                }
            }
        }
    }

    _onMouseMove(e) {
        const { x, y } = this._canvasCoords(e);
        if (this.dragging) {
            this._applyLinkedDrag(this.dragging.quadIdx, this.dragging.cornerIdx, x, y);
            this._redraw();
            this._updatePreviews();
            e.preventDefault();
        } else {
            const hit = this._hitTestHandle(x, y);
            this.canvas.style.cursor = hit ? 'grab' : 'default';
        }
    }

    _onMouseUp(e) {
        if (this.dragging) {
            this.dragging = null;
            this.canvas.style.cursor = 'default';
        }
    }

    _onTouchStart(e) {
        if (e.touches.length !== 1) return;
        const touch = e.touches[0];
        const rect = this.canvas.getBoundingClientRect();
        const x = (touch.clientX - rect.left) * (this.canvas.width / rect.width);
        const y = (touch.clientY - rect.top) * (this.canvas.height / rect.height);
        this.dragging = this._hitTestHandle(x, y);
        if (this.dragging) e.preventDefault();
    }

    _onTouchMove(e) {
        if (!this.dragging || e.touches.length !== 1) return;
        e.preventDefault();
        const touch = e.touches[0];
        const rect = this.canvas.getBoundingClientRect();
        const x = (touch.clientX - rect.left) * (this.canvas.width / rect.width);
        const y = (touch.clientY - rect.top) * (this.canvas.height / rect.height);
        this._applyLinkedDrag(this.dragging.quadIdx, this.dragging.cornerIdx, x, y);
        this._redraw();
        this._updatePreviews();
    }

    _onTouchEnd(e) {
        this.dragging = null;
    }

    // ==================== Confirm & Apply ====================

    _confirm() {
        if (!this.image) return;

        // Store detected colors for current step's 3 faces, applying orientation remap
        const faces = this.faceMap[this.step];
        for (let qi = 0; qi < this.quads.length; qi++) {
            const sampledColors = this._sampleQuad(qi);
            const remap = faces[qi].remap;
            const remappedColors = new Array(9);
            for (let i = 0; i < 9; i++) {
                remappedColors[remap[i]] = sampledColors[i];
            }
            this.extractedColors[faces[qi].face] = remappedColors;
        }

        if (this.step === 1) {
            // Advance to step 2
            this.step = 2;
            this.image = null;
            this.quads = [];
            this._updateStepUI();
            this._clearPreviews();
            document.getElementById('scanPhotoInput').value = '';
            document.getElementById('scanConfirmBtn').disabled = true;

            // Clear canvas with instructions
            this.canvas.width = 500;
            this.canvas.height = 400;
            this.ctx.fillStyle = '#1a1a2e';
            this.ctx.fillRect(0, 0, 500, 400);
            this.ctx.fillStyle = '#555';
            this.ctx.font = '16px sans-serif';
            this.ctx.textAlign = 'center';
            this.ctx.fillText('Upload photo 2 to continue', 250, 200);
        } else {
            // Apply all 6 faces to the cube model
            this._applyAllColors();
            this.close();
        }
    }

    _applyAllColors() {
        for (const [faceIdx, colors] of Object.entries(this.extractedColors)) {
            for (let pos = 0; pos < 9; pos++) {
                const colorCode = COLORS[colors[pos]];
                this.app.cube.set(parseInt(faceIdx), pos, colorCode);
            }
        }


        this.app.updateNetFromCube();
        this.app.renderer.resetCubies();
        this.app.renderer.updateColors(this.app.cube.state);
        this.app.clearSolution();
    }
}
