import {GL} from "./WebgpuApp";
import {Vector2} from "./Math/Vector2";
import {Vector3} from "./Math/Vector3";
import {Vector4} from "./Math/Vector4";
import {Gltf2BufferView, RenderBuffer2, TypedArray} from "./Loaders/GLTF2WGPU2";
import {getFloat16} from "@petamoriken/float16";
import {WebgpuIndexAttribute, WebgpuVertexAttribDescriptor, WebgpuVertexAttribute} from "./WebgpuSamples/CubeGeometry";
import {WebgpuMain} from "./WebgpuMain";
import {WebgpuMaterial} from "./PBRMaterial/WebgpuMaterial";
/*
	@location(0) a_position: vec3<f32>,
	@location(1) a_normal: vec3<f32>,
	@location(2) a_tangent: vec4<f32>,
	@location(3) a_color_0: vec4<f32>,
	@location(4) a_texcoord_0: vec2<f32>,
	@location(5) a_texcoord_1: vec2<f32>,

*/
export enum AttributePlacement
{
	POSITION = 0,
	NORMAL = 1,
	TANGENT = 2,
	COLOR = 3,
	TEXCOORD_0 = 4,
	TEXCOORD_1 = 5,
	JOINTS_0 = 6,
	WEIGHTS_0 = 7,
	JOINTS_1 = 8,
	WEIGHTS_1 = 9,
}
export enum AttributeComponentCount
{
    POSITION = 3,
    TEXCOORD_0 = 2,
    TEXCOORD_1 = 2,
    NORMAL = 3,
    TANGENT = 4,
    COLOR = 4,
    JOINTS_0 = 4,
    WEIGHTS_0 = 4,
    JOINTS_1 = 4,
    WEIGHTS_1 = 4,
}

export enum AttributeType
{
    POSITION = "float32x",
    TEXCOORD_0 = "float32x",
    TEXCOORD_1 = "float32x",
    NORMAL = "float32x",
    TANGENT = "float32x",
    COLOR = "float32x",
    JOINTS_0 = "float32x",
    WEIGHTS_0 = "float32x",
    JOINTS_1 = "float32x",
    WEIGHTS_1 = "float32x",
}



/*

	il faut trouver une solution pour maintenant depuis un attribut non spécialisé webgpu, pouvoir en avoir un spécialisé avec une location. 
*/



export abstract class AbstractAttributeBase
{
	private _location: number = -1;
	public get location(): number
	{
		return (this._location);
	}
	public set location(value: number)
	{
		this._location = value;
	}
	public abstract get isPositions(): boolean;

	public abstract get isIndices(): boolean;
	public abstract getCount(): number;
	constructor(public itemSize: number, public geom?: AbstractGeomBase, public name?: string)
	{
	}
}


export class AbstractReadonlyAttributeBase extends AbstractAttributeBase
{
	public getCount(): number
	{
		return (this.elementCount);
	}
	protected _buffer: GPUBuffer = undefined;
	public static CompononentCount: Map<string, number> = new Map(
		[
			["SCALAR", 1],
			["VEC2", 2],
			["VEC3", 3],
			["VEC4", 4],
			["MAT2", 4],
			["MAT3", 9],
			["MAT4", 16]
		]
	)

	getComponentCount()
	{
		return AbstractReadonlyAttributeBase.CompononentCount.get(this.type);
	}

	getComponentSize()
	{
		switch(this.componentType)
		{
			case GL.BYTE:
			case GL.UNSIGNED_BYTE:
				return 1;
			case GL.SHORT:
			case GL.UNSIGNED_SHORT:
				return 2;
			case GL.UNSIGNED_INT:
			case GL.FLOAT:
				return 4;
			default:
				return 0;
		}
	}

