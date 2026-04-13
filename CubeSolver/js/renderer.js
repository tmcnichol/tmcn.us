// Three.js 3D Rubik's Cube Renderer with animation

class CubeRenderer {
    constructor(container) {
        this.container = container;
        this.cubies = [];
        this.animating = false;
        this.animationQueue = [];

        this.init();
        this.createCube();
        this.animate();
    }

    init() {
        const w = this.container.clientWidth;
        const h = this.container.clientHeight;

        this.scene = new THREE.Scene();
        this.scene.background = new THREE.Color(0x0d1117);

        this.camera = new THREE.PerspectiveCamera(45, w / h, 0.1, 100);
        this.camera.position.set(4.5, 4, 5.5);
        this.camera.lookAt(0, 0, 0);

        this.renderer3 = new THREE.WebGLRenderer({ antialias: true });
        this.renderer3.setSize(w, h);
        this.renderer3.setPixelRatio(window.devicePixelRatio);
        this.container.appendChild(this.renderer3.domElement);

        this.controls = new THREE.OrbitControls(this.camera, this.renderer3.domElement);
        this.controls.enableDamping = true;
        this.controls.dampingFactor = 0.1;
        this.controls.enablePan = false;
        this.controls.minDistance = 4;
        this.controls.maxDistance = 12;

        const ambient = new THREE.AmbientLight(0xffffff, 0.6);
        this.scene.add(ambient);
        const dir1 = new THREE.DirectionalLight(0xffffff, 0.6);
        dir1.position.set(5, 10, 7);
        this.scene.add(dir1);
        const dir2 = new THREE.DirectionalLight(0xffffff, 0.3);
        dir2.position.set(-5, -3, -5);
        this.scene.add(dir2);

        this.rotationGroup = new THREE.Group();
        this.scene.add(this.rotationGroup);

        this.resizeObserver = new ResizeObserver(() => {
            const w = this.container.clientWidth;
            const h = this.container.clientHeight;
            this.camera.aspect = w / h;
            this.camera.updateProjectionMatrix();
            this.renderer3.setSize(w, h);
        });
        this.resizeObserver.observe(this.container);
    }

    createCube() {
        // Remove old cubies
        this.cubies.forEach(c => {
            this.scene.remove(c.mesh);
            this.rotationGroup.remove(c.mesh);
        });
        this.cubies = [];

        const gap = 0.04;
        const size = 0.92;
        const black = 0x111111;

        for (let x = -1; x <= 1; x++) {
            for (let y = -1; y <= 1; y++) {
                for (let z = -1; z <= 1; z++) {
                    if (x === 0 && y === 0 && z === 0) continue;

                    const faceColors = [
                        x === 1 ? 0xFF5800 : black,   // +X = R (Orange)
                        x === -1 ? 0xB71234 : black,   // -X = L (Red)
                        y === 1 ? 0xFFD500 : black,    // +Y = U (Yellow)
                        y === -1 ? 0xFFFFFF : black,   // -Y = D (White)
                        z === 1 ? 0x009B48 : black,    // +Z = F (Green)
                        z === -1 ? 0x0046AD : black,   // -Z = B (Blue)
                    ];

                    const geo = new THREE.BoxGeometry(size, size, size);
                    const materials = faceColors.map(c => new THREE.MeshLambertMaterial({ color: c }));
                    const mesh = new THREE.Mesh(geo, materials);
                    mesh.position.set(x * (1 + gap), y * (1 + gap), z * (1 + gap));

                    this.scene.add(mesh);
                    this.cubies.push({ mesh, gridPos: { x, y, z } });
                }
            }
        }
    }

    // Map cube model state to 3D colors
    updateColors(cubeState) {
        const colorMap = {
            0: 0xFFFFFF, 1: 0xFFD500, 2: 0xB71234,
            3: 0xFF5800, 4: 0x0046AD, 5: 0x009B48,
        };
        const black = 0x111111;

        for (const cubie of this.cubies) {
            const { x, y, z } = cubie.gridPos;
            const faceColors = [black, black, black, black, black, black];

            // +X face (R): face 1
            if (x === 1) {
                const fi = this._gridToFacelet(R, y, z, 'R');
                if (fi >= 0) faceColors[0] = colorMap[cubeState[fi]];
            }
            // -X face (L): face 4
            if (x === -1) {
                const fi = this._gridToFacelet(L, y, z, 'L');
                if (fi >= 0) faceColors[1] = colorMap[cubeState[fi]];
            }
            // +Y face (U): face 0
            if (y === 1) {
                const fi = this._gridToFacelet(U, x, z, 'U');
                if (fi >= 0) faceColors[2] = colorMap[cubeState[fi]];
            }
            // -Y face (D): face 3
            if (y === -1) {
                const fi = this._gridToFacelet(D, x, z, 'D');
                if (fi >= 0) faceColors[3] = colorMap[cubeState[fi]];
            }
            // +Z face (F): face 2
            if (z === 1) {
                const fi = this._gridToFacelet(F, x, y, 'F');
                if (fi >= 0) faceColors[4] = colorMap[cubeState[fi]];
            }
            // -Z face (B): face 5
            if (z === -1) {
                const fi = this._gridToFacelet(B, x, y, 'B');
                if (fi >= 0) faceColors[5] = colorMap[cubeState[fi]];
            }

            for (let i = 0; i < 6; i++) {
                cubie.mesh.material[i].color.setHex(faceColors[i]);
            }
        }
    }

