# AI manga colorization design

[简体中文](COLORIZATION.md) | English

Survey date: 2026-11-04. This document plans upstream reuse,capabilities,performance and validation. No model was downloaded,trained or executed,and no user manga was processed. Performance remains unmeasured until collected on specified hardware,models,resolution,batch size and backend.

## 1. Upstream reuse

| Layer | Direct reuse | What upstream maintains | Our boundary |
|---|---|---|---|
| Job runtime | [ComfyUI](https://github.com/Comfy-Org/ComfyUI),GPL-3.0 | Graph execution,queues,caches,model loading | User-configured local/remote HTTP service; do not embed its Python runtime in the App |
| Diffusion framework | [Diffusers](https://github.com/huggingface/diffusers),Apache-2.0 | Pipelines,schedulers,device/precision adaptation | Service/research dependency,not Python on iOS |
| Line/reference conditioning | [ControlNet](https://github.com/lllyasviel/ControlNet),Apache-2.0 | Conditional network implementation | Check specific model/weight licenses and hardware separately |
| Reference colorization | [MangaNinjia](https://github.com/ali-vilab/MangaNinjia) | Research code/weights | Repository LICENSE is CC BY-NC4.0; not a general/commercial default dependency. Optional use still requires compliance with its license |
| Specialized manga model | [manga-colorization-v2](https://github.com/qweasdd/manga-colorization-v2) | Generator/denoiser weights | No SPDX metadata or root LICENSE found; weights are external downloads. Do not package or redistribute until licensing is established |
| Browser integration reference | [BinitDOX/Manga-Colorizer](https://github.com/BinitDOX/Manga-Colorizer),MIT | Client-to-colorization-service product pattern | Its MIT wrapper does not relicense the underlying v2 model |

Current ComfyUI source contains prompt/job-scoped cancellation,including `/api/jobs/{job_id}/cancel` and handling of running/queued tasks. Deployed versions differ: detect capabilities. Never send an unscoped global `/interrupt` to a shared server and cancel unrelated work.

## 2. Capabilities and product boundaries

- Initial input is a user-authorized page/selected range. Preserve the original and store derivative results separately from downloaded/source files.
- Two modes: quick single-page preview and a background chapter queue. Select range,style/reference image and screentone preservation.
- Character consistency uses references,palettes or accepted pages. Do not promise automatic series-wide identity; allow locking colors and rerunning affected pages.
- Preserve text,bubbles,sound effects and linework with conservative masks and adjustable protection. Without a qualified segmenter,do not claim perfect OCR/masking.
- Support accept,retry,revert and selected-region reruns. Record model,workflow,parameters,seed and source digest for traceability.
- Process only authorized selected content; do not upload a library automatically. External services need explicit upload,retention,account and deletion behavior.
- Without a configured local or remote inference service,the feature is unavailable with an explanation while reading remains functional.

## 3. Plugin shape

The plugin is a JavaScript orchestrator,not a model container. It declares:

- id/version/runtime/capabilities: initially colorize.page,jobs.list/cancel and health.
- provider: comfyui-http,address,optional token and API capabilities.
- workflows: workflow JSON,input nodes,seed,reference and mask slots; replace workflows independently of App releases.
- resources: model/weight origins,versions,licenses and declared minimum resources,managed by the inference environment.
- limits: timeout,maximum dimensions,concurrency and cache retention.

The host owns image bytes/encoding,persistent jobs,progress,cancellation,account/source isolation and disk quotas. Plugins do not receive unrestricted library,credential or server access. Suggested result provenance: sourceHash/workflowHash/modelHashes/seed/params/resultHash/createdAt; changed identities invalidate the cache naturally.

## 4. Performance plan

Keep three kinds of evidence separate:

1. Upstream public numbers retain hardware,resolution,precision,batch and version. No README figure was adopted as a product measurement.
2. Service timings measure submission,queueing,first progress,completion,cancellation and download separately. A100ms queued/cancellable UI response is an interaction target,not inference speed.
3. Inference tests fix pages,model,resolution and seed,and report cold start,warm single-page,10-page runs,peak VRAM/RAM,disk growth,cancel cleanup and recovery. Keep Windows,macOS,remote GPU and iOS records separate. One result cannot establish all devices.

Client buffer baselines can be calculated independently: one RGBA buffer is6MiB at1024×1536,about11.87MiB at1440×2160,and156.25MiB at2048×20000,before decode copies,model memory or GPU workspace. Start with one foreground job/device and one neighboring-page prefetch. Long strips need bounded tiling and seam/color-consistency validation. These input figures do not predict peak VRAM.

Prioritize correctness and control without promising Nseconds/page. Establish a baseline before choosing batches,low-resolution previews or on-device inference. Any on-device option must first qualify bundle size,power,heat,memory and cancellation.

## 5. Implementation order

1. Qualify health,single-page submission,progress,precise cancellation,failure and restart recovery on a fixed isolated ComfyUI/workflow with established licenses.
2. Implement the image-enhancer host and JS adapter,using fixtures outside the user library. Verify original hashes,cache isolation,concurrency and request coalescing.
3. Integrate a page-level reader action:generate,compare,accept/revert. No whole-library automation at this stage.
4. Add chapter queues,pause/resume,disk quotas and offline retry.
5. Evaluate reference consistency,text protection and workflow settings using visual fixtures and reversibility,not model names.
6. Only after stable service operation,evaluate redistributable on-device models. Unresolved/noncommercial models remain outside default distribution and may only be used under their own terms.

GPU access,model licensing,cloud accounts and fees are external conditions. Protocols,job lifetime,caches and cancellation can be developed against a simulated inference service first,but simulated output is not image-quality or inference-performance acceptance.
