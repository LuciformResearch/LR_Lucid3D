struct LightData {
  position: vec4<f32>,
  color: vec3<f32>,
  radius: f32,
};
struct LightsBuffer {
  lights: array<LightData>,
};
struct Config {
  numLights: u32,
};
struct Camera {
  view: mat4x4<f32>,
  proj: mat4x4<f32>,
  viewProj: mat4x4<f32>,
  invViewProj: mat4x4<f32>,
};
struct TileParams {
  tileSize: u32,
  tilesX: u32,
  tilesY: u32,
  screenWidth: u32,
  screenHeight: u32,
  maxLightsPerTile: u32,
  overflowCounterOffset: u32,
  overflowFlagOffset: u32,
};
struct TileHeader {
  offset: u32,
  count: atomic<u32>,
};

@group(0) @binding(0) var<storage, read> lightsBuffer: LightsBuffer;
@group(0) @binding(1) var<uniform> config: Config;
@group(0) @binding(2) var<uniform> camera: Camera;
@group(0) @binding(3) var<uniform> tileParams: TileParams;
@group(0) @binding(4) var<storage, read_write> tileHeaders: array<TileHeader>;
@group(0) @binding(5) var<storage, read_write> tileLightIndices: array<u32>;
@group(0) @binding(6) var<storage, read_write> tileDebugBuffer: array<atomic<u32>>;

@compute @workgroup_size(1, 1, 1)
fn main(@builtin(workgroup_id) WorkgroupID: vec3<u32>) {
  if (WorkgroupID.x >= tileParams.tilesX || WorkgroupID.y >= tileParams.tilesY) {
    return;
  }
  let tileIndex = WorkgroupID.y * tileParams.tilesX + WorkgroupID.x;
  let maxPerTile = tileParams.maxLightsPerTile;
  if (maxPerTile == 0u) {
    return;
  }
  let offset = tileIndex * maxPerTile;
  tileHeaders[tileIndex].offset = offset;
  atomicStore(&tileHeaders[tileIndex].count, 0u);

  let tileMin = vec2<f32>(f32(WorkgroupID.x * tileParams.tileSize), f32(WorkgroupID.y * tileParams.tileSize));
  let tileMax = tileMin + vec2<f32>(f32(tileParams.tileSize), f32(tileParams.tileSize));

  for (var lightIndex = 0u; lightIndex < config.numLights; lightIndex++) {
    let light = lightsBuffer.lights[lightIndex];
    let posWorld = vec4<f32>(light.position.xyz, 1.0);
    let viewPos = camera.view * posWorld;
    if (viewPos.z >= -1e-4) {
      continue;
    }
    let clip = camera.proj * viewPos;
    if (clip.w <= 0.0) {
      continue;
    }
    let ndc = clip.xyz / clip.w;
    let screen = vec2<f32>(
      (ndc.x * 0.5 + 0.5) * f32(tileParams.screenWidth),
      (-ndc.y * 0.5 + 0.5) * f32(tileParams.screenHeight)
    );

    let proj00 = camera.proj[0][0];
    let proj11 = camera.proj[1][1];
    let recipZ = -1.0 / viewPos.z;
    let screenRadiusX = abs(light.radius * proj00 * recipZ) * 0.5 * f32(tileParams.screenWidth);
    let screenRadiusY = abs(light.radius * proj11 * recipZ) * 0.5 * f32(tileParams.screenHeight);
    let screenRadius = max(screenRadiusX, screenRadiusY);
    let screenMin = screen - vec2<f32>(screenRadius, screenRadius);
    let screenMax = screen + vec2<f32>(screenRadius, screenRadius);

    if (screenMax.x < tileMin.x || screenMin.x > tileMax.x || screenMax.y < tileMin.y || screenMin.y > tileMax.y) {
      continue;
    }

    let writeIndex = atomicAdd(&tileHeaders[tileIndex].count, 1u);
    if (writeIndex < maxPerTile) {
      tileLightIndices[offset + writeIndex] = lightIndex;
    } else {
      let counterIndex = tileParams.overflowCounterOffset;
      let flagIndex = tileParams.overflowFlagOffset + tileIndex;
      atomicAdd(&tileDebugBuffer[counterIndex], 1u);
      atomicStore(&tileDebugBuffer[flagIndex], 1u);
    }
  }
}