    // Convert 3D grid position to facelet index
    // Uses the same coordinate system as cube.js faceletPosition()
    _gridToFacelet(face, a, b, faceName) {
        let row, col;
        switch (faceName) {
            case 'U': // a=x, b=z. U face: x=col-1, z=row-1
                row = b + 1; // z=-1->0(back), z=1->2(front)
                col = a + 1; // x=-1->0(left), x=1->2(right)
                break;
            case 'D': // a=x, b=z. D face: x=col-1, z=1-row
                row = 1 - b; // z=1->0(front), z=-1->2(back)
                col = a + 1;
                break;
            case 'F': // a=x, b=y. F face: x=col-1, y=1-row
                row = 1 - b; // y=1->0(top), y=-1->2(bottom)
                col = a + 1;
                break;
            case 'B': // a=x, b=y. B face: x=1-col, y=1-row
                row = 1 - b;
                col = 1 - a; // x=1->0, x=-1->2 (mirrored)
                break;
            case 'R': // a=y, b=z. R face: y=1-row, z=1-col
                row = 1 - a; // y=1->0(top), y=-1->2(bottom)
                col = 1 - b; // z=1->0(front), z=-1->2(back)
                break;
            case 'L': // a=y, b=z. L face: y=1-row, z=col-1
                row = 1 - a;
                col = b + 1; // z=-1->0(back), z=1->2(front)
                break;
        }
        if (row < 0 || row > 2 || col < 0 || col > 2) return -1;
        return face * 9 + row * 3 + col;
    }

    // Reset cubies to default positions, clear any ongoing animation
    resetCubies() {
        // Cancel any ongoing animation
        this.animating = false;
        this.animationQueue = [];

        // Remove cubies from rotation group back to scene
        while (this.rotationGroup.children.length > 0) {
            const child = this.rotationGroup.children[0];
            this.rotationGroup.remove(child);
        }
        this.rotationGroup.quaternion.identity();

        // Recreate all cubies at default positions
        this.createCube();
    }

    // Animate a move
    animateMove(moveStr, duration, callback) {
        if (this.animating) {
            this.animationQueue.push({ moveStr, duration, callback });
            return;
        }

        const face = moveStr[0];
        const prime = moveStr.includes("'");
        const double = moveStr.includes("2");

        // CW = negative angle (Three.js right-hand rule: positive = CCW from +axis)
        const angle = (double ? Math.PI : Math.PI / 2) * (prime ? 1 : -1);

        let axis, selector;
        switch (face) {
            case 'U': axis = new THREE.Vector3(0, 1, 0); selector = c => c.gridPos.y === 1; break;
            case 'D': axis = new THREE.Vector3(0, -1, 0); selector = c => c.gridPos.y === -1; break;
            case 'R': axis = new THREE.Vector3(1, 0, 0); selector = c => c.gridPos.x === 1; break;
            case 'L': axis = new THREE.Vector3(-1, 0, 0); selector = c => c.gridPos.x === -1; break;
            case 'F': axis = new THREE.Vector3(0, 0, 1); selector = c => c.gridPos.z === 1; break;
            case 'B': axis = new THREE.Vector3(0, 0, -1); selector = c => c.gridPos.z === -1; break;
            default: if (callback) callback(); return;
        }

        const faceCubies = this.cubies.filter(selector);
        if (faceCubies.length === 0) {
            if (callback) callback();
            return;
        }

        // Move to rotation group
        for (const cubie of faceCubies) {
            this.scene.remove(cubie.mesh);
            this.rotationGroup.add(cubie.mesh);
        }

        this.animating = true;
        const startTime = performance.now();
        const targetQuat = new THREE.Quaternion().setFromAxisAngle(axis, angle);

        const animStep = (time) => {
            // Safety: if cubies were replaced during animation, abort
            if (!this.animating) return;

            const elapsed = time - startTime;
            let t = Math.min(elapsed / duration, 1);
            t = t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;

            const q = new THREE.Quaternion().slerp(targetQuat, t);
            this.rotationGroup.quaternion.copy(q);

            if (t < 1) {
                requestAnimationFrame(animStep);
            } else {
                // Animation complete
                this.rotationGroup.quaternion.copy(targetQuat);
                this.rotationGroup.updateMatrixWorld(true);

                for (const cubie of faceCubies) {
                    const worldPos = new THREE.Vector3();
                    cubie.mesh.getWorldPosition(worldPos);
                    const worldQuat = new THREE.Quaternion();
                    cubie.mesh.getWorldQuaternion(worldQuat);

                    this.rotationGroup.remove(cubie.mesh);
                    this.scene.add(cubie.mesh);

                    cubie.mesh.position.copy(worldPos);
                    cubie.mesh.quaternion.copy(worldQuat);

                    cubie.gridPos = {
                        x: Math.round(worldPos.x),
                        y: Math.round(worldPos.y),
                        z: Math.round(worldPos.z)
                    };
                }

                this.rotationGroup.quaternion.identity();
                this.animating = false;

                if (callback) callback();

                if (this.animationQueue.length > 0) {
                    const next = this.animationQueue.shift();
                    this.animateMove(next.moveStr, next.duration, next.callback);
                }
            }
        };

        requestAnimationFrame(animStep);
    }

    resetView() {
        this.camera.position.set(4.5, 4, 5.5);
        this.camera.lookAt(0, 0, 0);
        this.controls.reset();
    }

    animate() {
        requestAnimationFrame(() => this.animate());
        this.controls.update();
        this.renderer3.render(this.scene, this.camera);
    }

    dispose() {
        this.resizeObserver.disconnect();
        this.renderer3.dispose();
    }
}
