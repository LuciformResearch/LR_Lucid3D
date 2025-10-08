import { Vector3 } from "../Math/Vector3";
import { AbstractDynamicGeom, AbstractIndices, AbstractV2Attribute, AbstractV3Attribute, AttributePlacement } from "../WebgpuGeom";

export class CubeGeometry extends AbstractDynamicGeom {
	constructor(size: Vector3,
		public attributes = {
			POSITION: new AbstractV3Attribute(),
			TEXCOORD_0: new AbstractV2Attribute(),
			NORMAL: new AbstractV3Attribute(),
			index: new AbstractIndices(),
		}) {
		super(attributes);

		/*
			une face plan 1 z, une face plan -1 z, 
			une face plan 1 x, une face plan -1 x,
			une face plan 1 y, une face plan -1 y,
		*/
		let startIndex = 0;
		// iterate on each axis.
		for (var i = 0; i < 3; i++) {
			// 2 planes by axis.
			for (var p = 0; p < 2; p++) {

				let planeVal = p * 2.0 - 1.0;
				let arr = [1, 1, 1];
				arr[i] = planeVal * size.getComponent(i);
				let norm = [0, 0, 0];
				norm[i] = planeVal;
				let i0 = (i + 1) % 3;
				let i1 = (i + 2) % 3;
				arr[i0] = -1 * size.getComponent(i0);
				arr[i1] = -1 * size.getComponent(i1);
				// push vert.
				this.attributes.POSITION.PushArray(arr);
				this.attributes.NORMAL.PushArray(norm);
				this.attributes.TEXCOORD_0.PushArray([0, 0]);
				arr[i0] = -1 * size.getComponent(i0);
				arr[i1] = 1 * size.getComponent(i1);
				this.attributes.POSITION.PushArray(arr);
				this.attributes.NORMAL.PushArray(norm);
				this.attributes.TEXCOORD_0.PushArray([0, 1]);


				arr[i0] = 1 * size.getComponent(i0);
				arr[i1] = 1 * size.getComponent(i1);
				this.attributes.POSITION.PushArray(arr);
				this.attributes.NORMAL.PushArray(norm);
				this.attributes.TEXCOORD_0.PushArray([1, 1]);


				arr[i0] = 1 * size.getComponent(i0);
				arr[i1] = -1 * size.getComponent(i1);
				this.attributes.POSITION.PushArray(arr);
				this.attributes.NORMAL.PushArray(norm);
				this.attributes.TEXCOORD_0.PushArray([1, 0]);


					
				if (planeVal < 0) {
					this.indices.PushArray([startIndex + 0, startIndex + 1, startIndex + 2]);
					this.indices.PushArray([startIndex + 2, startIndex + 3, startIndex + 0]);
				}
				else {
					this.indices.PushArray([startIndex + 2, startIndex + 1, startIndex + 0]);
					this.indices.PushArray([startIndex + 0, startIndex + 3, startIndex + 2]);
				}
				startIndex += 4;
			}
		}
	}
}

export let getCubeGeom = () => {
	let geometry = new CubeGeometry(new Vector3().setScalar(1));

	geometry.SetLocations({[geometry.attributes.POSITION.name] : AttributePlacement.POSITION, [geometry.attributes.NORMAL.name] : AttributePlacement.NORMAL, [geometry.attributes.TEXCOORD_0.name] : AttributePlacement.TEXCOORD_0});
	
	return (geometry);
};