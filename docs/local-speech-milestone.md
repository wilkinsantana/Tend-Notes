# Optional local speech for TEND Notes

Status: version 0.9.0 implementation under release validation. Publication and
physical phone acceptance are separate gates.

## Implemented slice

- Optional host-owned speech capability with lazy, device-local inference.
- Moonshine TinyStreaming English dictation, explicitly downloaded and cached,
  running in a single-thread worker without panel-wide browser isolation.
- Transcript review, cancellation, protected target/permission checks and one-step
  editor Undo. Browser tests verify insertion; unit tests cover stale targets.
- Kokoro read-aloud controls, individual voice downloads, previews and default
  selection. Markdown extraction and bounded playback have focused tests.
- Device settings stay inside Notes; the extension package contains no models.
- Real browser offline dictation and cross-tab model-use locking are verified.
- Physical Android/iPhone audio, background interruption and storage-eviction
  acceptance remain pending; desktop tests do not close those gates.

The candidate investigation below records the original selection context. The
implemented dictation choice is Moonshine, approved after a working browser
trial. Kokoro uses the native Moonshine WASM engine, not the heavier original
KokoroJS/phonemizer candidate. Runtime provenance and exact assets belong to the
host's versioned speech vendor directory.

## Product contract

Dictation and read-aloud are optional, independent downloads configured inside
Notes. Ordinary note opening and writing must not load inference libraries,
download models, request microphone access, or allocate an inference session.
Use compact toolbar actions and a settings dialog rather than a permanent status
row. Standalone Notes has host settings; embedded Notes needs an equivalent
extension-owned entry point. Model settings belong to this device, not the notebook.

Local mode sends neither note text nor microphone audio to a model provider.
Initial model downloads contact the disclosed artifact provider. Never fall back
silently to a remote speech API or browser speech recognition that may use a
vendor service. Saving a resulting transcript uses the ordinary Notes save and
sync contract; local inference does not mean the saved note remains device-only.

## Verified runtime candidates

- Kokoro has an upstream JavaScript implementation using Transformers.js and
  ONNX Runtime. Its documented conservative option is q8 with WASM. The v1.0
  quantized ONNX model is approximately 92.4 MB, excluding runtime, tokenizer,
  phonemizer and selected voice assets. WebGPU/fp32 is a separate, larger
  profile; do not automatically download it after a q8 failure. The upstream
  JavaScript voice path currently targets American and British English; do not
  advertise all Python-model languages as working browser voices.
- Fun-ASR Nano and MLT Nano are 800M models with Python/FunASR, vLLM and native
  llama.cpp runtimes. The supplied browser microphone client sends audio to a
  WebSocket server. No supported upstream browser-local inference runtime was
  found. Its official model checkpoint is approximately 1.97 GB. A native GGUF
  runtime is not evidence of a browser-compatible WASM port.
- The original dictation investigation required a product choice: a supported browser-local ASR
  model, or optional Fun-ASR inference on the user's server. Do not silently
  substitute one architecture for the other. The selected browser ASR model is now Moonshine TinyStreaming English; required languages and measured device performance are selection
  criteria.

## Download and resource lifecycle

1. Show the complete versioned download size and supported languages before
   installation. Fetch only the selected model profile and voices. Pin model
   revisions, runtime versions and artifact integrity, including voice assets.
2. Check estimated available storage, explain download progress, and support
   cancellation and retry. Mark ready only after all required assets have been
   verified and a small inference probe succeeds. Partial downloads are not an
   installed model. Never delete note drafts or pending sync records to make room.
3. Use a dedicated browser cache or OPFS namespace for model artifacts; keep
   transcripts and note text out of that shared public-asset cache. Request
   persistent storage when available and explain when the browser declines it.
   Cached models are per browser/device and may require a download after data
   clearing or eviction. An ordinary Notes upgrade must not evict unchanged
   models.
4. Lazy-load inference in a dedicated worker. Bound audio/text chunks and queues;
   do not process an entire large notebook or unbounded recording in memory.
   Stop/cancel must terminate work and discard stale results. Release inference
   resources when idle, on logout, and when the component unmounts. Coordinate
   active sessions so multiple panels do not allocate duplicate large models.
5. Cache runtime WASM, tokenizer, phonemizer and selected voices as well as model
   weights. Prove a cold page reload with networking disabled; a cached model
   alone is not an offline-ready feature. Bundle executable runtime assets with
   the trusted release and preserve the extension integrity/CSP boundary.

## Read-aloud behavior

- Read a selection or the current note through one compact speaker action.
  Provide play/pause, stop, voice and speed controls with touch-sized targets.
- Convert Markdown structurally: speak readable text and meaningful image alt
  text; omit frontmatter, organization metadata, raw URLs and code by default.
  Define table reading order. No remote image or embedded video fetching.
