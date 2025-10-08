

export var GLConstants = WebGLRenderingContext;
import { Delegate } from "./Typescript/Delegate";
import { UniqueIDHelper } from "./Typescript/UniqueIDHelper";




export enum TEXTURE_MIN_FILTER {
    LINEAR = GLConstants.LINEAR,
    NEAREST = GLConstants.NEAREST,
    NEAREST_MIPMAP_NEAREST = GLConstants.NEAREST_MIPMAP_NEAREST,
    LINEAR_MIPMAP_NEAREST = GLConstants.LINEAR_MIPMAP_NEAREST,
    NEAREST_MIPMAP_LINEAR = GLConstants.NEAREST_MIPMAP_LINEAR, //(valeur par défaut), 
    LINEAR_MIPMAP_LINEAR = GLConstants.LINEAR_MIPMAP_LINEAR
}

export enum TEXTURE_MAG_FILTER {
    LINEAR = GLConstants.LINEAR, // (valeur par défaut), 
    NEAREST = GLConstants.NEAREST
}

export enum TEXTURE_WRAP_S {
    REPEAT = GLConstants.REPEAT,// (valeur par défaut), 
    CLAMP_TO_EDGE = GLConstants.CLAMP_TO_EDGE,
    MIRRORED_REPEAT = GLConstants.MIRRORED_REPEAT
}

export enum TEXTURE_WRAP_T {
    REPEAT = GLConstants.REPEAT,// (valeur par défaut), 
    CLAMP_TO_EDGE = GLConstants.CLAMP_TO_EDGE,
    MIRRORED_REPEAT = GLConstants.MIRRORED_REPEAT
}
/*
gl.LINEAR, gl.NEAREST, gl.NEAREST_MIPMAP_NEAREST, gl.LINEAR_MIPMAP_NEAREST, gl.NEAREST_MIPMAP_LINEAR (valeur par défaut), gl.LINEAR_MIPMAP_LINEAR

*/

export class LucidSampler implements GPUSamplerDescriptor {
    magFilter: GPUFilterMode = "linear";
    minFilter: GPUFilterMode = "linear";
    addressModeU: GPUAddressMode = "clamp-to-edge";
    mipmapFilter: GPUMipmapFilterMode = "nearest";

    Equals(other: LucidSampler | GPUSamplerDescriptor) {
        let keys = Object.keys(this);
        for (let i = 0; i < keys.length; i++)
        {
            if (this[keys[i]] != other[keys[i]])
            {
                return (false);
            }
        }
        return (true);
    }
    Copy(other: LucidSampler | GPUSamplerDescriptor) {
        let keys = Object.keys(this);
        for (let i = 0; i < keys.length; i++)
        {
            this[keys[i]] = other[keys[i]];
        }
        return (true);
    }
    Clone() {
        let keys = Object.keys(this);
        let clone = new LucidSampler();
        for (let i = 0; i < keys.length; i++)
        {
            clone[keys[i]] = this[keys[i]];
        }
    }
}

export class LucidTexture {
    private _glTexture: WebGLTexture;
    private _gpuTexture: GPUTexture;
    sampler: LucidSampler = new LucidSampler();
    GetGLTexture() {
        
    }
}

export class LucidGLTexture {
    private _ready: boolean = false;
    public get ready(): boolean
    {
        return (this._ready);
    }
    private _sampler: LucidSampler = new LucidSampler();
    constructor(public readonly texture: LucidTexture) {

    }
    private _Update()
    {
        //...this._isReady = true;
/*
        let mipmap = this._sampler.mipmapFilter;
        if (mipmap) {

            GL.bindTexture(GLConstants.TEXTURE_2D, this.glTexture);
            GL.generateMipmap(GLConstants.TEXTURE_2D);
            GL.bindTexture(GLConstants.TEXTURE_2D, null);
        }
        let powerOfTwo = this.isPowerOfTwo;
        // dés que ready.
        let minFilter = this.minFilter || (mipmap ? TEXTURE_MIN_FILTER.LINEAR_MIPMAP_LINEAR : TEXTURE_MIN_FILTER.LINEAR);
        this.minFilter = minFilter;
        this.magFilter = this.magFilter;

        let wrapS = this.wrapS || (powerOfTwo ? TEXTURE_WRAP_S.REPEAT : TEXTURE_WRAP_S.CLAMP_TO_EDGE);
        let wrapT = this.wrapT || (powerOfTwo ? TEXTURE_WRAP_T.REPEAT : TEXTURE_WRAP_T.CLAMP_TO_EDGE);
        this.wrapS = wrapS;
        this.wrapT = wrapT;*/
    }
    ReadyUp(sampler: LucidSampler)
    {
        if (sampler == undefined)
        {
            throw new Error("[LucidGLTexture]: Sampler can't be undfined.");
        }
        if ((!this._ready) || (this._sampler.Equals(sampler) == false))
        {
            this._sampler.Copy(sampler);
            this._Update();
        }
    }
}

export class OnResetObjectDelegate<T> extends Delegate<{ instance: T }>
{

}
export interface Killable {
    __KILL__();
}

export abstract class ObjectPool<T, U>
{
    OnReset: OnResetObjectDelegate<T> = new OnResetObjectDelegate<T>();
    //runningInstances: T[] = [];
    deadInstances: T[] = [];
    runningInstances: { [index: string]: T } = {};
    protected abstract KillInstance(value: T);
    abstract ResetInstance(value: T, data: U);
    count: number = 0;

    constructor(public creator: (index: number, data?: U) => T) {

    }
    KillOne(value: T) {
        if (this.runningInstances[UniqueIDHelper.GetUUID(value)] != undefined) {
            //this.runningInstances[UniqueIDHelper.GetUUID(value)] = undefined as any;
            delete this.runningInstances[UniqueIDHelper.GetUUID(value)];

            this.KillInstance(value);
            this.deadInstances.push(value);
        }
        else {
            console.error("THIS INSTANCE DOES NOT BELONG TO THIS POOL...");
        }
    }
    GetOne(data?: U): T {
        var newInst: T = undefined;
        if (this.deadInstances.length > 0) {
            newInst = this.deadInstances.pop();
        }
        else {
            newInst = this.creator(this.count + 1, data);
            newInst["__pool__"] = this;
            (newInst as any as Killable).__KILL__ = () => {
                this.KillOne(newInst);
            }
            this.count++;
        }

        this.ResetInstance(newInst, data);
        this.OnReset.invoke({ instance: newInst });
        this.runningInstances[UniqueIDHelper.GetUUID(newInst)] = newInst;
        return (newInst);
    }
    DestroyAll(): void {
        var keys = Object.keys(this.runningInstances);
        for (var i = 0; i < keys.length; i++) {
            this.KillInstance(this.runningInstances[keys[i]]);
            this.deadInstances.push(this.runningInstances[keys[i]]);
        }
        this.runningInstances = {};
    }
}

// export class MeshPool<T extends THREE.Mesh> extends ObjectPool<T, any>
// {
//     protected KillInstance(value: THREE.Mesh) {
//         value.visible = (false);
//     }
//     ResetInstance(value: THREE.Mesh) {
//         value.visible = (true);
//     }
// }

