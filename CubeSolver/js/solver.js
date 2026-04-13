// Rubik's Cube Solver: BFS for cross/corners, algorithms for F2L edges + last layer

class Solver {
    constructor(cubeState) {
        this.cube = new CubeModel();
        this.cube.setState(cubeState);
        this.solution = [];
        this.phases = [];
        // Read center colors from actual state — don't assume fixed color scheme
        this.centers = [];
        for (let f = 0; f < 6; f++) this.centers[f] = cubeState[f * 9 + 4];
    }

    static ALL_MOVES = ["U","U'","U2","R","R'","R2","F","F'","F2","D","D'","D2","L","L'","L2","B","B'","B2"];

    solve() {
        try {
            this.solveWhiteCross();
            this.solveWhiteCorners();
            this.solveSecondLayer();
            this.solveYellowCross();
            this._permuteLastLayer();
            this.orientYellowCorners();
            if (!this.cube.isSolved()) {
                return { success: false, error: 'Could not fully solve. Verify your color input.', phases: this.phases, moves: this.solution };
            }
            return { success: true, phases: this.phases, moves: this.solution };
        } catch (e) {
            return { success: false, error: e.message, phases: this.phases, moves: this.solution };
        }
    }

    do(movesStr) {
        if (!movesStr || movesStr.trim() === '') return;
        for (const m of movesStr.trim().split(/\s+/)) {
            this.cube.applyMove(m);
            this.solution.push(m);
        }
        if (this.phases.length > 0) this.phases[this.phases.length - 1].moves.push(...movesStr.trim().split(/\s+/));
    }

    startPhase(n) { this.phases.push({ name: n, moves: [] }); }
    inv(m) { return m.includes("2") ? m : m.includes("'") ? m[0] : m + "'"; }
    g(f, p) { return this.cube.get(f, p); }

    // ========= BFS/IDA* SEARCH =========
    search(checkFn, maxDepth) {
        if (checkFn()) return [];
        const saved = this.cube.state.slice();
        for (let d = 1; d <= maxDepth; d++) {
            const r = this._dfs(checkFn, d, [], -1);
            if (r) { this.cube.setState(saved); return r; }
        }
        this.cube.setState(saved);
        return null;
    }

    _dfs(checkFn, maxD, path, lastFace) {
        if (checkFn()) return path.slice();
        if (path.length >= maxD) return null;
        for (const move of Solver.ALL_MOVES) {
            const face = FACE_NAMES.indexOf(move[0]);
            if (face === lastFace) continue;
            this.cube.applyMove(move);
            path.push(move);
            const r = this._dfs(checkFn, maxD, path, face);
            if (r) return r;
            path.pop();
            this.cube.applyMove(this.inv(move));
        }
        return null;
    }

    // Helper: check first layer is intact
    _firstLayerOk() {
        const W = this.centers[D];
        for (let i = 0; i < 9; i++) if (this.g(D, i) !== W) return false;
        const cF=this.centers[F], cR=this.centers[R], cB=this.centers[B], cL=this.centers[L];
        if (this.g(F,6)!==cF||this.g(F,7)!==cF||this.g(F,8)!==cF) return false;
        if (this.g(R,6)!==cR||this.g(R,7)!==cR||this.g(R,8)!==cR) return false;
        if (this.g(B,6)!==cB||this.g(B,7)!==cB||this.g(B,8)!==cB) return false;
        if (this.g(L,6)!==cL||this.g(L,7)!==cL||this.g(L,8)!==cL) return false;
        return true;
    }

    // ========= PHASE 1: White Cross (BFS depth 6 per edge) =========
    solveWhiteCross() {
        this.startPhase('White Cross');
        const W = this.centers[D];
        const targets = [
            { d: 1, sf: F, sc: this.centers[F] },
            { d: 5, sf: R, sc: this.centers[R] },
            { d: 7, sf: B, sc: this.centers[B] },
            { d: 3, sf: L, sc: this.centers[L] },
        ];
        const solved = [];
        for (const t of targets) {
            const moves = this.search(() => {
                if (this.g(D,t.d)!==W || this.g(t.sf,7)!==t.sc) return false;
                for (const p of solved) if (this.g(D,p.d)!==W || this.g(p.sf,7)!==p.sc) return false;
                return true;
            }, 6);
            if (moves) { this.do(moves.join(' ')); solved.push(t); }
            else throw new Error('Cannot solve cross edge '+COLOR_NAMES[t.sc]);
        }
    }

