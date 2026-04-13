// Rubik's Cube Model - using full permutation arrays computed from 3D geometry

const COLORS = { W: 0, Y: 1, R: 2, O: 3, B: 4, G: 5 };
const COLOR_NAMES = ['W', 'Y', 'R', 'O', 'B', 'G'];
const COLOR_HEX = { W: '#FFFFFF', Y: '#FFD500', R: '#B71234', O: '#FF5800', B: '#0046AD', G: '#009B48' };

const U = 0, R = 1, F = 2, D = 3, L = 4, B = 5;
const FACE_NAMES = ['U', 'R', 'F', 'D', 'L', 'B'];

// Yellow on top, White on bottom (standard solving orientation)
const CENTER_COLORS = [COLORS.Y, COLORS.O, COLORS.G, COLORS.W, COLORS.R, COLORS.B];

// Compute facelet 3D positions
// Each facelet index = face*9 + row*3 + col
function faceletPosition(face, row, col) {
    switch (face) {
        case 0: return { x: col-1, y: 1, z: row-1, nx: 0, ny: 1, nz: 0 };        // U
        case 1: return { x: 1, y: 1-row, z: 1-col, nx: 1, ny: 0, nz: 0 };        // R
        case 2: return { x: col-1, y: 1-row, z: 1, nx: 0, ny: 0, nz: 1 };        // F
        case 3: return { x: col-1, y: -1, z: 1-row, nx: 0, ny: -1, nz: 0 };      // D
        case 4: return { x: -1, y: 1-row, z: col-1, nx: -1, ny: 0, nz: 0 };      // L
        case 5: return { x: 1-col, y: 1-row, z: -1, nx: 0, ny: 0, nz: -1 };      // B
    }
}

const FACELETS = [];
for (let f = 0; f < 6; f++)
    for (let r = 0; r < 3; r++)
        for (let c = 0; c < 3; c++)
            FACELETS.push(faceletPosition(f, r, c));

// Rotation functions for CW from outside each face
// Returns [newX, newY, newZ, newNX, newNY, newNZ]
const ROTATIONS = {
    U: (p) => [-p.z, p.y, p.x, -p.nz, p.ny, p.nx],         // CW from above
    D: (p) => [p.z, p.y, -p.x, p.nz, p.ny, -p.nx],         // CW from below
    R: (p) => [p.x, p.z, -p.y, p.nx, p.nz, -p.ny],         // CW from right
    L: (p) => [p.x, -p.z, p.y, p.nx, -p.nz, p.ny],         // CW from left
    F: (p) => [p.y, -p.x, p.z, p.ny, -p.nx, p.nz],         // CW from front
    B: (p) => [-p.y, p.x, p.z, -p.ny, p.nx, p.nz],         // CW from behind
};

const LAYER_AXIS = { U: 'y', D: 'y', R: 'x', L: 'x', F: 'z', B: 'z' };
const LAYER_VAL = { U: 1, D: -1, R: 1, L: -1, F: 1, B: -1 };

// Compute full permutation for each CW move
// perm[i] = j means "after the move, position i gets the value from position j"
function computeMovePerm(faceName) {
    const perm = new Array(54);
    for (let i = 0; i < 54; i++) perm[i] = i;
    const rot = ROTATIONS[faceName];
    const axis = LAYER_AXIS[faceName];
    const val = LAYER_VAL[faceName];

    for (let i = 0; i < 54; i++) {
        const f = FACELETS[i];
        if (f[axis] !== val) continue;
        const [nx, ny, nz, nnx, nny, nnz] = rot(f);
        for (let j = 0; j < 54; j++) {
            const g = FACELETS[j];
            if (nx === g.x && ny === g.y && nz === g.z && nnx === g.nx && nny === g.ny && nnz === g.nz) {
                // Sticker at position i goes to position j
                // For applyCW (state[i] = old[perm[i]]), we need inverse:
                // position j gets value from position i
                perm[j] = i;
                break;
            }
        }
    }
    return perm;
}

