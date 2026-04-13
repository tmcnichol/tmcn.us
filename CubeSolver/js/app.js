// Main Application Controller

class App {
    constructor() {
        this.cube = new CubeModel();
        this.selectedColor = COLORS.W;
        this.solution = null;
        this.currentStep = -1;
        this.playing = false;
        this.playTimer = null;
        this.solutionCube = null; // cube state at each step

        this.init();
    }

    init() {
        this.buildCubeNet();
        this.setupColorPalette();
        this.setupButtons();
        this.setupPhotoInput();

        // Initialize photo scanner
        this.photoScanner = new PhotoScanner(this);

        // Initialize 3D renderer
        const container = document.getElementById('cubeViewer');
        this.renderer = new CubeRenderer(container);
        this.renderer.updateColors(this.cube.state);
    }

    // ==================== Cube Net UI ====================
    buildCubeNet() {
        const net = document.getElementById('cubeNet');
        net.innerHTML = '';

        // Layout: 4 columns x 3 rows
        // Row 0:           [U]
        // Row 1: [L] [F] [R] [B]
        // Row 2:           [D]

        const layout = [
            [null, 'U', null, null],
            ['L', 'F', 'R', 'B'],
            [null, 'D', null, null],
        ];

        const faceMap = { U: 0, R: 1, F: 2, D: 3, L: 4, B: 5 };
        const centerColors = {
            U: '#FFD500', R: '#FF5800', F: '#009B48',
            D: '#FFFFFF', L: '#B71234', B: '#0046AD'
        };

        for (let row = 0; row < 3; row++) {
            for (let col = 0; col < 4; col++) {
                const faceName = layout[row][col];
                if (!faceName) {
                    const spacer = document.createElement('div');
                    net.appendChild(spacer);
                    continue;
                }

                const faceIdx = faceMap[faceName];
                const container = document.createElement('div');
                container.className = 'face-container';

                const label = document.createElement('div');
                label.className = 'face-label';
                label.textContent = faceName;
                container.appendChild(label);

                const grid = document.createElement('div');
                grid.className = 'face-grid';

                for (let i = 0; i < 9; i++) {
                    const cell = document.createElement('div');
                    cell.className = 'face-cell' + (i === 4 ? ' center' : '');
                    cell.dataset.face = faceIdx;
                    cell.dataset.pos = i;

                    // Set initial color (solved state)
                    cell.style.backgroundColor = centerColors[faceName];
                    cell.dataset.color = COLOR_NAMES[CENTER_COLORS[faceIdx]];

                    if (i !== 4) {
                        cell.addEventListener('click', () => this.onCellClick(cell));
                    }

                    grid.appendChild(cell);
                }

                container.appendChild(grid);
                net.appendChild(container);
            }
        }
    }

    onCellClick(cell) {
        const colorName = COLOR_NAMES[this.selectedColor];
        cell.style.backgroundColor = COLOR_HEX[colorName];
        cell.dataset.color = colorName;

        // Update cube model
        const face = parseInt(cell.dataset.face);
        const pos = parseInt(cell.dataset.pos);
        this.cube.set(face, pos, this.selectedColor);

        // Update 3D view
        this.renderer.resetCubies();
        this.renderer.updateColors(this.cube.state);
    }

    // ==================== Color Palette ====================
    setupColorPalette() {
        const buttons = document.querySelectorAll('.color-btn');
        buttons.forEach(btn => {
            btn.addEventListener('click', () => {
                buttons.forEach(b => b.classList.remove('active'));
                btn.classList.add('active');
                this.selectedColor = COLORS[btn.dataset.color];
            });
        });
    }

