
import { quat } from "gl-matrix";
import { MathHelper } from "./Math/MathHelper";
import { Quaternion } from "./Math/Quaternion";
import { Vector3 } from "./Math/Vector3";
import { WebgpuTransform } from "./WebgpuTransform";

export enum WebgpuAnimationInterpolation {
	LINEAR = "LINEAR",
	STEP = "STEP",
	CUBICSPLINE = "CUBICSPLINE"
}
export enum WebgpuAnimationPath
{
	translation = "translation",
	rotation = "rotation",
	scale = "scale"
}
export class CubicKeyFrame<T>
{
	InTangent: T;
	SplineVertex: T;
	OutTangent: T;
}
export class WebgpuAnimationSampler {
	
	maxTime: number = 0;
	private LoopTime(time: number)
	{
		time = time % this.maxTime;
		return (time);
	}
	GetPreviousFrameIndex(time: number): number {
		if (time < 0)
		{
			return (0);
		}
		if (time >= this.times[this.times.length - 1])
		{
			return (this.times.length - 1);
		}
		for (var i = 0; i < this.times.length; i++) {
			if (this.times[i] > time) {
				return (Math.max((i - 1), 0));
			}
		}
	}
	GetNextFrameIndex(time: number): number {
		if (time < 0)
		{
			return (0);
		}
		if (time >= this.times[this.times.length - 1])
		{
			return (this.times.length - 1);
		}
		for (var i = 0; i < this.times.length; i++) {
			if (this.times[i] > time) {
				return (i);
			}
		}
	}
	public times: number[];
	public values: number[];
	constructor(public readonly path: WebgpuAnimationPath, public readonly interpolation: WebgpuAnimationInterpolation = WebgpuAnimationInterpolation.LINEAR,
		times: ArrayLike<number> = [],
		values: ArrayLike<number> = []) {
		this.times = MathHelper.ArrayLikeToArray(times);
		this.values = MathHelper.ArrayLikeToArray(values);
		if (times.length > 0)
		{
			this.maxTime = times[times.length - 1];
		}
	}

	private _InterpolateCubic(time: number): number[]
	{
		time = this.LoopTime(time);
		let prevIndex = this.GetPreviousFrameIndex(time);
		let nextIndex = this.GetNextFrameIndex(time);
		
		let prevFrame = this._GetFrame(prevIndex);
		let nextFrame = this._GetFrame(nextIndex);

		let compCount: number = this.GetComponentCount();
		let res: number[] = [];
		let t = (time - this.times[prevIndex]) / (this.times[nextIndex] - this.times[prevIndex]); 
		let t2 = t * t;
		let t3 = t2 * t;

		for (var i = 0; i < this.GetComponentCount(); i++)
		{
			let previousPoint: number = prevFrame[i + compCount];
			let previousTangent: number = prevFrame[i + (compCount * 2)];
			let nextPoint: number = nextFrame[i + compCount];
			let nextTangent: number = nextFrame[i];
			res.push((2 * t3 - 3 * t2 + 1) * previousPoint + (t3 - 2 * t2 + t) * previousTangent + (-2 * t3 + 3 * t2) * nextPoint + (t3 - t2) * nextTangent);
		}
		return (res);
	}
	slerpQuat(q1: quat, q2: quat, t: number) {
        const qn1 = quat.create();
        const qn2 = quat.create();

        quat.normalize(qn1, q1);
        quat.normalize(qn2, q2);

        const quatResult = quat.create();

        quat.slerp(quatResult, qn1, qn2, t);
        quat.normalize(quatResult, quatResult);

        return quatResult;
    }

	private _InterpolateRotation(time: number): number[]
	{
		time = this.LoopTime(time);
		let prevIndex = this.GetPreviousFrameIndex(time);
		let nextIndex = this.GetNextFrameIndex(time);
		
		let prevFrame = this._GetFrame(prevIndex);
		let nextFrame = this._GetFrame(nextIndex);

		let qn1 = new Quaternion().fromArray(prevFrame);
		let qn2 = new Quaternion().fromArray(nextFrame);
		let interpolationValue = (time - this.times[prevIndex]) / (this.times[nextIndex] - this.times[prevIndex]); 

		let res = (qn1.slerp(qn2, interpolationValue).normalize().toArray());
	
		return (res);
	}
	protected _GetFrame(index: number)
	{
		let cubicMul = this.interpolation == WebgpuAnimationInterpolation.CUBICSPLINE ? 3 : 1;
		let res = this.values.slice(index * cubicMul * this.GetComponentCount(), (index + 1) * cubicMul * this.GetComponentCount());

		return (res);
	}
	private _LinearInterpolate(time: number): number[] {
		time = this.LoopTime(time);
		let prevIndex = this.GetPreviousFrameIndex(time);
		let nextIndex = this.GetNextFrameIndex(time);
		
		let prevFrame = this._GetFrame(prevIndex);
		if (nextIndex == prevIndex)
		{
			return (prevFrame);
		}
		let nextFrame = this._GetFrame(nextIndex);
		let res: number[] = [];
		let interpolationValue = (time - this.times[prevIndex]) / (this.times[nextIndex] - this.times[prevIndex]); 
		for (var i = 0; i < this.GetComponentCount(); i++)
		{
			res.push(MathHelper.fit01(interpolationValue, prevFrame[i], nextFrame[i]));
		}
		return (res);
	}
	public GetComponentCount(): number
	{
		if (this.path == WebgpuAnimationPath.rotation)
		{
			return (4);
		}
		else if (this.path == WebgpuAnimationPath.translation || this.path == WebgpuAnimationPath.scale)
		{
			return (3)
		}
	}
	public ApplyToTransform(tr: WebgpuTransform, time: number)
	{
		switch (this.path)
		{
			case WebgpuAnimationPath.rotation:

				let quat = new Quaternion().fromArray(this.Interpolate(time));
				tr.quaternion.copy(quat);
				break;
			case WebgpuAnimationPath.scale:
				let scale = new Vector3().fromArray(this.Interpolate(time));
				tr.scale.copy(scale);
				break;
			case WebgpuAnimationPath.translation:
				let translation = new Vector3().fromArray(this.Interpolate(time));
				tr.position.copy(translation);
				break;
				
		}
	}
	public Interpolate(time: number): number[]
	{
		
		if (this.interpolation == WebgpuAnimationInterpolation.CUBICSPLINE)
		{
			return (this._InterpolateCubic(time));
		}
		else
		{
			switch (this.interpolation)
			{
				default:
				case WebgpuAnimationInterpolation.LINEAR:
					if (this.path == WebgpuAnimationPath.rotation)
					{
						return (this._InterpolateRotation(time));
					}
					return (this._LinearInterpolate(time));
				case WebgpuAnimationInterpolation.STEP:
					let frameIndex = this.GetPreviousFrameIndex(time);
					return (this.values.slice(frameIndex * this.GetComponentCount(), frameIndex + 1 * this.GetComponentCount()));
			}
		}
	}
}
