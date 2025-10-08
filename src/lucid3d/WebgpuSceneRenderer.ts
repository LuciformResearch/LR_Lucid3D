import { mat4, vec3 } from "gl-matrix";
import { AbstractDynamicGeom, AttributePlacement, WebgpuHelper } from "./WebgpuGeom";
import { AbstractMeshBase } from "./WebgpuMesh";
import { WebgpuTransform } from "./WebgpuTransform";
import { WebgpuMain } from "./WebgpuMain";
import { WebgpuMaterial } from "./PBRMaterial/WebgpuMaterial";

export class WebgpuSceneRenderer {
	allMeshes: { mesh: AbstractMeshBase, tr: WebgpuTransform }[] = [];
	constructor(public renderer: WebgpuMain, public transforms: WebgpuTransform[] = []) {

	}
	getTransformationMatrix(tr: WebgpuTransform) {
		let viewMatrix = mat4.create();
		let projMat = this.renderer.projectionMatrix;

		mat4.translate(viewMatrix, viewMatrix, vec3.fromValues(0, 0, -4));
		viewMatrix = this.renderer.flyControls.camera.GetMatrixWorld().invert().toArray() as mat4;

		const modelViewProjectionMatrix = mat4.create();
		mat4.multiply(viewMatrix, viewMatrix, tr.GetMatrixWorld().toArray() as mat4);

		mat4.multiply(modelViewProjectionMatrix, projMat, viewMatrix);

		return modelViewProjectionMatrix as Float32Array;
	}
	Render(passEncoder: GPURenderPassEncoder) {

		this.allMeshes = [];
		for (var i = 0; i < this.transforms.length; i++) {
			this.transforms[i].PreparePass(this, this.allMeshes);
		}
		
		for (let i = 0; i < this.allMeshes.length; i++) {
			let mat = this.getTransformationMatrix(this.allMeshes[i].tr);
			let mesh = this.allMeshes[i].mesh;
			let material = (mesh.material as WebgpuMaterial);

			mesh.geometry.SetLocations({
				"COLOR_0": AttributePlacement.COLOR,
				"TEXCOORD_1": AttributePlacement.TEXCOORD_1,
				"TANGENT": AttributePlacement.TANGENT,
				"POSITION": AttributePlacement.POSITION, "NORMAL": AttributePlacement.NORMAL, "TEXCOORD_0" : AttributePlacement.TEXCOORD_0,
				"JOINTS_0": AttributePlacement.JOINTS_0,
				"WEIGHTS_0": AttributePlacement.WEIGHTS_0,
				"JOINTS_1": AttributePlacement.JOINTS_1,
				"WEIGHTS_1": AttributePlacement.WEIGHTS_1,
			});
			
			material.drawGeometry(mat, passEncoder, mesh.geometry as AbstractDynamicGeom, this.allMeshes[i].tr);
		}
	}
}