    // ==================== Buttons ====================
    setupButtons() {
        document.getElementById('solveBtn').addEventListener('click', () => this.solve());
        document.getElementById('resetBtn').addEventListener('click', () => this.resetCube());
        document.getElementById('randomBtn').addEventListener('click', () => this.randomize());
        document.getElementById('scanBtn').addEventListener('click', () => this.photoScanner.open());
        document.getElementById('resetViewBtn').addEventListener('click', () => this.renderer.resetView());

        document.getElementById('prevBtn').addEventListener('click', () => this.stepPrev());
        document.getElementById('playBtn').addEventListener('click', () => this.togglePlay());
        document.getElementById('nextBtn').addEventListener('click', () => this.stepNext());
    }

    resetCube() {
        this.cube.reset();
        this.updateNetFromCube();
        this.renderer.resetCubies();
        this.renderer.updateColors(this.cube.state);
        this.clearSolution();
    }

    randomize() {
        this.cube.reset();
        this.cube.scramble(25);
        this.updateNetFromCube();
        this.renderer.resetCubies();
        this.renderer.updateColors(this.cube.state);
        this.clearSolution();
    }

    updateNetFromCube() {
        const cells = document.querySelectorAll('.face-cell');
        cells.forEach(cell => {
            const face = parseInt(cell.dataset.face);
            const pos = parseInt(cell.dataset.pos);
            const color = this.cube.get(face, pos);
            const colorName = COLOR_NAMES[color];
            cell.style.backgroundColor = COLOR_HEX[colorName];
            cell.dataset.color = colorName;
        });
    }

    // ==================== Photo Input (legacy single-photo fallback) ====================
    setupPhotoInput() {
        const input = document.getElementById('photoInput');
        if (input) {
            input.addEventListener('change', (e) => this.handlePhoto(e));
        }
        const closeBtn = document.getElementById('closePhoto');
        if (closeBtn) {
            closeBtn.addEventListener('click', () => {
                document.getElementById('photoPreview').classList.add('hidden');
            });
        }
    }

    handlePhoto(e) {
        const file = e.target.files[0];
        if (!file) return;

        const reader = new FileReader();
        reader.onload = (ev) => {
            const img = new Image();
            img.onload = () => {
                const canvas = document.getElementById('photoCanvas');
                const ctx = canvas.getContext('2d');
                const maxW = 280;
                const scale = maxW / img.width;
                canvas.width = maxW;
                canvas.height = img.height * scale;
                ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
                document.getElementById('photoPreview').classList.remove('hidden');

                // Click canvas to sample color - shows detected color and selects it
                canvas.onclick = (ev) => {
                    const rect = canvas.getBoundingClientRect();
                    const x = (ev.clientX - rect.left) * (canvas.width / rect.width);
                    const y = (ev.clientY - rect.top) * (canvas.height / rect.height);
                    // Sample 3x3 area for better color detection
                    const sx = Math.max(0, Math.floor(x) - 1);
                    const sy = Math.max(0, Math.floor(y) - 1);
                    const sw = Math.min(3, canvas.width - sx);
                    const sh = Math.min(3, canvas.height - sy);
                    const data = ctx.getImageData(sx, sy, sw, sh).data;
                    let rSum = 0, gSum = 0, bSum = 0, count = 0;
                    for (let i = 0; i < data.length; i += 4) {
                        rSum += data[i]; gSum += data[i+1]; bSum += data[i+2]; count++;
                    }
                    const detectedColor = this.classifyColor(rSum/count, gSum/count, bSum/count);
                    this.selectedColor = COLORS[detectedColor];

                    // Update palette selection
                    document.querySelectorAll('.color-btn').forEach(b => {
                        b.classList.toggle('active', b.dataset.color === detectedColor);
                    });

                    // Draw indicator on canvas
                    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
                    ctx.strokeStyle = '#fff';
                    ctx.lineWidth = 2;
                    ctx.beginPath();
                    ctx.arc(Math.floor(x), Math.floor(y), 8, 0, Math.PI * 2);
                    ctx.stroke();
                    ctx.fillStyle = COLOR_HEX[detectedColor];
                    ctx.beginPath();
                    ctx.arc(Math.floor(x), Math.floor(y), 5, 0, Math.PI * 2);
                    ctx.fill();

                    // Show hint
                    document.querySelector('.photo-hint').textContent =
                        'Detected: ' + detectedColor + ' - Now click cube faces to apply';
                };
            };
            img.src = ev.target.result;
        };
        reader.readAsDataURL(file);
    }