    // ========= PHASE 2: White Corners (BFS depth 6 per corner) =========
    solveWhiteCorners() {
        this.startPhase('White Corners');
        const W = this.centers[D];
        const cF=this.centers[F], cR=this.centers[R], cB=this.centers[B], cL=this.centers[L];
        const targets = [
            { d: 0, f1: F, p1: 6, c1: cF, f2: L, p2: 8, c2: cL },
            { d: 2, f1: R, p1: 6, c1: cR, f2: F, p2: 8, c2: cF },
            { d: 6, f1: L, p1: 6, c1: cL, f2: B, p2: 8, c2: cB },
            { d: 8, f1: B, p1: 6, c1: cB, f2: R, p2: 8, c2: cR },
        ];
        const solved = [];

        for (const t of targets) {
            // Check if corner is in D layer - if so, extract first
            const corner = this._findCorner(W, t.c1, t.c2);
            if (corner && corner.faces[0] === D) {
                // Extract: turn the adjacent face to bring corner to U
                const dp = corner.positions[0];
                if (dp === 0) this.do("L' U L");
                else if (dp === 2) this.do("R U' R'");
                else if (dp === 6) this.do("L U' L'");
                else if (dp === 8) this.do("R' U R");
            }

            const crossCheck = () => {
                if (this.g(D,1)!==W||this.g(F,7)!==cF) return false;
                if (this.g(D,5)!==W||this.g(R,7)!==cR) return false;
                if (this.g(D,7)!==W||this.g(B,7)!==cB) return false;
                if (this.g(D,3)!==W||this.g(L,7)!==cL) return false;
                return true;
            };

            const moves = this.search(() => {
                if (!crossCheck()) return false;
                for (const p of solved) if (this.g(D,p.d)!==W||this.g(p.f1,p.p1)!==p.c1||this.g(p.f2,p.p2)!==p.c2) return false;
                return this.g(D,t.d)===W && this.g(t.f1,t.p1)===t.c1 && this.g(t.f2,t.p2)===t.c2;
            }, 7);

            if (moves) { this.do(moves.join(' ')); solved.push(t); }
            else throw new Error('Cannot solve corner');
        }
    }

    _findCorner(c1, c2, c3) {
        for (const corner of CORNERS) {
            const [f1,p1,f2,p2,f3,p3] = corner;
            const a = [this.cube.state[f1*9+p1],this.cube.state[f2*9+p2],this.cube.state[f3*9+p3]];
            const t = [c1,c2,c3].sort(), s = a.slice().sort();
            if (t[0]===s[0]&&t[1]===s[1]&&t[2]===s[2]) return {faces:[f1,f2,f3],positions:[p1,p2,p3],colors:a};
        }
        return null;
    }

    _findEdge(c1, c2) {
        for (const [f1,p1,f2,p2] of EDGES) {
            const a = this.cube.state[f1*9+p1], b = this.cube.state[f2*9+p2];
            if ((a===c1&&b===c2)||(a===c2&&b===c1)) return {faces:[f1,f2],positions:[p1,p2]};
        }
        return null;
    }

