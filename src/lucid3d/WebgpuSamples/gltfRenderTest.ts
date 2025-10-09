import { Gltf2Loader } from "../Loaders/GLTF2WGPU2";
import { WebgpuAnimation } from "../WebgpuAnimation";
import { WebgpuTransform } from "../WebgpuTransform";
import { WebgpuMain } from "../WebgpuMain";
import { WebgpuSceneRenderer } from "../WebgpuSceneRenderer";
import { QueryArgs } from "../../components/WebgpuApp/util/query-args";


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
		
    const model = (QueryArgs.getString('model', 'fox') || 'fox').toLowerCase();
    const url = model === 'sponza'
      ? 'assets/media/gltf/sponza/Sponza.gltf'
      : 'assets/Fox/glTF/Fox.gltf';
    loader.loadFromUrl(url).then((value) => {
			
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