    classifyColor(r, g, b) {
        // Color classification using HSL with tuned thresholds for cube photos
        const max = Math.max(r, g, b) / 255;
        const min = Math.min(r, g, b) / 255;
        const l = (max + min) / 2;
        const d = max - min;

        // Very low saturation = white or black
        if (d < 0.08) {
            return l > 0.35 ? 'W' : 'W';
        }

        const s = d / (1 - Math.abs(2 * l - 1) + 0.0001);
        let h;
        const rn = r / 255, gn = g / 255, bn = b / 255;
        if (max === rn) h = ((gn - bn) / d) % 6;
        else if (max === gn) h = (bn - rn) / d + 2;
        else h = (rn - gn) / d + 4;
        h = Math.round(h * 60);
        if (h < 0) h += 360;

        // Yellow: hue 40-70, must be reasonably bright — check BEFORE white to avoid misclassification
        if (h >= 40 && h <= 70 && l > 0.35) return 'Y';

        // White: high lightness, low-to-moderate saturation (cube whites often have slight tint)
        if (l > 0.75 && s < 0.45) return 'W';
        if (l > 0.65 && s < 0.2) return 'W';

        // Orange: hue 10-40
        if (h >= 10 && h < 40 && l > 0.25) return 'O';

        // Red: hue near 0/360
        if ((h >= 340 || h < 10) && l > 0.15) return 'R';

        // Green: hue 80-170
        if (h >= 80 && h <= 170) return 'G';

        // Blue: hue 190-260 (narrower to avoid catching white-blue tints)
        if (h >= 190 && h <= 260 && l < 0.65) return 'B';

        // Light blue-ish with high lightness is likely white
        if (h >= 170 && h < 260 && l >= 0.65) return 'W';

        // Fallback
        if (h >= 260 && h < 340) return 'R'; // Magenta-ish -> Red
        return 'W';
    }

    // ==================== Solver ====================
    solve() {
        this.clearSolution();

        // Read state from cube net
        this.readCubeFromNet();

        // Validate
        const err = this.cube.validate();
        if (err) {
            this.showError(err);
            return;
        }

        // Check if already solved
        if (this.cube.isSolved()) {
            this.showError('Cube is already solved!');
            return;
        }

        // Store initial state for playback
        this.initialState = this.cube.state.slice();

        // Solve
        let result;
        try {
            const stateForSolver = this.cube.state.slice();
            console.log('SOLVE_INPUT:', stateForSolver.map(c => COLOR_NAMES[c]).join(''));
            const solver = new Solver(stateForSolver);
            result = solver.solve();
            console.log('SOLVE_RESULT:', result.success, result.error, 'solved=' + solver.cube.isSolved(), 'moves=' + result.moves.length);
        } catch (e) {
            this.showError('Solver crashed: ' + e.message);
            return;
        }

        if (!result.success) {
            this.showError('Could not solve: ' + (result.error || 'Unknown error.') + ' This usually means the scanned colors are slightly wrong. Try adjusting the grid overlays or correcting colors manually.');
            return;
        }

        if (result.moves.length === 0) {
            this.showError('Cube is already solved!');
            return;
        }

        // Optimize solution (remove redundant moves)
        this.solution = this.optimizeSolution(result.moves);
        this.solutionPhases = result.phases;

        // Build solution states for each step
        this.buildSolutionStates();

        // Display solution
        this.displaySolution();

        // Show playback controls
        document.getElementById('playbackControls').classList.remove('hidden');

        // Reset to initial state in 3D view
        this.currentStep = -1;
        this.renderer.resetCubies();
        this.renderer.updateColors(this.initialState);
    }

