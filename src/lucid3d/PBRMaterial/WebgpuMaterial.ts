import {mat4} from "gl-matrix";
import {TypedArray, WebgpuTexture} from "../Loaders/GLTF2WGPU2";
import {AbstractDynamicAttributeBase, AbstractDynamicGeom, AttributeComponentCount, AttributePlacement, AttributeType} from "../WebgpuGeom";
import {WebgpuTransform} from "../WebgpuTransform";
import {WebgpuMain} from "../WebgpuMain";
import {WebgpuSkin} from "../WebgpuSkin";
import { QueryArgs } from "../../components/WebgpuApp/util/query-args";
import {UniqueIDHelper} from "../Typescript/UniqueIDHelper";
import { FORWARD_GEOM_LAYOUT, getCachedPrim, layoutStride, storeCachedPrim } from '../util/prim-cache';

let basicVertWGSL = require('./shaders/research/vertex.wgsl').default;
let sampleTextureMixColorWGSL = require('./shaders/research/fragment.wgsl').default;

export class WebgpuMaterial
{

	uniformBindGroup: GPUBindGroup;
	pipeline: GPURenderPipeline;
	transform: WebgpuTransform;
	uniformBuffer: GPUBuffer;
	ready: boolean = false;
	locations: AttributePlacement[] = [];
	baseColorTexture: WebgpuTexture;
	metallicRoughnessTexture?: WebgpuTexture;
	normalTexture?: WebgpuTexture;
	occlusionTexture?: WebgpuTexture;
	emissiveTexture?: WebgpuTexture;
	bigVertexBuffer: GPUBuffer;
	private cachedStride: number = 0;
	private cachedPosCount: number = 0;
	// Bind group cache for skinning buffers by transform
	bySkinBindGroup: {[index: string] : GPUBindGroup} = {};
    private dummySkinBuffer: GPUBuffer | null = null;
    private dummySkinBindGroup: GPUBindGroup | null = null;
	private traceCache: boolean = QueryArgs.getBool('tracecache', false);

	constructor(public readonly renderer: WebgpuMain, options?: {baseColorTexture?: WebgpuTexture, metallicRoughnessTexture?: WebgpuTexture, normalTexture?: WebgpuTexture, occlusionTexture?: WebgpuTexture, emissiveTexture?: WebgpuTexture})
	{
		if(options != undefined)
		{
			this.baseColorTexture = options.baseColorTexture;
			this.metallicRoughnessTexture = options.metallicRoughnessTexture;
			this.normalTexture = options.normalTexture;
			this.occlusionTexture = options.occlusionTexture;
			this.emissiveTexture = options.emissiveTexture;
		}
		Promise.resolve(this.initialize());
	}