    // ========= PHASE 3: Second Layer (algorithmic) =========
    solveSecondLayer() {
        this.startPhase('Second Layer');
        const Y = this.centers[U];
        const rightOf = {[F]:R,[R]:B,[B]:L,[L]:F};
        const leftOf = {[F]:L,[L]:B,[B]:R,[R]:F};

        const cF=this.centers[F], cR=this.centers[R], cB=this.centers[B], cL=this.centers[L];
        const targets = [
            [F,5,cF, R,3,cR],
            [F,3,cF, L,5,cL],
            [B,3,cB, R,5,cR],
            [B,5,cB, L,3,cL],
        ];

        for (const [tf1,tp1,tc1,tf2,tp2,tc2] of targets) {
            for (let attempt = 0; attempt < 40; attempt++) {
                if (this.g(tf1,tp1)===tc1 && this.g(tf2,tp2)===tc2) break;

                const loc = this._findEdge(tc1, tc2);
                if (!loc) break;
                const [f0,p0,f1,p1] = [loc.faces[0],loc.positions[0],loc.faces[1],loc.positions[1]];

                // If in middle layer wrong, extract to U
                if (f0!==U && f1!==U && f0!==D && f1!==D) {
                    // Apply extraction: standard right-insert algo extracts
                    const extractAlgos = {
                        [`${F}5`]: "U R U' R' U' F' U F",
                        [`${F}3`]: "U' L' U L U F U' F'",
                        [`${R}3`]: "U' F' U F U R U' R'",
                        [`${R}5`]: "U B U' B' U' R' U R",
                        [`${B}3`]: "U' R' U R U B U' B'",
                        [`${B}5`]: "U L U' L' U' B' U B",
                        [`${L}3`]: "U' B' U B U L U' L'",
                        [`${L}5`]: "U F U' F' U' L' U L",
                    };
                    const key0 = `${f0}${p0}`, key1 = `${f1}${p1}`;
                    if (extractAlgos[key0]) this.do(extractAlgos[key0]);
                    else if (extractAlgos[key1]) this.do(extractAlgos[key1]);
                    continue;
                }

                if (f0===D||f1===D) { this.do('U'); continue; }

                // Edge in U layer
                let topColor, sideColor, sideFace;
                if (f0===U) { topColor=this.cube.state[f0*9+p0]; sideColor=this.cube.state[f1*9+p1]; sideFace=f1; }
                else { topColor=this.cube.state[f1*9+p1]; sideColor=this.cube.state[f0*9+p0]; sideFace=f0; }

                if (topColor===Y||sideColor===Y) { this.do('U'); continue; }

                // Align side color with its center
                if (sideColor !== this.g(sideFace, 4)) { this.do('U'); continue; }

                // Insert
                const topFace = this.centers.indexOf(topColor);
                const f = FACE_NAMES[sideFace];
                if (topFace === rightOf[sideFace]) {
                    this.do(`U ${FACE_NAMES[rightOf[sideFace]]} U' ${FACE_NAMES[rightOf[sideFace]]}' U' ${f}' U ${f}`);
                } else if (topFace === leftOf[sideFace]) {
                    this.do(`U' ${FACE_NAMES[leftOf[sideFace]]}' U ${FACE_NAMES[leftOf[sideFace]]} U ${f} U' ${f}'`);
                } else {
                    this.do('U');
                }
            }
        }
    }

    // ========= PHASE 4: Yellow Cross =========
    solveYellowCross() {
        this.startPhase('Yellow Cross');
        const Y = this.centers[U];
        for (let a = 0; a < 10; a++) {
            const e = [this.g(U,1)===Y, this.g(U,3)===Y, this.g(U,5)===Y, this.g(U,7)===Y];
            const c = e.filter(x=>x).length;
            if (c===4) return;
            if (c===0) this.do("F R U R' U' F'");
            else if (c===2) {
                // Line or L-shape
                if ((e[0]&&e[3])||(e[1]&&e[2])) {
                    if (e[1]&&e[2]) this.do("U");
                    this.do("F R U R' U' F'");
                } else {
                    if (e[0]&&e[2]) this.do("U'");
                    else if (e[2]&&e[3]) this.do("U2");
                    else if (e[1]&&e[3]) this.do("U");
                    this.do("F U R U' R' F'");
                }
            }
        }
    }