	public async ExtractTypedArray(): Promise<Int8Array | Int16Array | Uint8Array | Uint16Array | Uint32Array | Float32Array>
	{
		let dvInd = await Promise.resolve(this.bufferView.dataView());
		//let testIndices = new Int32Array(dvInd.buffer,  this.offset, this.bufferView.byteLength);
		//console.log("POS TEST IND BEGIN: " + dvInd.byteLength + this.offset);
		//console.log("POS TEST this: " + testthis);
		//console.log("POS TEST == " + (dvInd.buffer == dvPos.buffer));
		const bufferView = this.bufferView;
		const buffer = await this.bufferView.buffer.arrayBuffer();
		const byteOffset = this.bufferView.byteOffset;
		const componentSize = this.getComponentSize();
		let componentCount = this.getComponentCount();

		const arrayLength = this.elementCount * componentCount;

		let stride = bufferView.byteStride !== 0 ? bufferView.byteStride : componentCount * componentSize;
		let dv = dvInd;//new DataView(buffer, byteOffset, this.elementCount * stride);
		let filteredView: Int8Array | Int16Array | Uint8Array | Uint16Array | Uint32Array | Float32Array;
		let func = 'getFloat32';
		//(buffer.buffer, byteOffset, arrayLength);
		switch(this.componentType)
		{
			case GL.BYTE:
				filteredView = new Int8Array(buffer, byteOffset, arrayLength);
				func = 'getInt8';
				break;
			case GL.UNSIGNED_BYTE:
				filteredView = new Uint8Array(buffer, byteOffset, arrayLength);
				func = 'getUint8';
				break;
			case GL.SHORT:
				filteredView = new Int16Array(buffer, byteOffset, arrayLength);
				func = 'getInt16';
				break;
			case GL.UNSIGNED_SHORT:
				filteredView = new Uint16Array(buffer, byteOffset, arrayLength);
				func = 'getUint16';
				break;
			case GL.UNSIGNED_INT:
				filteredView = new Uint32Array(buffer, byteOffset, arrayLength);
				func = 'getUint32';
				break;
			case GL.FLOAT:
				filteredView = new Float32Array(buffer, byteOffset, arrayLength);
				func = 'getFloat32';
				break;
		}
		return (filteredView);
	}

	private _len: number;
	constructor(public readonly name: string, public bufferView: Gltf2BufferView, public readonly renderBuffer: RenderBuffer2,
		public readonly elementCount: number,
		public readonly componentCount: number,
		public readonly componentType: any,
		public readonly type: string,
		public readonly normalized: boolean,
		public readonly stride: number = 0, public readonly offset: number = 0,

		geom: AbstractGeomBase = undefined, public readonly isIndices: boolean = false, public readonly isPositions: boolean = false)
	{
		super(componentCount, geom, name);

	}
}

export class AbstractDynamicAttributeBase extends AbstractAttributeBase
{
	private _webgpuBuffer: GPUBuffer;
	private _webgpuBufferNeedUpdate: boolean = false;
	private _arrayNeedUpdate: boolean = true;
	private _array: TypedArray = new Float32Array();

	getArrayBuffer(updated : {updated: boolean} = {updated: false})
	{
		if(this._arrayNeedUpdate == true)
		{
			this._array = this.isIndices ? new Uint16Array(this.baseArray) : new Float32Array(this.baseArray);
			this._arrayNeedUpdate = false;
			updated.updated = true;
		}
		return (this._array);
	}
	getWebgpuBuffer(material: WebgpuMaterial)
	{
		if(this._webgpuBuffer == undefined || this._webgpuBufferNeedUpdate == true)
		{
			this._webgpuBufferNeedUpdate = false;
			let array = this.isIndices ? new Uint16Array(this.baseArray) : new Float32Array(this.baseArray);
			if(this._webgpuBuffer != undefined)
			{
				this._webgpuBuffer.destroy();
				this._webgpuBuffer = undefined;
			}
			if(this._webgpuBuffer == undefined)
			{
				// WebGPU requires size to be a multiple of 4 when mappedAtCreation is true
				const alignedSize = (array.byteLength + 3) & ~3;
				let buffer = material.renderer.device.createBuffer({
					usage: this.isIndices ? GPUBufferUsage.INDEX : GPUBufferUsage.VERTEX,
					size: alignedSize, mappedAtCreation: true
				});
				this._webgpuBuffer = buffer;
				if(this.isIndices)
				{
					new Uint16Array(this._webgpuBuffer.getMappedRange()).set(array);

				}
				else
				{
					new Float32Array(this._webgpuBuffer.getMappedRange()).set(array);
				}
				this._webgpuBuffer.unmap();
			}
		}
		return (this._webgpuBuffer);
	}

