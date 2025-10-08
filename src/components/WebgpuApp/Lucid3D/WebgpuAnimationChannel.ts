
import { WebgpuAnimationSampler } from "./WebgpuAnimationSampler";
import { WebgpuTransform } from "./WebgpuTransform";


export class WebgpuAnimationChannel
{
	constructor(public sampler: WebgpuAnimationSampler, public boneTransform: WebgpuTransform)
	{
		//debugger;
	}
}