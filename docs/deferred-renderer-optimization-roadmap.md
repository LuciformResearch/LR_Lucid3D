# Deferred Renderer Optimization Roadmap

## 1. Immediate Bottleneck Fixes
- **Reuse forward `PrimInfo` buffers:** Detect existing forward VBO/IBO per mesh and bind them in the G-buffer pass instead of rebuilding interleaved arrays every frame.
- **Cache G-buffer-only buffers:** For meshes without a `PrimInfo`, build a per-mesh cache keyed on geometry + attribute layout; only regenerate when source geometry changes.
- **Scene traversal caching:** Maintain the flattened mesh list and only rebuild when transforms/scene change to avoid O(N) traversal every frame.

## 2. Animated Mesh Strategy
- **GPU skinning path:** Implement a compute or vertex shader skinning stage that updates/samples joint matrices without reuploading vertex data.
- **Fallback CPU path:** If CPU skinning is kept, restrict updates to position/normal buffers only and reuse the shared layout buffer for static attributes.

## 3. Lighting Pipeline Optimizations
- **Light culling:** Introduce tiled/clustered light culling to reduce per-fragment loops over all lights; batch lights per tile or depth slice.
- **Depth-aware culling:** Skip fragments with depth==1 early, and consider using light volumes or stencil to limit shading.
- **Compute pass tuning:** Avoid launching the light-update compute pass when lights are static; throttle updates or compact the active light list.

## 4. Format & Data Improvements
- Switch G-buffer targets to higher precision (e.g., RGBA16F) or clearly document conversions from 8-bit to float.
- Evaluate separate buffers for static vs dynamic attributes to cut bandwidth.

## 5. Measurement & Validation
- Add profiling hooks (timestamps, GPU capture scripts) comparing forward vs deferred.
- Track FPS/frametime across key scenes (dragon, procedural) before/after each optimization.

## 6. Longer-term Enhancements
- Unified vertex/mesh cache shared by forward & deferred paths.
- Optional half-res G-buffer for cheaper shading, with post upsample.
- Investigate compute-based lighting accumulation (tile-based) for large light counts.

## Next Actions
1. Implement `PrimInfo` reuse and G-buffer cache.
2. Profile the impact; log results.
3. Plan GPU skinning migration for animated assets.