	private _isPositions: boolean;
	public get isPositions(): boolean
	{
		return (this._isPositions);
	}
	public set isPositions(value: boolean)
	{
		this._isPositions = value;
	}
	public getCount(): number
	{
		return (this.Count);
	}

	protected _buffer: GPUBuffer;

	floatArray: Float32Array | Uint16Array = undefined;
	static FromComponentCount(elemCount: number): AbstractDynamicAttributeBase
	{
		switch(elemCount)
		{
			case 1:
				return (new AbstractFloatAttribute());
			case 2:
				return (new AbstractV2Attribute());
			case 3:
				return (new AbstractV3Attribute());
			case 4:
				return (new AbstractV4Attribute());
		}
	}
	constructor(public itemSize: number, public geom?: AbstractDynamicGeom, public name?: string)
	{
		super(itemSize, geom, name);
	}
	public isIndices = false;
	RebuildBuffer()
	{
		this.floatArray = this.isIndices ? new Uint16Array(this.baseArray) : new Float32Array(this.baseArray);
		this._count = this.floatArray.length / this.itemSize;
		this._webgpuBufferNeedUpdate = true;
		this._arrayNeedUpdate = true;
	}
	public Clear()
	{
		this._bufferNeedsUpdate = true;
		this.baseArray = [];
		this._count = 0;
	}

	protected _count: number = 0;
	public get Count(): number
	{
		return (this._count);
	}
	public set Count(value: number)
	{
		if(this._count == value)
		{
			return;
		}
		else
		{
			this._bufferNeedsUpdate = true;
			let originalCount = this._count;
			this._count = value;
			if(originalCount > this._count)
			{
				let res: number[] = [];
				for(var i = 0; i < this._count * this.itemSize; i++)
				{
					res.push(this.baseArray[i]);
				}
				this.baseArray = res;
			}
			else
			{
				for(var i = originalCount * this.itemSize; i < this._count * this.itemSize; i++)
				{
					this.baseArray.push(0);
				}
			}
			this.RebuildBuffer();
		}
	}
	protected _bufferNeedsUpdate: boolean = false;
	public baseArray: number[] = [];

	public get length(): number
	{
		return (this._count);
	}
}

export class AbstractAttribute<T extends number | Vector2 | Vector3 | Vector4> extends AbstractDynamicAttributeBase
{



	constructor(public itemSize: number, public geom?: AbstractDynamicGeom, public name?: string)
	{
		super(itemSize, geom, name);

	}

	public Push(...value: T[])
	{

		if(this.itemSize == 1)
		{
			for(let i = 0; i < value.length; i++)
			{
				this.baseArray.push(value[i] as number);
			}
		}
		else
		{
			for(let k = 0; k < value.length; k++)
			{
				for(let i = 0; i < this.itemSize; i++)
				{
					this.baseArray.push((value[k] as Vector2).getComponent(i));
				}
			}
		}
		this._bufferNeedsUpdate = true;
		this._count += value.length;
	}


	private _byItemSizeResult = undefined;
	public Get(index: number): T
	{
		let itemSize = this.itemSize;
		if(this._byItemSizeResult == undefined)
		{
			let byItemSizeResult = {
				1: (index: number) =>
				{
					return (this.baseArray[index]);
				},
				2: (index: number) =>
				{
					return (new Vector2(this.baseArray[index * 2 + 0], this.baseArray[index * 2 + 1]));
				},
				3: (index: number) =>
				{
					return (new Vector3(this.baseArray[index * 3 + 0], this.baseArray[index * 3 + 1], this.baseArray[index * 3 + 2]));
				},
				4: (index: number) =>
				{
					return (new Vector4(this.baseArray[index * 4 + 0], this.baseArray[index * 4 + 1], this.baseArray[index * 4 + 2], this.baseArray[index * 4 + 3]));
				},
			}
			this._byItemSizeResult = byItemSizeResult;
		}
		return (this._byItemSizeResult[itemSize](index));
	}