    readCubeFromNet() {
        const cells = document.querySelectorAll('.face-cell');
        cells.forEach(cell => {
            const face = parseInt(cell.dataset.face);
            const pos = parseInt(cell.dataset.pos);
            const colorName = cell.dataset.color;
            this.cube.set(face, pos, COLORS[colorName]);
        });
    }

    optimizeSolution(moves) {
        // Simple optimization: merge consecutive same-face moves
        const result = [];
        for (const move of moves) {
            if (result.length === 0) {
                result.push(move);
                continue;
            }

            const last = result[result.length - 1];
            const lastFace = last[0];
            const curFace = move[0];

            if (lastFace === curFace) {
                // Merge
                const lastCount = last.includes("2") ? 2 : (last.includes("'") ? 3 : 1);
                const curCount = move.includes("2") ? 2 : (move.includes("'") ? 3 : 1);
                const total = (lastCount + curCount) % 4;

                result.pop();
                if (total === 1) result.push(curFace);
                else if (total === 2) result.push(curFace + "2");
                else if (total === 3) result.push(curFace + "'");
                // total === 0: moves cancel out, don't add anything
            } else {
                result.push(move);
            }
        }

        // Run again for cascading cancellations
        if (result.length < moves.length) {
            return this.optimizeSolution(result);
        }
        return result;
    }

    buildSolutionStates() {
        this.solutionStates = [this.initialState.slice()];
        const cube = new CubeModel();
        cube.setState(this.initialState);

        for (const move of this.solution) {
            cube.applyMove(move);
            this.solutionStates.push(cube.state.slice());
        }
    }

    displaySolution() {
        const container = document.getElementById('solutionContainer');

        // Summary
        let html = `<div class="solution-summary">${this.solution.length} moves total</div>`;

        // Group moves by phase
        let moveIdx = 0;
        for (const phase of this.solutionPhases) {
            if (phase.moves.length === 0) continue;

            // Count how many optimized moves correspond to this phase
            // Since we optimized, we'll just assign moves linearly
            html += `<div class="solution-phase">`;
            html += `<div class="phase-title">${phase.name}</div>`;
            html += `<div class="phase-moves">`;

            // We need to map optimized moves back to phases
            // For simplicity, just show all optimized moves as one flow
            html += `</div></div>`;
        }

        // Show all moves as badges
        html = `<div class="solution-summary">${this.solution.length} moves total</div>`;

        // Re-group by phase using original phase info
        let optimizedIdx = 0;
        const phaseGroups = this.groupMovesByPhase();

        for (const group of phaseGroups) {
            html += `<div class="solution-phase">`;
            html += `<div class="phase-title">${group.name}</div>`;
            html += `<div class="phase-moves">`;

            for (let i = 0; i < group.count; i++) {
                const globalIdx = group.startIdx + i;
                html += `<span class="move-badge" data-step="${globalIdx}" onclick="app.goToStep(${globalIdx})">${this.solution[globalIdx]}</span>`;
            }

            html += `</div></div>`;
        }

        container.innerHTML = html;
        this.updateStepDisplay();
    }

    groupMovesByPhase() {
        // Since optimization can change move count, just distribute evenly
        // Better approach: track which phase each original move belongs to, then map
        const groups = [];
        let idx = 0;

        for (const phase of this.solutionPhases) {
            if (phase.moves.length === 0) continue;
            // Estimate: proportional distribution
            groups.push({
                name: phase.name,
                startIdx: idx,
                count: 0
            });
        }

        // Simple approach: just show all moves under one section if mapping is complex
        if (groups.length === 0 || this.solution.length === 0) {
            return [{ name: 'Solution', startIdx: 0, count: this.solution.length }];
        }

        // Distribute moves across phases proportionally
        const totalOriginal = this.solutionPhases.reduce((s, p) => s + p.moves.length, 0);
        let assigned = 0;

        for (let i = 0; i < groups.length; i++) {
            const phase = this.solutionPhases.filter(p => p.moves.length > 0)[i];
            const proportion = phase.moves.length / totalOriginal;
            const count = i === groups.length - 1
                ? this.solution.length - assigned
                : Math.round(proportion * this.solution.length);

            groups[i].startIdx = assigned;
            groups[i].count = Math.max(0, Math.min(count, this.solution.length - assigned));
            assigned += groups[i].count;
        }

        return groups.filter(g => g.count > 0);
    }

