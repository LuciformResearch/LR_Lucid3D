import { mat4, vec3 } from "gl-matrix";
import { AttributePlacement, WebgpuHelper } from "../WebgpuGeom";
import { WebgpuTransform } from "../WebgpuTransform";
import { getCubeGeom } from "./cubeGeometry2";
import { WebgpuMain } from "../WebgpuMain";
let basicVertWGSL = require('../PBRMaterial/shaders/basic.wgsl').default;
let sampleTextureMixColorWGSL = require('../PBRMaterial/shaders/sampleTextureMixColor2.wgsl').default;


export type Full<T> = {
	[P in keyof T]: T[P];
};


export enum GeometryAttributeType {
	VERTEX,
	INDEX,
}

export class WebgpuVertexAttribDescriptor {
	public name: string;
	public componentCount: number;
	public type: AttributePlacement;
	constructor(value: Full<WebgpuVertexAttribDescriptor>) {
		for (let key in value) {
			this[key] = value[key];
		}
	}
}

export class WebgpuVertexAttribute {
	constructor(public descriptor: WebgpuVertexAttribDescriptor, public value: Float32Array) {

	}
}

export class WebgpuIndexAttribute {
	constructor(public value: Uint16Array) {

	}
}



export class CubeRenderTest {
	uniformBuffer: GPUBuffer;
	positionBuffer: GPUBuffer;
	uvBuffer: GPUBuffer;
	indexBuffer: GPUBuffer;
	uniformBindGroup: GPUBindGroup;
	pipeline: GPURenderPipeline;
	transform: WebgpuTransform = new WebgpuTransform();
	indexCount: number;
	vertexBuffers: GPUBuffer[] = [];
	bufferLocation: number[] = [];
	buffers: GPUVertexBufferLayout[] = [];


	constructor(public readonly renderer: WebgpuMain) {

	}
	async initialize() {
	
		let wgpuGeom = getCubeGeom();//  cubeGeom();
		let rawGeom = WebgpuHelper.GetWebgpuAttribute(wgpuGeom);//.GetWebgpuAttributes();
		let attributes = rawGeom.attributes;
		attributes.map((val) => {
			let buffer = this.renderer.device.createBuffer({
				size: val.value.byteLength,
				usage: GPUBufferUsage.VERTEX,
				mappedAtCreation: true,
			});
			new Float32Array(buffer.getMappedRange()).set(val.value);
			buffer.unmap();
			this.vertexBuffers.push(buffer);
			this.bufferLocation.push(val.descriptor.type);
			let gpuVertAttrib = {
				format: ("float32x" + val.descriptor.componentCount) as GPUVertexFormat,
				offset: 0,
				shaderLocation: val.descriptor.type
			};

			this.buffers.push({
				arrayStride: Float32Array.BYTES_PER_ELEMENT * val.descriptor.componentCount,
				attributes: [gpuVertAttrib]
			});
		});
		this.indexBuffer = this.renderer.device.createBuffer({
			size: rawGeom.index.value.byteLength,
			usage: GPUBufferUsage.INDEX,
			mappedAtCreation: true,
		});
		this.indexCount = rawGeom.index.value.length;
		new Uint16Array(this.indexBuffer.getMappedRange()).set(rawGeom.index.value);
		this.indexBuffer.unmap();
		// Create a vertex buffer from the cube data.
		// pipeline c'est un genre de material
		this.pipeline = this.renderer.device.createRenderPipeline({

			layout: 'auto',
			vertex: {
				module: this.renderer.device.createShaderModule({
					code: basicVertWGSL,
				}),
				entryPoint: 'main',
				buffers: this.buffers,
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

				// Backface culling since the cube is solid piece of geometry.
				// Faces pointing away from the camera will be occluded by faces
				// pointing toward the camera.
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

		const uniformBufferSize = 4 * 16; // 4x4 matrix
		this.uniformBuffer = this.renderer.device.createBuffer({
			size: uniformBufferSize,
			usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
		});

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
				{ source: imageBitmap },
				{ texture: cubeTexture },
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
					resource: cubeTexture.createView(),
				},
			],
		});
		this.transform.position.x = 1.0;
		this.transform.position.y = 1.0;
		this.transform.position.z = 1.0;
	}

	draw(passEncoder: GPURenderPassEncoder) {
		const transformationMatrix = this.getTransformationMatrix(this.renderer.projectionMatrix);
		this.renderer.device.queue.writeBuffer(
			this.uniformBuffer,
			0,
			transformationMatrix.buffer,
			transformationMatrix.byteOffset,
			transformationMatrix.byteLength
		);

		passEncoder.setPipeline(this.pipeline);
		passEncoder.setBindGroup(0, this.uniformBindGroup);
		for (let i = 0; i < this.vertexBuffers.length; i++) {
			// let loc = this.buffers[i].attributes[0].shaderLocation;
			passEncoder.setVertexBuffer(i, this.vertexBuffers[i]);
		}
		passEncoder.setIndexBuffer(this.indexBuffer, "uint16");
		passEncoder.drawIndexed(this.indexCount, 1, 0, 0);


		// si il y avait des index, il faudrait faire drawIndexed.

	}

	getTransformationMatrix(projectionMatrix: mat4) {

		let viewMatrix = mat4.create();

		mat4.translate(viewMatrix, viewMatrix, vec3.fromValues(0, 0, -4));
		viewMatrix = this.renderer.flyControls.camera.GetMatrixWorld().invert().toArray() as mat4;
		//mat4.invert(viewMatrix, viewMatrix);
		//const now = Date.now() / 1000;
		/*mat4.rotate(
		  viewMatrix,
		  viewMatrix,
		  1,
		  vec3.fromValues(Math.sin(now), Math.cos(now), 0)
		);*/

		const modelViewProjectionMatrix = mat4.create();
		mat4.multiply(viewMatrix, viewMatrix, this.transform.GetMatrixWorld().toArray() as mat4);

		mat4.multiply(modelViewProjectionMatrix, projectionMatrix, viewMatrix);

		return modelViewProjectionMatrix as Float32Array;
	}

}
