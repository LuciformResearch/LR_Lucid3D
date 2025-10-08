
import {Matrix4} from "./Math/Matrix4";
import {WebgpuMaterial} from "./PBRMaterial/WebgpuMaterial";
import {UniqueIDHelper} from "./Typescript/UniqueIDHelper";
import {WebgpuTransform} from "./WebgpuTransform";

// pour l'instant virer cette classe transform, mettre tout dans mesh base, 
// et ensuite on verra eventuellement pour une foncitonnalité du genre GetComponent(Transform)
// le pb c'est que la du coup ça crée des soucis faudrait que transform soit ce qui est stoqué dans la hierarchie sinon.
// ou au minimum c'est lui qui a les childs mais pareil ça pose des soucis faudra récupérer les meshs donc circular dependency pas top.

export class WebgpuSkin
{
	joints: WebgpuTransform[] = [];


	getJointMatrice(jointIndex: number, rootTransform: WebgpuTransform)
	{

		const joints = this.joints;
		const invBindMatrices = this.inverseBindMatrices;

		let thisMatWorldInv = rootTransform.GetMatrixWorld().invert();

		const i = jointIndex;
		let joint = joints[i];
		let invBindMatrix = invBindMatrices[i];

		let jointMat = joint.GetMatrixWorld();

		jointMat.multiply(invBindMatrix);
		jointMat.premultiply(thisMatWorldInv);

		let normalMatrix = jointMat.clone().invert();
		normalMatrix.transpose();

		return (jointMat.toArray().concat(normalMatrix.toArray()));


	}
	matricesStorageBuffer = (() =>
	{
		let matricesStorage: GPUBuffer = undefined;
		let floatArray: Float32Array = undefined;
		return (device: GPUDevice, rootTransform: WebgpuTransform) =>
		{
			if(matricesStorage == undefined)
			{
				const size: number = this.joints.length * 2 * 16;
					matricesStorage = device.createBuffer({
						// Storage layout: 16-byte header (useSkinning + padding) + matrices
						size: size * Float32Array.BYTES_PER_ELEMENT + 16,
						usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST
					});
				floatArray = new Float32Array(size);
			}
			for (let i = 0; i < this.joints.length; i++)
			{
				let mat = this.getJointMatrice(i, rootTransform);
				floatArray.set(mat, i * 16 * 2);
			}
				device.queue.writeBuffer(matricesStorage, 0, new Int32Array([1]).buffer, 0, Int32Array.BYTES_PER_ELEMENT);
				// matrices start at 16-byte offset to respect WGSL alignment
				device.queue.writeBuffer(matricesStorage, 16, floatArray.buffer, floatArray.byteOffset, floatArray.byteLength);
			return (matricesStorage);
		}
	})();
	//!!! jointsTexture: GLTexture = new GLTexture();
	inverseBindMatrices: Matrix4[] = [];
	private _root: WebgpuTransform = undefined;
	enabled: boolean = true;
	get root(): WebgpuTransform
	{
		if(this._root == undefined)
		{
			return (this.joints[0]);
		}
		return (this._root);
	}
	set root(value: WebgpuTransform)
	{
		this._root = value;
	}
	constructor()
	{
	}

}