	public PushArray(value: number[])
	{
		for(var i = 0; i < value.length; i++)
		{
			this.baseArray.push(value[i]);
		}
		this._bufferNeedsUpdate = true;
	}
	public SetArray(index: number, value: ArrayLike<number>)
	{
		let startIndex = index * this.itemSize;
		for(var i = 0; i < value.length; i++)
		{
			let offset = startIndex + i;
			this.baseArray[offset] = value[i];
		}
		if(!(this._bufferNeedsUpdate))
		{

			GL.bufferSubData(GL.ARRAY_BUFFER, Float32Array.BYTES_PER_ELEMENT * this.itemSize * index, new Float32Array(value));
		}
	}
	public Set(index: number, value: T)
	{


		if(this.Count < index)
		{
			throw new Error("Attribute Element Out Of Range. " + this.name);
		}
		if(this.itemSize == 1)
		{
			this.baseArray[index] = value as number;
			if(!this._bufferNeedsUpdate)
			{
				GL.bindBuffer(GL.ARRAY_BUFFER, this._buffer);
				GL.bufferSubData(GL.ARRAY_BUFFER, Float32Array.BYTES_PER_ELEMENT * this.itemSize * index, new Float32Array([value as number]));
				this.floatArray[index] = value as number;
			}
		}
		else
		{
			for(var i = 0; i < this.itemSize; i++)
			{
				this.baseArray[index * this.itemSize + i] = (value as Vector2).getComponent(i);
				if(!this._bufferNeedsUpdate)
				{
					GL.bindBuffer(GL.ARRAY_BUFFER, this._buffer);
					GL.bufferSubData(GL.ARRAY_BUFFER, Float32Array.BYTES_PER_ELEMENT * this.itemSize * index, new Float32Array((value as Vector2).toArray()));
					this.floatArray[index * this.itemSize + i] = (value as Vector2).getComponent(i);
				}
			}
		}
	}

}
export class AbstractFloatAttribute extends AbstractAttribute<number>
{
	constructor(public geom?: AbstractDynamicGeom, public name?: string)
	{
		super(1, geom, name);
	}

}
export class AbstractIndices extends AbstractAttribute<number>
{

	constructor(public geom?: AbstractDynamicGeom, public name?: string)
	{
		super(1);
		this.isIndices = true;
	}
}
export class AbstractV2Attribute extends AbstractAttribute<Vector2>
{
	constructor(public geom?: AbstractDynamicGeom, public name?: string)
	{
		super(2, geom, name);
	}

}
export class AbstractV3Attribute extends AbstractAttribute<Vector3>
{

	constructor(public geom?: AbstractDynamicGeom, public name?: string)
	{
		super(3, geom, name);
	}

}

export class AbstractPositionAttribute extends AbstractV3Attribute
{

	constructor(public geom?: AbstractDynamicGeom, public name?: string)
	{
		super(geom, name);
		this.isPositions = true;
	}

}
export class AbstractV4Attribute extends AbstractAttribute<Vector4>
{
	constructor(public geom?: AbstractDynamicGeom, public name?: string)
	{
		super(4, geom, name);
	}
}

export abstract class AbstractGeomBase
{

	public abstract byNameAttributes: {[index: string]: AbstractAttributeBase};
	public abstract Initialize();

	protected allAttributes: AbstractAttributeBase[] = [];
	public SetLocations(locations: {[index: string]: number})
	{
		for(let key in locations)
		{
			let attr = this.byNameAttributes[key];
			if(attr != undefined)
			{
				attr.location = locations[key];
			}
		}
	}

}

export class AbstractReadonlyGeom extends AbstractGeomBase
{

	constructor(attributes: {[index: string]: AbstractReadonlyAttributeBase | AbstractDynamicAttributeBase}, public readonly elementCount: number, public readonly indices: AbstractReadonlyAttributeBase | AbstractDynamicAttributeBase = undefined)
	{
		super();
		this.byNameAttributes = attributes;
		if(indices)
		{
			indices.geom = this;
		}
		this.Initialize();
	}


