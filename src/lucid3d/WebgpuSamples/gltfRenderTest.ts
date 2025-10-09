import { Gltf2Loader } from "../Loaders/GLTF2WGPU2";
import { WebgpuAnimation } from "../WebgpuAnimation";
import { WebgpuTransform } from "../WebgpuTransform";
import { WebgpuMain } from "../WebgpuMain";
import { WebgpuSceneRenderer } from "../WebgpuSceneRenderer";


export class GltfRenderTest {
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
	transforms: WebgpuTransform[] = [];
	animations: WebgpuAnimation[] = [];
	sceneRenderer: WebgpuSceneRenderer = undefined;

	constructor(public readonly renderer: WebgpuMain) {

	}
	async initialize() {
		let loader = new Gltf2Loader(this.renderer);
		
    // loader.loadFromUrl("assets/Fox/glTF/Fox.gltf").then((value) => {
    loader.loadFromUrl("assets/media/gltf/sponza/Sponza.gltf").then((value) => {
			
			this.transforms.push(value.transformRoot);
			this.animations = this.animations.concat(value.animations);
			this.sceneRenderer = new WebgpuSceneRenderer(this.renderer, this.transforms);
		});
	}

	draw(passEncoder: GPURenderPassEncoder) {

		if (this.sceneRenderer)
		{
			this.sceneRenderer.Render(passEncoder);
		}

	}

}
