// Same-origin entry point for FFmpeg.wasm. The imported module and its dependencies are
// fetched as ES modules from jsDelivr, while the Worker itself is created from this site.
import "https://cdn.jsdelivr.net/npm/@ffmpeg/ffmpeg@0.12.10/dist/esm/worker.js";