	protected allAttributes: (AbstractReadonlyAttributeBase | AbstractDynamicAttributeBase)[] = [];
	protected dynamicAttributes: AbstractDynamicAttributeBase[] = [];
	public byNameAttributes: {[index: string]: AbstractReadonlyAttributeBase | AbstractDynamicAttributeBase};
	public byBufferAttributes: {[index: number]: (AbstractReadonlyAttributeBase | AbstractDynamicAttributeBase)[]} = {};
	private buffers: RenderBuffer2[] = [];
	public Initialize()
	{
		let attributes = this.byNameAttributes;
		if(attributes)
		{
			let values = Object.values(attributes);
			for(var i = 0; i < values.length; i++)
			{

			}
			let keys = Object.keys(attributes);
			for(var i = 0; i < keys.length; i++)
			{
				let attr = attributes[keys[i]];

				attr.geom = this;
				this.allAttributes.push(attr);
				if(attr instanceof AbstractReadonlyAttributeBase)
				{
					let index = this.buffers.indexOf(attr.renderBuffer);
					if(index < 0)
					{
						index = this.buffers.length;
						this.buffers.push(attr.renderBuffer);
						this.byBufferAttributes[index] = [];
						this.byBufferAttributes[index].push(attr);
					}
					else
					{
						this.byBufferAttributes[index].push(attr);
					}
				}
				else
				{
					this.dynamicAttributes.push(attr);
				}
			}
		}
	}

}
export class AbstractDynamicGeom extends AbstractGeomBase
{

	public GetWebGPUAttributes()
	{
		let webgpuAttrs = WebgpuHelper.GetWebgpuAttribute(this);
		return (webgpuAttrs);
	}
	private _webgpuBuffers: GPUBuffer[] = undefined;
	private _indexBuffer: GPUBuffer = undefined;
	private _indexCount: number = 0;
	public GetWebgpuIndexBuffer(renderer: WebgpuMain)
	{
		if(this._indexBuffer == undefined)
		{
			let attrs = this.GetWebGPUAttributes();
			this._indexBuffer = renderer.device.createBuffer({
				size: attrs.index.value.byteLength,
				usage: GPUBufferUsage.INDEX,
				mappedAtCreation: true,
			});
			this._indexCount = attrs.index.value.length;
			new Uint16Array(this._indexBuffer.getMappedRange()).set(attrs.index.value);
			this._indexBuffer.unmap();
		}
		return ({buffer: this._indexBuffer, count: this._indexCount});
	}
	public GetWebgpuBuffers(material: WebgpuMaterial)
	{

	}
	/*public GetWebgpuBuffers(renderer: WebgpuMain, ...names: string[]) {
		if (this._webgpuBuffers == undefined) {
			this._webgpuBuffers = [];
			let attrs = this.GetWebGPUAttributes();
			attrs.attributes.forEach((val) => {
				let name = val.descriptor.name;
				if (names.indexOf(name) >= 0) {
					let buffer = renderer.device.createBuffer({
						size: val.value.byteLength,
						usage: GPUBufferUsage.VERTEX,
						mappedAtCreation: true,
					});
					new Float32Array(buffer.getMappedRange()).set(val.value);
					buffer.unmap();
					this._webgpuBuffers.push(buffer);
				}

				//this.bufferLocation.push(val.descriptor.type);
			});

		}
		return (this._webgpuBuffers);

	}*/
	private _positionAttribute: AbstractDynamicAttributeBase = undefined;
	public get positionAttribute(): AbstractDynamicAttributeBase
	{
		if(this._positionAttribute == undefined)
		{
			let attribs = this.allAttributes;
			for(var i = 0; i < attribs.length; i++)
			{
				if(attribs[i].isPositions)
				{
					this._positionAttribute = attribs[i];
					break;
				}
			}
			if(this._positionAttribute == undefined)
			{
				if(this.byNameAttributes["a_position"] != undefined)
				{
					this._positionAttribute = this.byNameAttributes["a_position"];
				}
				else if(this.byNameAttributes["POSITION"] != undefined)
				{
					this._positionAttribute = this.byNameAttributes["POSITION"];
				}
			}
		}
		return (this._positionAttribute);
	}
	public SetPositionAttribute(value: AbstractDynamicAttributeBase)
	{
		this._positionAttribute = value;
	}
	private _indices: AbstractIndices = undefined;
	public get indices(): AbstractIndices
	{
		if(this._indices == undefined)
		{


			if(this.byNameAttributes["index"] != undefined && this.byNameAttributes["index"].isIndices)
			{
				this._indices = this.byNameAttributes["index"] as AbstractIndices;
			}
			else
			{
				for(let key in this.byNameAttributes)
				{
					if(this.byNameAttributes[key].isIndices)
					{
						this._indices = (this.byNameAttributes[key] as AbstractIndices);
					}
				}
			}
		}

		return (this._indices);
	}
	byNameAttributes: {[index: string]: AbstractDynamicAttributeBase};
	Initialize()
	{
		let attributes = this.byNameAttributes;
		if(attributes)
		{
			let keys = Object.keys(attributes);
			for(var i = 0; i < keys.length; i++)
			{
				if(attributes[keys[i]] == undefined)
				{
					let key = keys[i];
					debugger;
				}
				attributes[keys[i]].name = keys[i];
				attributes[keys[i]].geom = this;
				this.allAttributes.push(attributes[keys[i]]);
			}
		}
	}
	constructor(attributes: {[index: string]: AbstractDynamicAttributeBase})
	{
		super();
		this.byNameAttributes = attributes;
		this.Initialize();
	}
	GetAttribute<T extends number | Vector2 | Vector3 | Vector4>(location: number, name: string, itemSize?: number)
	{
		if(this.byNameAttributes[name] != undefined)
		{
			return (this.byNameAttributes[name] as AbstractAttribute<T>);
		}
		else
		{
			if(itemSize == undefined)
			{
				throw new Error("Getting undefined attribute without providing item size.");
			}
			let attr = new AbstractAttribute<T>(itemSize, this, name);
			this.byNameAttributes[name] = attr;
			this.allAttributes.push(attr);
		}
	}