    // ========= PHASE 5+6: Yellow Edge & Corner Permutation (combined BFS) =========
    _permuteLastLayer() {
        this.startPhase('Last Layer Permutation');
        // Use BFS with macro moves: U, U', U2, edge-3-cycle, corner-3-cycle
        const EDGE_CW = "R2 U F B' R2 B F' U R2";
        const EDGE_CCW = "R2 U' F B' R2 B F' U' R2";
        const CORNER_CW = "R U' L' U R' U' L U";
        const CORNER_CCW = "U' L' U R' U' L U R";
        const macros = [
            {name: 'U', seq: 'U'},
            {name: "U'", seq: "U'"},
            {name: 'U2', seq: 'U2'},
            {name: 'EC', seq: EDGE_CW},
            {name: 'EI', seq: EDGE_CCW},
            {name: 'CC', seq: CORNER_CW},
            {name: 'CI', seq: CORNER_CCW},
        ];

        const check = () => {
            return this.g(F,1)===this.g(F,4) && this.g(R,1)===this.g(R,4) &&
                   this.g(B,1)===this.g(B,4) && this.g(L,1)===this.g(L,4) &&
                   this._correctCorners().every(x=>x);
        };

        // Try U alignment first
        for (let u = 0; u < 4; u++) { if (check()) return; this.do('U'); }

        // BFS with macros, depth 4
        const saved = this.cube.state.slice();
        const queue = [[]]; // paths of macro indices
        const visited = new Set();
        visited.add(this.cube.state.join(','));

        for (let depth = 0; depth < 20000 && queue.length > 0; depth++) {
            const path = queue.shift();
            if (path.length > 5) continue;

            // Apply path
            this.cube.setState(saved);
            for (const mi of path) this.cube.applyMoves(macros[mi].seq);

            // Check with U alignment
            for (let u = 0; u < 4; u++) {
                if (check()) {
                    // Found solution! Apply it
                    this.cube.setState(saved);
                    for (const mi of path) this.do(macros[mi].seq);
                    for (let u2 = 0; u2 < 4; u2++) { if (check()) return; this.do('U'); }
                    return;
                }
                this.cube.applyMove('U');
            }

            if (path.length >= 5) continue;

            // Expand
            for (let mi = 0; mi < macros.length; mi++) {
                const newPath = [...path, mi];
                this.cube.setState(saved);
                for (const m of newPath) this.cube.applyMoves(macros[m].seq);
                const key = this.cube.state.join(',');
                if (!visited.has(key)) {
                    visited.add(key);
                    queue.push(newPath);
                }
            }
        }
    }

    permuteYellowEdges() {
        this.startPhase('Yellow Edges');
        const ALG = "R2 U F B' R2 B F' U R2"; // 3-edge cycle, keeps B fixed
        const ALG_INV = "R2 U' F B' R2 B F' U' R2"; // inverse cycle

        const _alignU = () => {
            for (let u = 0; u < 4; u++) {
                if (this.g(F,1)===this.g(F,4)&&this.g(R,1)===this.g(R,4)&&this.g(B,1)===this.g(B,4)&&this.g(L,1)===this.g(L,4)) return true;
                this.do('U');
            }
            return false;
        };
        if (_alignU()) return;

        const conjugates = ['', "U", "U2", "U'"];
        const unconjugates = ['', "U'", "U2", "U"];

        for (let attempt = 0; attempt < 4; attempt++) {
            // Try each conjugation with both CW and CCW
            for (let conj = 0; conj < 4; conj++) {
                for (const alg of [ALG, ALG_INV]) {
                    const saved = this.cube.state.slice();
                    const sLen = this.solution.length;
                    const pLen = this.phases[this.phases.length-1].moves.length;

                    if (conjugates[conj]) this.do(conjugates[conj]);
                    this.do(alg);
                    if (unconjugates[conj]) this.do(unconjugates[conj]);

                    if (_alignU()) return;

                    // Undo
                    this.cube.setState(saved);
                    this.solution.length = sLen;
                    this.phases[this.phases.length-1].moves.length = pLen;
                }
            }
            // None worked; apply once and retry
            this.do(ALG);
            if (_alignU()) return;
        }
    }