- Synthesize sentence-sized, token-bounded chunks, with bounded lookahead.
  Prevent the upstream tokenizer's truncation from silently dropping long
  sentences. Keep reading progress tied to the text snapshot being spoken.
- User activation unlocks audio. Treat mobile interruption, backgrounding,
  device changes and screen lock as explicit playback states, without promising
  background execution on browsers that suspend it.

## Dictation behavior

- Use a distinct Dictate action alongside existing Record audio; one inserts
  text and the other deliberately saves an audio attachment.
- Start only on explicit microphone action; stop all tracks on stop, cancel,
  navigation and unmount. Show a clear recording indicator and elapsed duration.
- Keep interim recognition outside the saved document. Insert finalized text
  through the active editor transaction and normal undo/save path. Preserve
  the target document identity and selection; late results must never land in
  another note. Respect read-only, offline conflict and shared-note authority.
- Do not retain raw audio unless the user explicitly chooses to save a recording.
  Handle permission denial, unavailable devices, silence, processing backlog,
  unsupported language and interruption without losing existing writing.

## Delivery order and acceptance

The current Notes package contains JavaScript assets, and the standalone service
worker caches selected code/font assets only. Neither currently installs an ONNX
model or its WASM/voice dependencies. Extend the package/static integrity path
and introduce a separate bounded model cache deliberately. Review any added
network permission; do not solve downloading by weakening the safety scanner or
caching arbitrary authenticated API responses.

1. Prove Kokoro q8/WASM against pinned artifacts in a packaged Notes browser
   worker. Measure total bytes, cold/warm startup, first audio latency and memory.
2. Implement model installation/removal and read-aloud through the existing
   settings, extension and offline boundaries. No server restart or model
   download should be necessary merely to keep writing notes.
3. Resolve dictation runtime choice, then integrate bounded capture,
   transcription and editor transactions. Do not present an inactive microphone
   icon as a delivered dictation feature.
4. Test real desktop browsers and physical Android/iPhone devices: canceled and
   interrupted downloads, exhausted storage, offline reload, long notes,
   pause/stop, background interruption, worker failure, logout, multiple panels,
   note switching, permissions and recovery. Network inspection must show no
   text/audio upload during local inference. Emulation is not physical acceptance.
5. Publish only after the exact extension package passes safety scanning and
   its core contract passes Gitea. Track downloaded, implemented, tested,
   published and physically accepted as separate states.

## Upstream evidence

- [Kokoro browser runtime](https://github.com/hexgrad/kokoro/tree/main/kokoro.js)
- [Kokoro ONNX artifacts and sizes](https://huggingface.co/onnx-community/Kokoro-82M-v1.0-ONNX/tree/main/onnx)
- [Kokoro voice and generation implementation](https://github.com/hexgrad/kokoro/blob/main/kokoro.js/src/kokoro.js)
- [Fun-ASR runtimes and language coverage](https://github.com/QwenAudio/Fun-ASR)
- [Fun-ASR browser microphone client](https://github.com/QwenAudio/Fun-ASR/blob/main/client_mic.html)
- [Fun-ASR native runtime](https://github.com/QwenAudio/Fun-ASR/tree/main/runtime/llama.cpp)
- [Browser persistent storage behavior](https://developer.mozilla.org/en-US/docs/Web/API/StorageManager/persist)

Recheck pinned releases, licenses and runtime support during implementation.
These findings establish a feasible scope; they are not device benchmarks.


## Accepted runtime direction

After a browser microphone trial, Moonshine Tiny Streaming is the selected
implementation candidate for browser dictation. Build and benchmark its upstream
single-thread SIMD/WASM option first, so dictation remains inside Notes without
requiring cross-origin isolation for the panel or opening a separate speech
window. Keep inference in a dedicated worker even though inference itself is
single-threaded. Recheck actual compiled worker behavior with shared memory
unavailable. Main-thread responsiveness, memory, cancellation and complete
offline installation remain release gates.

Kokoro settings must offer previews, independent selected-voice downloads, a
default voice and voice removal. All installed voices reuse the same selected
model; do not download a duplicate model per voice or install every voice by
default. Explain when previewing an uninstalled voice requires its download.


The reviewed host integration seam is a URL-backed same-origin speech worker
under a dedicated vendor namespace. Its own response CSP can admit WASM
compilation and fixed artifact-download origins without broadening the panel
document CSP. Avoid blob/inline worker entry points, which inherit the parent
policy. Bundle microphone AudioWorklet scripts as same-origin files. Build
Emscripten with dynamic JavaScript execution disabled; verify the real binary
under a worker policy permitting `wasm-unsafe-eval` but not `unsafe-eval`.
Preserve worker response policy in the offline cache. This design approval does
not substitute for execution tests of the rebuilt runtime.
