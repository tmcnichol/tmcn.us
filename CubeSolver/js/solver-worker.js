// Web Worker for running the solver off the main thread
const cacheBust = '?v=' + Date.now();
importScripts('cube.js' + cacheBust, 'solver.js' + cacheBust);

self.onmessage = function(e) {
    const { cubeState } = e.data;
    const solver = new Solver(cubeState);
    const result = solver.solve();
    self.postMessage(result);
};
