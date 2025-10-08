
import {Matrix4} from "./Math/Matrix4";
import {Vector3} from "./Math/Vector3";
import {Quaternion} from "./Math/Quaternion";
import {AbstractMeshBase, AbstractMeshGroup} from "./WebgpuMesh";
import {MathHelper} from "./Math/MathHelper";
import {LocRotScale} from "./Math/MathHelper";
import {WebgpuSceneRenderer} from "./WebgpuSceneRenderer";

// pour l'instant virer cette classe transform, mettre tout dans mesh base, 
// et ensuite on verra eventuellement pour une foncitonnalité du genre GetComponent(Transform)
// le pb c'est que la du coup ça crée des soucis faudrait que transform soit ce qui est stoqué dans la hierarchie sinon.
// ou au minimum c'est lui qui a les childs mais pareil ça pose des soucis faudra récupérer les meshs donc circular dependency pas top.
export class WebgpuTransform
{
	skinBuffer: GPUBuffer;
	PreparePass(sceneRenderer: WebgpuSceneRenderer, allMeshes: {mesh: AbstractMeshBase, tr: WebgpuTransform}[])
	{
		this.skinBuffer = this.matricesStorageBuffer(sceneRenderer.renderer.device);
		for(let i = 0; i < this.mesh.primitives.length; i++)
		{
			allMeshes.push({mesh: this.mesh.primitives[i], tr: this});
		}
		this.childs.forEach((child) =>
		{
			child.PreparePass(sceneRenderer, allMeshes);
		});
	}
	matricesStorageBuffer = (() =>
	{
		let matricesStorage: GPUBuffer = undefined;
		let floatArray: Float32Array = undefined;
		let size: number = 0;
		let hasSkin: boolean = false;
		return (device: GPUDevice) =>
		{
			if(this.mesh != undefined)
			{
				const skin = this.mesh.skin;
				const oldHasSkin = hasSkin;
				if(skin != undefined)
				{
					hasSkin = true;
					if(skin.joints.length > 0)
					{
						const oldSize = size;
						size = skin.joints.length * 2 * 16;
						if(matricesStorage != undefined && (size != oldSize || hasSkin != oldHasSkin))
						{
							matricesStorage.destroy();
							matricesStorage = undefined;
						}
						if(matricesStorage == undefined)
						{

							matricesStorage = device.createBuffer({
								// Storage layout: 16-byte header (useSkinning + padding) + matrices
								size: size * Float32Array.BYTES_PER_ELEMENT + 16,
								usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST
							});
							floatArray = new Float32Array(size);
						}
						for(let i = 0; i < skin.joints.length; i++)
						{
							let mat = skin.getJointMatrice(i, this);
							floatArray.set(mat, i * 16 * 2);
						}
							device.queue.writeBuffer(matricesStorage, 0, new Int32Array([1]).buffer, 0, Int32Array.BYTES_PER_ELEMENT);
							// matrices start at 16-byte offset to respect WGSL alignment
							device.queue.writeBuffer(matricesStorage, 16, floatArray.buffer, 0, size * Float32Array.BYTES_PER_ELEMENT);
						return (matricesStorage);
					}
				}
				else
				{
					hasSkin = false;
					if(matricesStorage != undefined && (hasSkin != oldHasSkin))
					{
						matricesStorage.destroy();
						matricesStorage = undefined;
					}
					if(matricesStorage == undefined)
					{
							// Allocate 16 bytes header to satisfy alignment even without matrices
							matricesStorage = device.createBuffer({
								size: 16,
								usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST
							});
						device.queue.writeBuffer(matricesStorage, 0, new Int32Array([0]).buffer, 0, Int32Array.BYTES_PER_ELEMENT);
					}
					return (matricesStorage);
				}
			}
		}
		/*
		
		return (device: GPUDevice, rootTransform: WebgpuTransform) =>
		{
			if(matricesStorage == undefined)
			{
				const size: number = this.joints.length * 2 * 16;
				matricesStorage = device.createBuffer({
					// as many matrices as bone count + an integer.
					
					size: size * Float32Array.BYTES_PER_ELEMENT+ Int32Array.BYTES_PER_ELEMENT,
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
			device.queue.writeBuffer(matricesStorage, Int32Array.BYTES_PER_ELEMENT, floatArray, floatArray.byteOffset, floatArray.byteLength);
			return (matricesStorage);
		}*/
	})();
	mesh: AbstractMeshGroup = new AbstractMeshGroup();
	srcNodeId: number = -1;
	FindInHiearchy(condition: (tr: WebgpuTransform) => boolean): WebgpuTransform[]
	{
		let res: WebgpuTransform[] = [];
		this.Traverse((child, index, parent) =>
		{
			if(condition(child))
			{
				res.push(child);
			}
		});
		return (res);
	}
	_Clone(): WebgpuTransform
	{
		let res: WebgpuTransform = new WebgpuTransform();
		res.name = this.name;
		res.visible = this.visible;
		res._preventUpdates = true;
		res.position.copy(this.position);
		res.quaternion.copy(this.quaternion);
		res.scale.copy(this.scale);
		res._preventUpdates = false;
		res._matrix = this._matrix ? this._matrix.clone() : undefined;
		res._matrixNeedsUpdate = this._matrixNeedsUpdate;
		res._matrixWorldNeedsUpdate = this._matrixWorldNeedsUpdate;
		res._matrixWorld = this._matrixWorld ? this._matrixWorld.clone() : undefined;
		res.mesh = this.mesh.clone();
		return (res);
	}
	Clone(): WebgpuTransform
	{
		let res: WebgpuTransform = this._Clone();
		for(var i = 0; i < this.childs.length; i++)
		{
			let child = this.childs[i].Clone();
			res.Add(child);
		}
		return (res);
	}
	name: string = "";
	visible: boolean = true;

