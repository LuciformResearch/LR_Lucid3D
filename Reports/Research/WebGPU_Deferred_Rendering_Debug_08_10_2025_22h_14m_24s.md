# WebGPU Deferred Rendering Debug

**Date:** 08/10/2025 22h 14m 24s  
**Category:** Research  
**Tags:** webgpu, deferred, rendering, performance, debugging

## Summary

Investigation of WebGPU deferred rendering implementation issues including performance problems (20 FPS), black G1/G2 buffers, and rendering artifacts. The deferred rendering pipeline is significantly slower than forward rendering and produces incorrect visual output.

## Current Status

### ✅ Resolved Issues
1. **WGSL Compilation Errors**: Fixed `textureSample` in non-uniform control flow
2. **Bind Group Layout Mismatch**: Unified texture sampling approach using `textureLoad`
3. **Matrix Calculation**: Aligned deferred rendering matrix calculation with forward rendering
4. **Format Consistency**: Fixed texture format mismatch between geometry pipeline and render targets

### ❌ Critical Issues Remaining

#### 1. Performance Problem (20 FPS)
- **Expected**: Deferred rendering should be faster than forward rendering
- **Actual**: 20 FPS vs normal forward rendering performance
- **Hardware**: RTX 2070 (should handle simple deferred rendering easily)
- **Suspected Causes**:
  - Resource recreation every frame
  - Inefficient bind group management
  - Memory allocation issues
  - Pipeline state changes

#### 2. G1 Buffer (Normals) - Black Screen
- **Expected**: Normal vectors visualized as colors
- **Actual**: Black screen
- **Debug Status**: Added fallback for invalid normals
- **Possible Causes**:
  - Model lacks vertex normals
  - Normal texture not loaded
  - TBN matrix calculation issues
  - Format conversion problems

#### 3. G2 Buffer (AO) - Black Screen  
- **Expected**: Ambient occlusion as grayscale
- **Actual**: Black screen
- **Debug Status**: Added fallback for zero AO values
- **Possible Causes**:
  - AO texture not loaded
  - Texture binding issues
  - Format mismatch

#### 4. Deferred Rendering Complete - Black Screen
- **Expected**: Full PBR rendering
- **Actual**: Black screen after fixing G1/G2
- **Possible Causes**:
  - Lighting shader issues
  - G-buffer data corruption
  - Texture sampling problems

## Technical Analysis

### Deferred Rendering Pipeline
```
1. Geometry Pass: Render to G-buffers (G0: albedo+metallic, G1: normal+roughness, G2: emissive+AO)
2. Lighting Pass: Read G-buffers and compute PBR lighting
```

### Texture Formats
- **G0**: `bgra8unorm` (presentation format)
- **G1**: `rgba8unorm` (changed from `rgba16float` for performance)
- **G2**: `rgba8unorm`

### Performance Investigation Points
1. **Bind Group Recreation**: Check if bind groups are recreated every frame
2. **Pipeline State Changes**: Verify pipeline switching efficiency
3. **Memory Management**: Check for unnecessary allocations
4. **Resource Caching**: Ensure textures and buffers are properly cached

### Normal Mapping Issues
1. **Vertex Normals**: Check if model has valid vertex normals
2. **Normal Textures**: Verify normal texture loading and binding
3. **TBN Matrix**: Validate tangent/bitangent calculation
4. **Fallback Logic**: Ensure geometric normals are used when normal mapping fails

## Debugging Strategy

### Immediate Actions
1. **Test Debug Fallbacks**: Verify G1 shows blue (normal fallback) and G2 shows white (AO fallback)
2. **Performance Profiling**: Add timing measurements to identify bottlenecks
3. **Resource Inspection**: Log texture and buffer creation/usage
4. **Pipeline Analysis**: Compare forward vs deferred pipeline efficiency

### Code Changes Made
1. Added normal validation in geometry shader
2. Added AO fallback logic
3. Fixed matrix calculation alignment
4. Unified texture sampling approach
5. Optimized texture formats

## Next Steps

1. **Test Current Debug Version**: Verify fallbacks work
2. **Performance Profiling**: Add detailed timing measurements
3. **Resource Analysis**: Check for unnecessary recreations
4. **Normal Mapping Fix**: Investigate vertex normal and texture issues
5. **Lighting Shader Debug**: Fix deferred rendering complete output

## Files Modified

- `src/lucid3d/Deferred/shaders/gbuffer_geometry.frag.wgsl`
- `src/lucid3d/Deferred/DeferredRenderer.ts`
- `src/lucid3d/Deferred/WebgpuSceneRendererGBuffer.ts`
- `src/lucid3d/WebgpuMain.ts`

## Test URLs

- G0: `?deferred=1&gbuf=G0&samples=1&flip=1`
- G1: `?deferred=1&gbuf=G1&samples=1&flip=1`
- G2: `?deferred=1&gbuf=G2&samples=1&flip=1`
- Complete: `?deferred=1&samples=1`

## Expected Outcomes

1. **Performance**: 60+ FPS for simple deferred rendering
2. **G1**: Normal vectors as colored visualization
3. **G2**: AO as grayscale visualization  
4. **Complete**: Full PBR rendering matching forward rendering quality