	protected allAttributes: AbstractDynamicAttributeBase[] = [];

	toJSON()
	{
		throw new Error('Method not implemented.');
	}
}

export class WebgpuHelper
{
	static GetWebgpuAttribute(geom: AbstractDynamicGeom)
	{
		let attributes: WebgpuVertexAttribute[] = [];
		for(let key in geom.byNameAttributes)
		{
			let value = geom.byNameAttributes[key];
			if(value.isIndices == false)
			{
				value.RebuildBuffer();
				let name = value.name;
				let componentCount = value.itemSize;
				let type = value.location;
				let array = value.floatArray;

				attributes.push(new WebgpuVertexAttribute(new WebgpuVertexAttribDescriptor({name: name, componentCount: componentCount, type: type as any}), array as Float32Array));
			}
		}
		let index: WebgpuIndexAttribute = undefined;
		if(geom.indices != undefined)
		{
			geom.indices.RebuildBuffer();
			index = new WebgpuIndexAttribute(geom.indices.floatArray as Uint16Array);
		}
		return ({attributes, index});
	}
}


export class SimpleGeometry2D extends AbstractDynamicGeom
{

	constructor(public attributes = {
		a_position: new AbstractV2Attribute(),
		a_normal: new AbstractV2Attribute(),
		a_uv: new AbstractV2Attribute(),
	})
	{

		super(attributes);
		this.attributes.a_normal.Get(1).x;
		this.attributes.a_normal.Set(1, new Vector2(55, 12));
	}
	// this.byNameAttributes

}

export class SimpleGeometry3D extends AbstractDynamicGeom
{

	constructor(public attributes = {
		a_position: new AbstractV3Attribute(),
		a_normal: new AbstractV3Attribute(),
		a_uv: new AbstractV2Attribute(),
	})
	{

		super(attributes);
	}
	// this.byNameAttributes

}

export class SimpleVertexColorGeometry extends AbstractDynamicGeom
{

	constructor(public attributes = {
		a_position: new AbstractV3Attribute(),
		a_color: new AbstractV4Attribute(),
	})
	{

		super(attributes);

	}
	// this.byNameAttributes

}