	/*
		@location(0) a_position: vec3<f32>,
		@location(1) a_normal: vec3<f32>,
		@location(2) a_tangent: vec4<f32>,
		@location(3) a_color_0: vec4<f32>,
		@location(4) a_texcoord_0: vec2<f32>,
		@location(5) a_texcoord_1: vec2<f32>,

			POSITION = 0,
			TEXCOORD_0 = 1,
			TEXCOORD_1 = 2,
			NORMAL = 3,
			TANGENT = 4,
	
	*/
    async initialize()
    {
        const shaderLog = QueryArgs.getBool('shaderLog', false);
        const defaultAttributes = FORWARD_GEOM_LAYOUT;
        this.locations = defaultAttributes;

		// 		let test =  /* wgsl */`
		// 		const testVar: f32 = 55;

		// @group(0) @binding(1) var mySampler: sampler;
		// @group(0) @binding(2) var myTexture: texture_2d<f32>;

		// @fragment
		// fn main(
		//   @location(0) fragUV: vec2<f32>,
		// ) -> @location(0) vec4<f32> {

		//   return textureSample(myTexture, mySampler, fragUV);
		// }
		// 		`;

		let arrayStride: number = 0;
		let attributes: GPUVertexAttribute[] = [];
		defaultAttributes.forEach((attributePlacement) =>
		{
			let location = attributePlacement as number;
			let attrName = AttributePlacement[attributePlacement];
			let componentCount = AttributeComponentCount[attrName] as number;
			let type = AttributeType[attrName] as string;
			attributes.push({
				format: (type + componentCount) as GPUVertexFormat,
				offset: arrayStride,
				shaderLocation: location
			})
			arrayStride += Float32Array.BYTES_PER_ELEMENT * componentCount;

		});
		let bigBuffer: GPUVertexBufferLayout = {
			arrayStride: arrayStride,
			attributes: attributes,
		};


		// Create a vertex buffer from the cube data.
		// pipeline c'est un genre de material
        if (shaderLog) {
            console.log('[Forward][shader] material vertex', basicVertWGSL);
            console.log('[Forward][shader] material fragment', sampleTextureMixColorWGSL);
        }
        this.pipeline = this.renderer.device.createRenderPipeline({

			layout: 'auto',
			vertex: {
				module: this.renderer.device.createShaderModule({
					code: basicVertWGSL,
				}),
				entryPoint: 'main',
				buffers: [bigBuffer],
			},
			fragment: {
				module: this.renderer.device.createShaderModule({
					code: sampleTextureMixColorWGSL,
				}),
				entryPoint: 'main',
				targets: [
					{
						format: this.renderer.presentationFormat,
					},
				],
			},
			primitive: {
				topology: 'triangle-list',
				cullMode: 'back',

			},

			// Enable depth testing so that the fragment closest to the camera
			// is rendered in front.
			depthStencil: {
				depthWriteEnabled: true,
				depthCompare: 'less',
				format: 'depth24plus',
			},
			multisample: {
				count: 4,
			},
		});

		const uniformBufferSize = Float32Array.BYTES_PER_ELEMENT * 16; // 4x4 matrix
		this.uniformBuffer = this.renderer.device.createBuffer({
			size: uniformBufferSize,
			usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
		});

		// Skinning buffers are provided per-transform at render time (see draw/drawGeometry)


		// Fetch the image and upload it into a GPUTexture.
		let cubeTexture: GPUTexture;
		{
			const img = document.createElement('img');
			img.src = 'assets/textures/Di-3d.png';
			await img.decode();
			const imageBitmap = await createImageBitmap(img);

			cubeTexture = this.renderer.device.createTexture({
				size: [imageBitmap.width, imageBitmap.height, 1],
				format: 'rgba8unorm',
				usage:
					GPUTextureUsage.TEXTURE_BINDING |
					GPUTextureUsage.COPY_DST |
					GPUTextureUsage.RENDER_ATTACHMENT,
			});

			this.renderer.device.queue.copyExternalImageToTexture(
				{source: imageBitmap},
				{texture: cubeTexture},
				[imageBitmap.width, imageBitmap.height]
			);
		}

		// Create a sampler with linear filtering for smooth interpolation.
		const sampler = this.renderer.device.createSampler({
			magFilter: 'linear',
			minFilter: 'linear',

			addressModeU: 'clamp-to-edge',
			mipmapFilter: 'nearest'


		});

		let texture = cubeTexture;
		if(this.baseColorTexture != undefined)
		{
			texture = await (this.baseColorTexture.GetGPUTex());
		}
		
		this.uniformBindGroup = this.renderer.device.createBindGroup({
			layout: this.pipeline.getBindGroupLayout(0),
			entries: [
				{
					binding: 0,
					resource: {
						buffer: this.uniformBuffer,
					},
				},
				{
					binding: 1,
					resource: sampler,
				},
				{
					binding: 2,
					resource: texture.createView(),
				},
			],
		});

		this.ready = true;
	}

	private ensureDummySkinBindGroup() {
        if (!this.dummySkinBuffer) {
            // Layout requires at least 16 (header) + 64 (one mat4) = 80 bytes
            this.dummySkinBuffer = this.renderer.device.createBuffer({ size: 80, usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST });
            // useSkinning = 0
            this.renderer.device.queue.writeBuffer(this.dummySkinBuffer, 0, new Int32Array([0]).buffer);
            // Optional: write identity mat4 at first joint slot
            const I = new Float32Array([
                1,0,0,0,
                0,1,0,0,
                0,0,1,0,
                0,0,0,1
            ]);
            this.renderer.device.queue.writeBuffer(this.dummySkinBuffer, 16, I.buffer);
        }
        if (!this.dummySkinBindGroup) {
            this.dummySkinBindGroup = this.renderer.device.createBindGroup({
                layout: this.pipeline.getBindGroupLayout(2),
                entries: [{ binding: 0, resource: { buffer: this.dummySkinBuffer } }]
            });
        }
    }