	// get / set avec needs update pour les deux.
	// les updates se font hierarchicalement avant le render si necessaire.
	private get matrixWorldNeedsUpdate(): boolean
	{
		return (this._matrixWorldNeedsUpdate || this._matrixNeedsUpdate);
	}
	private _matrixWorldNeedsUpdate: boolean = false;
	private _preventUpdates: boolean = false;
	/*
	
		plutot que de traverser les enfants au changement de position etc...
		on traverse les parents au get matrixWorld vérifier que ya pas de needsUpdate au dessus,
		peut etre plutot une methode GetMatrixWorld(safeCheckParents: boolean = true) qui va checker les parents si un a changé.
		pour la matrice bah au changement de position elle se recalcule pas tout de suite elle est juste en mode needsUpdate.

	*/

	private _Traverse(func: (child: WebgpuTransform, index: number, parent: WebgpuTransform) => void, parent: WebgpuTransform, index: number)
	{
		func(this, index, parent);
		for(var i = 0; i < this.childs.length; i++)
		{
			this.childs[i]._Traverse(func, this, i);
		}
	}
	public Traverse(func: (child: WebgpuTransform, index: number, parent: WebgpuTransform) => void)
	{
		let index = undefined;
		let parent = this.parent;
		if(parent != undefined)
		{
			index = parent.childs.indexOf(this);
		}
		func(this, index, parent);
		for(var i = 0; i < this.childs.length; i++)
		{
			this.childs[i]._Traverse(func, this, i);
		}
	}

	private _matrixNeedsUpdate: boolean = false;
	private _matrix: Matrix4 = new Matrix4().identity();


	public UpdateMatrix()
	{
		if(this._matrixNeedsUpdate)
		{
			//console.log("matrix needed update...");
			this._matrixWorldNeedsUpdate = true;
			this._matrix.compose(this.position, this.quaternion, this.scale);
			this._matrixNeedsUpdate = false;
		}
	}
	public UpdateMatrixWorld(safeCheckParents: boolean = true)
	{
		if(safeCheckParents)
		{
			if(this.parent)
			{
				this.parent.UpdateMatrixWorld(true);
			}
		}
		if(this.matrixWorldNeedsUpdate)
		{

			this.UpdateMatrix();
			for(var i = 0; i < this.childs.length; i++)
			{
				this.childs[i]._matrixWorldNeedsUpdate = true;
			}
			if(this.parent)
			{
				let parentMat = this.parent._matrixWorld;
				this._matrixWorld = this.GetMatrix().premultiply(parentMat);
			}
			else
			{
				this._matrixWorld = this.GetMatrix();
			}
			this._matrixWorldNeedsUpdate = false;
		}
	}
	public GetWorldPosition(position: Vector3 = Vector3.Zero()): Vector3
	{
		let matWorld = this.GetMatrixWorld();
		return (position.applyMatrix4(matWorld));
	}
	public Rotate(angle: number, axis: Vector3)
	{
		this.quaternion.premultiply(new Quaternion().setFromRotationMatrix(new Matrix4().makeRotationAxis(angle, axis)));
	}


	public GetMatrixWorld(safeCheckParents: boolean = true): Matrix4
	{
		let parent: WebgpuTransform = this.parent;

		if(safeCheckParents && parent)
		{
			this.parent.UpdateMatrixWorld(true);
		}
		if(this.matrixWorldNeedsUpdate)
		{
			//console.log("world mat needed update...");
			this.UpdateMatrixWorld(false);
		}
		return (this._matrixWorld.clone());
	}
	public SetMatrixWorld(value: Matrix4, safeCheckParents: boolean = true)
	{
		if(this.parent)
		{
			let parentMat = this.parent.GetMatrixWorld(safeCheckParents).invert();
			this.SetMatrix((parentMat.multiply(value)));
			this._matrixWorld.copy(value);
			this._matrixWorldNeedsUpdate = false;
		}
	}