// Pre-compute all 6 CW permutations
const MOVE_PERMS = {};
for (const fn of FACE_NAMES) {
    MOVE_PERMS[fn] = computeMovePerm(fn);
}

class CubeModel {
    constructor() {
        this.state = new Array(54);
        this.reset();
    }

    reset() {
        for (let face = 0; face < 6; face++)
            for (let i = 0; i < 9; i++)
                this.state[face * 9 + i] = CENTER_COLORS[face];
    }

    clone() {
        const c = new CubeModel();
        c.state = this.state.slice();
        return c;
    }

    get(f, p) { return this.state[f * 9 + p]; }
    set(f, p, color) { this.state[f * 9 + p] = color; }

    applyCW(face) {
        const perm = MOVE_PERMS[FACE_NAMES[face]];
        const old = this.state.slice();
        for (let i = 0; i < 54; i++) {
            if (perm[i] !== i) this.state[i] = old[perm[i]];
        }
    }

    applyCCW(face) {
        // CCW = CW applied 3 times
        this.applyCW(face);
        this.applyCW(face);
        this.applyCW(face);
    }

    apply2(face) {
        this.applyCW(face);
        this.applyCW(face);
    }

    applyMove(moveStr) {
        const face = FACE_NAMES.indexOf(moveStr[0]);
        if (face === -1) return;
        if (moveStr.length === 1) this.applyCW(face);
        else if (moveStr[1] === "'") this.applyCCW(face);
        else if (moveStr[1] === "2") this.apply2(face);
    }

    applyMoves(movesStr) {
        if (!movesStr || movesStr.trim() === '') return;
        for (const m of movesStr.trim().split(/\s+/)) this.applyMove(m);
    }

    isSolved() {
        for (let face = 0; face < 6; face++) {
            const center = this.state[face * 9 + 4];
            for (let i = 0; i < 9; i++)
                if (this.state[face * 9 + i] !== center) return false;
        }
        return true;
    }

    setState(arr) { this.state = arr.slice(); }

    validate() {
        const counts = [0, 0, 0, 0, 0, 0];
        for (let i = 0; i < 54; i++) {
            if (this.state[i] < 0 || this.state[i] > 5) return 'Invalid color';
            counts[this.state[i]]++;
        }
        for (let c = 0; c < 6; c++)
            if (counts[c] !== 9) return `Color ${COLOR_NAMES[c]} appears ${counts[c]} times (need 9)`;
        // Check all 6 centers are different colors
        const centerColors = new Set();
        for (let f = 0; f < 6; f++) centerColors.add(this.state[f * 9 + 4]);
        if (centerColors.size !== 6) return 'Not all face centers have unique colors';
        return null;
    }

    scramble(numMoves = 20) {
        const moves = [];
        let lastFace = -1;
        for (let i = 0; i < numMoves; i++) {
            let face;
            do { face = Math.floor(Math.random() * 6); } while (face === lastFace);
            lastFace = face;
            const type = Math.floor(Math.random() * 3);
            if (type === 0) { this.applyCW(face); moves.push(FACE_NAMES[face]); }
            else if (type === 1) { this.applyCCW(face); moves.push(FACE_NAMES[face] + "'"); }
            else { this.apply2(face); moves.push(FACE_NAMES[face] + "2"); }
        }
        return moves;
    }
}

// Edge and corner definitions for the solver
const EDGES = [
    [U, 1, B, 1], [U, 3, L, 1], [U, 5, R, 1], [U, 7, F, 1],
    [D, 1, F, 7], [D, 3, L, 7], [D, 5, R, 7], [D, 7, B, 7],
    [F, 3, L, 5], [F, 5, R, 3], [B, 3, R, 5], [B, 5, L, 3],
];

const CORNERS = [
    [U, 0, L, 0, B, 2], [U, 2, B, 0, R, 2], [U, 6, F, 0, L, 2], [U, 8, R, 0, F, 2],
    [D, 0, L, 8, F, 6], [D, 2, F, 8, R, 6], [D, 6, B, 8, L, 6], [D, 8, R, 8, B, 6],
];
