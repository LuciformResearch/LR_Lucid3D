import {mat4} from "gl-matrix";
import {TypedArray, WebgpuTexture} from "../Loaders/GLTF2WGPU2";
import {AbstractDynamicAttributeBase, AbstractDynamicGeom, AttributeComponentCount, AttributePlacement, AttributeType} from "../WebgpuGeom";
import {WebgpuTransform} from "../WebgpuTransform";
import {WebgpuMain} from "../WebgpuMain";
import {WebgpuSkin} from "../WebgpuSkin";
import { QueryArgs } from "../../util/query-args";
import {UniqueIDHelper} from "../Typescript/UniqueIDHelper";

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
	bigVertexBuffer: GPUBuffer;
	// Bind group cache for skinning buffers by transform
	bySkinBindGroup: {[index: string] : GPUBindGroup} = {};
    private dummySkinBuffer: GPUBuffer | null = null;
    private dummySkinBindGroup: GPUBindGroup | null = null;

	constructor(public readonly renderer: WebgpuMain, options?: {baseColorTexture: WebgpuTexture})
	{
		if(options != undefined)
		{
			this.baseColorTexture = options.baseColorTexture;
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
		let defaultAttributes = [AttributePlacement.POSITION, AttributePlacement.NORMAL,
		AttributePlacement.TANGENT, AttributePlacement.COLOR, AttributePlacement.TEXCOORD_0,
		AttributePlacement.TEXCOORD_1, AttributePlacement.JOINTS_0, AttributePlacement.WEIGHTS_0, AttributePlacement.JOINTS_1, AttributePlacement.WEIGHTS_1];
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
		/**
			  le material demande à la géométrie de construire des buffers qui lui sont relatif,

		 */
		let locationsNeeded = this.locations;
		let byLocationAttr: {[index: number]: AbstractDynamicAttributeBase} = {};
		let indexAttr: AbstractDynamicAttributeBase = undefined;
		let finalBuffers: GPUBuffer[] = [];
		let indexBuffer: GPUBuffer = undefined;
		let indexCount: number = -1;
		let posCount: number = -1;
		for(let key in geom.byNameAttributes)
		{
			let attribute = geom.byNameAttributes[key];
			if(attribute.isIndices)
			{
				indexAttr = attribute;
			}
			else
			{
				byLocationAttr[attribute.location] = attribute;
			}
		}

		let offset = 0;

			let buffers: (TypedArray | null)[] = new Array(locationsNeeded.length).fill(null);

		let updated: {updated: boolean} = {updated : false};
		for(let i = 0; i < locationsNeeded.length; i++)
		{
			let attributePlacement = locationsNeeded[i];
			let location = attributePlacement as number;
			let attribute = byLocationAttr[location];
			let attrName = AttributePlacement[attributePlacement];
			let componentCount = AttributeComponentCount[attrName] as number;
			let type = AttributeType[attrName] as string;
			// add to buffer here?
                if(attribute && !attribute.isIndices)
                {
                    if (i == 0)
                    {
                        posCount = attribute.Count;
                    }
					buffers[i] = attribute.getArrayBuffer(updated);
                    finalBuffers.push(attribute.getWebgpuBuffer(this));
                }

			

			offset += Float32Array.BYTES_PER_ELEMENT * componentCount;



		}
		if (this.bigVertexBuffer == undefined)
		{
			this.bigVertexBuffer = this.renderer.device.createBuffer({
				usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST,
				size: posCount * Float32Array.BYTES_PER_ELEMENT * offset
			});
			updated.updated = true;
		}
		
		if (updated.updated)
		{
				let vertexIndex = 0;
				let arrayStride: number = offset;

				// Debug/toggles
				const only4 = QueryArgs.getBool('only4', false);
				// Prepare zero arrays for JOINTS_1 / WEIGHTS_1 if only4
				let zeroJ1: Float32Array | null = null;
				let zeroW1: Float32Array | null = null;
				if (only4) {
					const j1Loc = AttributePlacement.JOINTS_1 as number;
					const w1Loc = AttributePlacement.WEIGHTS_1 as number;
					zeroJ1 = new Float32Array(posCount * AttributeComponentCount[AttributePlacement[AttributePlacement.JOINTS_1]]);
					zeroW1 = new Float32Array(posCount * AttributeComponentCount[AttributePlacement[AttributePlacement.WEIGHTS_1]]);
					buffers[j1Loc] = zeroJ1;
					buffers[w1Loc] = zeroW1;
				}

				// One-time debug log for first vertex
				if ((window as any)._dbg_logged !== true) {
					const j0 = buffers[AttributePlacement.JOINTS_0 as number] as Float32Array;
					const w0 = buffers[AttributePlacement.WEIGHTS_0 as number] as Float32Array;
					const j1 = buffers[AttributePlacement.JOINTS_1 as number] as Float32Array;
					const w1 = buffers[AttributePlacement.WEIGHTS_1 as number] as Float32Array;
					if (j0 && w0) {
						const v = 0;
						console.log('[SKIN DEBUG] v0 j0=', Array.from(j0.slice(v*4, v*4+4)), ' w0=', Array.from(w0.slice(v*4, v*4+4)));
						if (j1 && w1) console.log('[SKIN DEBUG] v0 j1=', Array.from(j1.slice(v*4, v*4+4)), ' w1=', Array.from(w1.slice(v*4, v*4+4)));
					}
					(window as any)._dbg_logged = true;
				}
	
			for(vertexIndex = 0; vertexIndex < posCount; vertexIndex++)
			{
				let offset = 0;
				for(let i = 0; i < locationsNeeded.length; i++)
				{
					let attributePlacement = locationsNeeded[i];
					let location = attributePlacement as number;
					let attribute = byLocationAttr[location];
					let attrName = AttributePlacement[attributePlacement];
					let componentCount = AttributeComponentCount[attrName] as number;
                    if (attribute)
                    {
						let src = buffers[i]!;
						this.renderer.device.queue.writeBuffer(
							this.bigVertexBuffer,
							vertexIndex * arrayStride + offset,
							(src as TypedArray).buffer,
							vertexIndex * (src as TypedArray).BYTES_PER_ELEMENT * componentCount,
							(src as TypedArray).BYTES_PER_ELEMENT * componentCount
						);
                    }
					offset += Float32Array.BYTES_PER_ELEMENT * componentCount;
				}
			}
		}

		if(this.ready)
		{
			const transformationMatrix = modelViewProjectionMatrix as Float32Array;// this.getTransformationMatrix(this.renderer.projectionMatrix);
			this.renderer.device.queue.writeBuffer(
				this.uniformBuffer,
				0,
				transformationMatrix.buffer,
				transformationMatrix.byteOffset,
				transformationMatrix.byteLength
			);
		}
		
		// If a skinning buffer exists for this transform and not disabled by noskin, bind it at group 2
		const noSkin = QueryArgs.getBool('noskin', false);
		if (!noSkin && tr && tr.skinBuffer) {
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
            // Always bind a valid group(2); with noskin=1 or missing skin, bind dummy buffer with useSkinning=0
            this.ensureDummySkinBindGroup();
            passEncoder.setBindGroup(2, this.dummySkinBindGroup);
        }

		if(indexAttr)
		{
			indexBuffer = indexAttr.getWebgpuBuffer(this);
			indexCount = indexAttr.Count;
			this.drawIndexed(passEncoder, [this.bigVertexBuffer], indexBuffer, indexCount);
		}
		else
		{
			this.draw(passEncoder, [this.bigVertexBuffer], posCount);
		}
	}
	drawIndexed(passEncoder: GPURenderPassEncoder, vertexBuffers: GPUBuffer[], indexBuffer: GPUBuffer, indexCount: number)
	{
		if(this.ready)
		{
			passEncoder.setPipeline(this.pipeline);
			passEncoder.setBindGroup(0, this.uniformBindGroup);
			for(let i = 0; i < vertexBuffers.length; i++)
			{
				passEncoder.setVertexBuffer(i, vertexBuffers[i]);
			}
			passEncoder.setIndexBuffer(indexBuffer, "uint16");
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