		drawGeometry(modelViewProjectionMatrix: mat4, passEncoder: GPURenderPassEncoder, geom: AbstractDynamicGeom, tr?: WebgpuTransform)
		{
			const locationsNeeded = this.locations;
			const byLocationAttr: {[index: number]: AbstractDynamicAttributeBase} = {};
			let indexAttr: AbstractDynamicAttributeBase = undefined;
			for (let key in geom.byNameAttributes)
			{
				let attribute = geom.byNameAttributes[key];
				if (attribute.isIndices)
				{
					indexAttr = attribute;
				}
				else
				{
					byLocationAttr[attribute.location] = attribute;
				}
			}

			let posCount: number = 0;
			const positionAttr = byLocationAttr[AttributePlacement.POSITION as number];
			if (positionAttr)
			{
				posCount = positionAttr.Count;
			}
			if (!positionAttr || posCount <= 0)
			{
				return;
			}

			const arrayStride = layoutStride(locationsNeeded);
			const indexFormat: GPUIndexFormat | null = indexAttr ? 'uint16' : null;

			const buffers: (TypedArray | null)[] = new Array(locationsNeeded.length).fill(null);
			const updated: {updated: boolean} = {updated: false};
			for (let i = 0; i < locationsNeeded.length; i++)
			{
				const attributePlacement = locationsNeeded[i];
				const location = attributePlacement as number;
				const attribute = byLocationAttr[location];
				if (attribute && !attribute.isIndices)
				{
					if (i === 0)
					{
						posCount = attribute.Count;
					}
					buffers[i] = attribute.getArrayBuffer(updated);
				}
			}

			let cached = getCachedPrim(geom, locationsNeeded, indexFormat);
			const strideChanged = cached ? cached.arrayStride !== arrayStride : false;
			const countChanged = cached ? cached.vertexCount !== posCount : false;
			const needsUpload = updated.updated || !cached || strideChanged || countChanged;
			if (this.traceCache) {
				const cacheLabel = (geom as any)?.debugName || (geom as any)?.name || (geom as any)?.id || '';
				if (needsUpload) {
					const reason = !cached ? 'cold' : strideChanged ? 'stride' : countChanged ? 'count' : 'data';
					console.log('[ForwardCache] rebuild', { label: cacheLabel, reason, posCount, arrayStride });
				} else if (cached) {
					console.log('[ForwardCache] reuse', { label: cacheLabel, posCount: cached.vertexCount, stride: cached.arrayStride });
				}
			}

			let vertexBuffer = cached?.vbo ?? null;
			if (needsUpload)
			{
				const allocateNew = !cached || strideChanged || countChanged;
				const bufferSize = Math.max(0, posCount) * arrayStride;
				const targetBuffer = allocateNew
					? this.renderer.device.createBuffer({ usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST, size: bufferSize })
					: cached!.vbo;

				const floatsPerVertex = arrayStride / Float32Array.BYTES_PER_ELEMENT;
				const vb = new Float32Array(posCount * floatsPerVertex);

				const only4 = QueryArgs.getBool('only4', false);
				if (only4)
				{
					const j1Loc = AttributePlacement.JOINTS_1 as number;
					const w1Loc = AttributePlacement.WEIGHTS_1 as number;
					const zeroJ1 = new Float32Array(posCount * AttributeComponentCount[AttributePlacement[AttributePlacement.JOINTS_1]]);
					const zeroW1 = new Float32Array(posCount * AttributeComponentCount[AttributePlacement[AttributePlacement.WEIGHTS_1]]);
					buffers[j1Loc] = zeroJ1;
					buffers[w1Loc] = zeroW1;
				}

				if ((window as any)._dbg_logged !== true)
				{
					const j0 = buffers[AttributePlacement.JOINTS_0 as number] as Float32Array;
					const w0 = buffers[AttributePlacement.WEIGHTS_0 as number] as Float32Array;
					const j1 = buffers[AttributePlacement.JOINTS_1 as number] as Float32Array;
					const w1 = buffers[AttributePlacement.WEIGHTS_1 as number] as Float32Array;
					if (j0 && w0)
					{
						const v = 0;
						console.log('[SKIN DEBUG] v0 j0=', Array.from(j0.slice(v * 4, v * 4 + 4)), ' w0=', Array.from(w0.slice(v * 4, v * 4 + 4)));
						if (j1 && w1) console.log('[SKIN DEBUG] v0 j1=', Array.from(j1.slice(v * 4, v * 4 + 4)), ' w1=', Array.from(w1.slice(v * 4, v * 4 + 4)));
					}
					(window as any)._dbg_logged = true;
				}

				for (let vertexIndex = 0; vertexIndex < posCount; vertexIndex++)
				{
					let writeOffset = vertexIndex * floatsPerVertex;
					for (let i = 0; i < locationsNeeded.length; i++)
					{
						const attributePlacement = locationsNeeded[i];
						const attrName = AttributePlacement[attributePlacement];
						const componentCount = AttributeComponentCount[attrName] as number;
						const src = buffers[i];
						if (src)
						{
							const start = vertexIndex * componentCount;
							for (let k = 0; k < componentCount; k++)
							{
								vb[writeOffset + k] = (src as TypedArray)[start + k] as number;
							}
						}
						else
						{
							for (let k = 0; k < componentCount; k++)
							{
								vb[writeOffset + k] = 0;
							}
						}
						writeOffset += componentCount;
					}
				}

				this.renderer.device.queue.writeBuffer(targetBuffer, 0, vb.buffer, 0, vb.byteLength);
				vertexBuffer = targetBuffer;
				cached = undefined;
			}
			else if (cached)
			{
				vertexBuffer = cached.vbo;
			}

			if (!vertexBuffer)
			{
				return;
			}

			const indexBuffer = indexAttr ? indexAttr.getWebgpuBuffer(this) : undefined;
			const indexCount = indexAttr ? indexAttr.Count : 0;

			storeCachedPrim(geom, locationsNeeded, indexFormat, {
				vbo: vertexBuffer,
				ibo: indexBuffer ?? null,
				indexCount,
				vertexCount: posCount,
				arrayStride,
				indexFormat,
			});

			this.bigVertexBuffer = vertexBuffer;
			this.cachedStride = arrayStride;
			this.cachedPosCount = posCount;

			if(this.ready)
			{
				const transformationMatrix = modelViewProjectionMatrix as Float32Array;
				this.renderer.device.queue.writeBuffer(
					this.uniformBuffer,
					0,
					transformationMatrix.buffer,
					transformationMatrix.byteOffset,
					transformationMatrix.byteLength
				);
			}

			const noSkin = QueryArgs.getBool('noskin', false);
			const hasRealSkin = (!!tr && (tr as any).mesh && (tr as any).mesh.skin && (tr as any).mesh.skin.joints && (tr as any).mesh.skin.joints.length > 0);
			if (!noSkin && hasRealSkin && tr && tr.skinBuffer) {
				const skinUUID = UniqueIDHelper.GetUUID(tr as any);
				if (!this.bySkinBindGroup[skinUUID]) {
					this.bySkinBindGroup[skinUUID] = this.renderer.device.createBindGroup({
						layout: this.pipeline.getBindGroupLayout(2),
						entries: [
							{ binding: 0, resource: { buffer: tr.skinBuffer } }
						]
					});
				}
				passEncoder.setBindGroup(2, this.bySkinBindGroup[skinUUID]);
			} else {
				this.ensureDummySkinBindGroup();
				passEncoder.setBindGroup(2, this.dummySkinBindGroup);
			}

			if(indexAttr && indexBuffer)
			{
				this.drawIndexed(passEncoder, [vertexBuffer], indexBuffer, indexCount, indexFormat ?? 'uint16');
			}
			else
			{
				this.draw(passEncoder, [vertexBuffer], posCount);
			}
		}
	drawIndexed(passEncoder: GPURenderPassEncoder, vertexBuffers: GPUBuffer[], indexBuffer: GPUBuffer, indexCount: number, indexFormat: GPUIndexFormat)
	{
		if(this.ready)
		{
			passEncoder.setPipeline(this.pipeline);
			passEncoder.setBindGroup(0, this.uniformBindGroup);
			for(let i = 0; i < vertexBuffers.length; i++)
			{
				passEncoder.setVertexBuffer(i, vertexBuffers[i]);
			}
			passEncoder.setIndexBuffer(indexBuffer, indexFormat);
			passEncoder.drawIndexed(indexCount, 1, 0, 0);
		}
	}
	draw(passEncoder: GPURenderPassEncoder, vertexBuffers: GPUBuffer[], count: number)
	{
		
		if(this.ready)
		{
		

			passEncoder.setPipeline(this.pipeline);
			passEncoder.setBindGroup(0, this.uniformBindGroup);
			for(let i = 0; i < vertexBuffers.length; i++)
			{
				passEncoder.setVertexBuffer(i, vertexBuffers[i]);
			}
			passEncoder.draw(count, 1, 0, 0);
			/*			passEncoder.setIndexBuffer(indexBuffer, "uint16");
						passEncoder.drawIndexed(indexCount, 1, 0, 0);*/
		}
	}
}