    // ========= PHASE 6: Yellow Corner Permutation =========
    permuteYellowCorners() {
        this.startPhase('Yellow Corner Position');
        const ALG = "R U' L' U R' U' L U"; // keeps UFL fixed
        const ALG_INV = "U' L' U R' U' L U R"; // inverse

        for (let attempt = 0; attempt < 6; attempt++) {
            if (this._correctCorners().every(x=>x)) return;

            // Try each conjugation with both ALG and ALG_INV
            const conjugates = ['', "U", "U2", "U'"];
            const unconjugates = ['', "U'", "U2", "U"];
            let solved = false;

            for (let conj = 0; conj < 4 && !solved; conj++) {
                for (const alg of [ALG, ALG_INV]) {
                    const saved = this.cube.state.slice();
                    const sLen = this.solution.length;
                    const pLen = this.phases[this.phases.length-1].moves.length;

                    if (conjugates[conj]) this.do(conjugates[conj]);
                    this.do(alg);
                    if (unconjugates[conj]) this.do(unconjugates[conj]);

                    if (this._correctCorners().every(x=>x)) { solved=true; break; }

                    this.cube.setState(saved);
                    this.solution.length = sLen;
                    this.phases[this.phases.length-1].moves.length = pLen;
                }
            }
            if (solved) return;
            // Try double application: ALG then ALG with different conjugation
            for (let c1 = 0; c1 < 4 && !solved; c1++) {
                for (let c2 = 0; c2 < 4 && !solved; c2++) {
                    for (const a1 of [ALG, ALG_INV]) {
                        for (const a2 of [ALG, ALG_INV]) {
                            const saved = this.cube.state.slice();
                            const sLen = this.solution.length;
                            const pLen = this.phases[this.phases.length-1].moves.length;

                            if (conjugates[c1]) this.do(conjugates[c1]);
                            this.do(a1);
                            if (unconjugates[c1]) this.do(unconjugates[c1]);
                            if (conjugates[c2]) this.do(conjugates[c2]);
                            this.do(a2);
                            if (unconjugates[c2]) this.do(unconjugates[c2]);

                            if (this._correctCorners().every(x=>x)) { solved=true; break; }

                            this.cube.setState(saved);
                            this.solution.length = sLen;
                            this.phases[this.phases.length-1].moves.length = pLen;
                        }
                        if (solved) break;
                    }
                }
            }
            if (solved) return;
            this.do(ALG);
        }
    }

    _correctCorners() {
        const Y = this.centers[U];
        return [
            {u:0,f1:L,p1:0,f2:B,p2:2,c1:this.centers[L],c2:this.centers[B]},
            {u:2,f1:B,p1:0,f2:R,p2:2,c1:this.centers[B],c2:this.centers[R]},
            {u:6,f1:F,p1:0,f2:L,p2:2,c1:this.centers[F],c2:this.centers[L]},
            {u:8,f1:R,p1:0,f2:F,p2:2,c1:this.centers[R],c2:this.centers[F]},
        ].map(c => {
            const a=[this.g(U,c.u),this.g(c.f1,c.p1),this.g(c.f2,c.p2)].sort();
            const e=[Y,c.c1,c.c2].sort();
            return a[0]===e[0]&&a[1]===e[1]&&a[2]===e[2];
        });
    }

    // ========= PHASE 7: Yellow Corner Orientation =========
    orientYellowCorners() {
        this.startPhase('Yellow Corner Orient');
        const Y = this.centers[U];
        for (let i = 0; i < 4; i++) {
            let found = false;
            for (let u = 0; u < 4; u++) {
                if (this.g(U,8)!==Y) { found=true; break; }
                this.do('U');
            }
            if (!found) break;
            for (let j = 0; j < 5; j++) {
                if (this.g(U,8)===Y) break;
                this.do("R' D' R D");
            }
        }
        for (let u = 0; u < 4; u++) {
            if (this.g(F,1)===this.g(F,4)&&this.g(R,1)===this.g(R,4)) break;
            this.do('U');
        }
    }
}