    // ==================== Playback ====================
    goToStep(step) {
        if (step < -1 || step >= this.solution.length) return;
        if (this.renderer.animating) return;

        this.stopPlay();
        this.currentStep = step;

        // Update 3D view to this state
        this.renderer.resetCubies();
        this.renderer.updateColors(this.solutionStates[step + 1]);
        this.updateStepDisplay();
    }

    stepNext() {
        if (!this.solution || this.currentStep >= this.solution.length - 1) return;
        if (this.renderer.animating) return;

        this.currentStep++;

        // Show the state BEFORE this move, then animate
        this.renderer.resetCubies();
        this.renderer.updateColors(this.solutionStates[this.currentStep]);

        const speed = document.getElementById('speedSlider').value;
        const duration = 1750 - (speed - 1) * 186; // 1750ms to 75ms

        this.renderer.animateMove(this.solution[this.currentStep], duration, () => {
            this.updateStepDisplay();
            if (this.playing && this.currentStep < this.solution.length - 1) {
                setTimeout(() => this.stepNext(), 100);
            } else if (this.currentStep >= this.solution.length - 1) {
                this.stopPlay();
            }
        });

        this.updateStepDisplay();
    }

    stepPrev() {
        if (!this.solution || this.currentStep < 0) return;
        if (this.renderer.animating) return;

        this.currentStep--;
        this.renderer.resetCubies();
        this.renderer.updateColors(this.solutionStates[this.currentStep + 1]);
        this.updateStepDisplay();
    }

    togglePlay() {
        if (this.playing) {
            this.stopPlay();
        } else {
            this.playing = true;
            document.getElementById('playBtn').innerHTML = '&#9646;&#9646;';
            this.stepNext();
        }
    }

    stopPlay() {
        this.playing = false;
        document.getElementById('playBtn').innerHTML = '&#9654;';
    }

    updateStepDisplay() {
        if (!this.solution) return;

        const label = document.getElementById('stepLabel');
        const notation = document.getElementById('moveNotation');

        label.textContent = `Step ${this.currentStep + 1} / ${this.solution.length}`;
        notation.textContent = this.currentStep >= 0 ? this.solution[this.currentStep] : '---';

        // Update move badges
        document.querySelectorAll('.move-badge').forEach(badge => {
            const step = parseInt(badge.dataset.step);
            badge.classList.remove('active', 'done');
            if (step === this.currentStep) badge.classList.add('active');
            else if (step < this.currentStep) badge.classList.add('done');
        });
    }

    // ==================== Helpers ====================
    showError(msg) {
        const el = document.getElementById('errorMsg');
        el.textContent = msg;
        el.classList.remove('hidden');
        setTimeout(() => el.classList.add('hidden'), 5000);
    }

    clearSolution() {
        this.solution = null;
        this.currentStep = -1;
        this.playing = false;
        this.solutionStates = null;

        document.getElementById('solutionContainer').innerHTML =
            '<p class="placeholder-text">Input your cube colors and click "Solve!" to see the solution.</p>';
        document.getElementById('playbackControls').classList.add('hidden');
        document.getElementById('errorMsg').classList.add('hidden');
    }
}

// Initialize app
let app;
document.addEventListener('DOMContentLoaded', () => {
    app = new App();
});