	public LerpFromLocRotScale(from: LocRotScale, to: LocRotScale, t: number, isLocal: boolean = false)
	{
		if(!isLocal)
		{
			let lrs0: LocRotScale = from;
			let lrs1: LocRotScale = to;
			let lerped = MathHelper.InterpolateLocRotScale(lrs0, lrs1, t);
			this.SetMatrixWorld(new Matrix4().compose(lerped.loc, lerped.rot, lerped.scale));
		}
		else
		{
			let lrs0: LocRotScale = from;
			let lrs1: LocRotScale = to;
			let lerped = MathHelper.InterpolateLocRotScale(lrs0, lrs1, t);
			this.position.copy(lerped.loc);
			this.quaternion.copy(lerped.rot);
			this.scale.copy(lerped.scale);
			this.UpdateMatrix();
		}
	}
	public Lerp(from: WebgpuTransform, to: WebgpuTransform, t: number, isLocal: boolean = false)
	{

		if((!isLocal) && (to.parent != this.parent || from.parent != this.parent))
		{
			let worldMat0 = from.GetMatrixWorld(true);
			let worldMat1 = to.GetMatrixWorld(true);
			let loc0 = new Vector3();
			let rot0 = new Quaternion();
			let scale0 = new Vector3();
			worldMat0.decompose(loc0, rot0, scale0);
			let loc1 = new Vector3();
			let rot1 = new Quaternion();
			let scale1 = new Vector3();
			worldMat1.decompose(loc1, rot1, scale1);
			let lrs0: LocRotScale = {loc: loc0, rot: rot0, scale: scale0};
			let lrs1: LocRotScale = {loc: loc1, rot: rot1, scale: scale1};
			let lerped = MathHelper.InterpolateLocRotScale(lrs0, lrs1, t);
			this.SetMatrixWorld(new Matrix4().compose(lerped.loc, lerped.rot, lerped.scale));
		}
		else
		{
			let tr0 = from;
			let tr1 = to;
			let lrs0: LocRotScale = {loc: tr0.position.clone(), rot: tr0.quaternion.clone(), scale: tr0.scale.clone()};
			let lrs1: LocRotScale = {loc: tr1.position.clone(), rot: tr1.quaternion.clone(), scale: tr1.scale.clone()};
			let lerped = MathHelper.InterpolateLocRotScale(lrs0, lrs1, t);
			this.position.copy(lerped.loc);
			this.quaternion.copy(lerped.rot);
			this.scale.copy(lerped.scale);
			this.UpdateMatrix();
		}
	}
	public GetMatrix()
	{
		this.UpdateMatrix();
		return (this._matrix.clone());
	}
	public SetMatrix(value: Matrix4)
	{
		this._matrix.copy(value);
		this._preventUpdates = true;
		this._matrix.decompose(this.position, this.quaternion, this.scale);
		this._preventUpdates = false;
		this._matrixWorldNeedsUpdate = true;
		for(var i = 0; i < this.childs.length; i++)
		{
			this.childs[i]._matrixWorldNeedsUpdate = true;
		}
		this._matrixNeedsUpdate = false;
	}

	private _matrixWorld: Matrix4 = new Matrix4().identity();

	public readonly scale: Vector3 = new Vector3(1, 1, 1);
	public readonly quaternion: Quaternion = new Quaternion().identity();
	public readonly position: Vector3 = new Vector3(0, 0, 0);

	// position/rotation/scale?
	Add(child: WebgpuTransform, keepWorldPosition: boolean = false)
	{
		child.SetParent(this, keepWorldPosition);
	}
	SetParent(parent: WebgpuTransform, keepWorldPosition: boolean = false)
	{
		let child = this;
		let matrixWorld: Matrix4 = undefined;
		if(keepWorldPosition)
		{
			matrixWorld = child.GetMatrixWorld();
		}
		if(child.parent != undefined)
		{

			let index = child.parent.childs.indexOf(child);
			if(index >= 0)
			{
				child.parent.childs.splice(index, 1);
			}
		}
		child.parent = parent;
		if(parent != undefined)
		{
			parent.childs.push(child);
		}
		if(keepWorldPosition)
		{
			child.SetMatrixWorld(matrixWorld);
		}
		else
		{
			child._matrixWorldNeedsUpdate = true;
		}
	}
	Remove(child: WebgpuTransform, keepWorldPosition: boolean = false)
	{
		child.SetParent(undefined, keepWorldPosition);
	}
	private parent: WebgpuTransform = undefined;
	public childs: WebgpuTransform[] = [];

	constructor()
	{
		this.position.onChange = () =>
		{
			if(this._preventUpdates == false)
			{
				this._matrixNeedsUpdate = true;
			}
		};
		this.quaternion.onChange = () =>
		{
			if(this._preventUpdates == false)
			{

				this._matrixNeedsUpdate = true;
			}
		};
		this.scale.onChange = () =>
		{
			if(this._preventUpdates == false)
			{
				this._matrixNeedsUpdate = true;
			}
		};

	}
}
