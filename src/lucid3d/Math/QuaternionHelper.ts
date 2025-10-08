import { Vector3H } from "./MathHelper";
import { Quaternion } from "./Quaternion";
import { Vector3 } from "./Vector3";


export class QuaternionHelper {
	public static add(v0: Vector3, v1: Vector3) {
		return (v0.clone().add(v1));
	}
	public static sub(v0: Vector3, v1: Vector3) {
		return (v0.clone().sub(v1));
	}
	public static get Identity(): Quaternion {
		return (new Quaternion(0, 0, 0, 1));
	}
	/*public static FromToRotation(from: Vector3, to: Vector3): Quaternion {
		var quat: Quaternion = new Quaternion();
		quat.setFromUnitVectors(from, to);
		return (quat);
	}*/
	public static AngleBetween(q0: Quaternion, q1: Quaternion) {
		q0 = q0.clone().normalize();
		q1 = q1.clone().normalize();
		var z = q0.multiply(q1.clone().invert());
		return (2 * Math.acos(Math.abs(z.w)));
	}
	public static LookRotation(forward: Vector3, upward: Vector3, normalize: boolean = true, target?: Quaternion)
	{	
		if (normalize)
		{
			forward = forward.normalize();
			upward = upward.normalize();
		}
		// Don't allow zero vectors
		if (forward.lengthSq() < Number.EPSILON || upward.lengthSq() < Number.EPSILON)// Vector3:: SqrMagnitude(upwards) < MathHelper<float>:: Epsilon())
		{
			return QuaternionHelper.Identity;
		}
		// Handle alignment with up direction
		if (1 - Math.abs(forward.dot(upward)) < Number.EPSILON) {
			return QuaternionHelper.FromToRotation(Vector3H.Forward, forward);
		}
		// Get orthogonal vectors
		let right: Vector3 = upward.clone().cross(forward).normalize();

		upward = forward.clone().cross(right);
		// Calculate rotation
		//let quaternion : Quaternion = QuaternionHelper.Identity;
		let radicand: number = right.x + upward.y + forward.z;
		let x: number = 0;
		let y: number = 0;
		let z: number = 0;
		let w: number = 0;
		if (radicand > 0) {
			w = Math.sqrt(1.0 + radicand) * 0.5;
			var recip: number = 1.0 / (4.0 * w);
			x = (upward.z - forward.y) * recip;
			y = (forward.x - right.z) * recip;
			z = (right.y - upward.x) * recip;
		}
		else if (right.x >= upward.y && right.x >= forward.z) {
			x = Math.sqrt(1.0 + right.x - upward.y - forward.z) * 0.5;
			var recip: number = 1.0 / (4.0 * x);
			w = (upward.z - forward.y) * recip;
			z = (forward.x + right.z) * recip;
			y = (right.y + upward.x) * recip;
		}
		else if (upward.y > forward.z) {
			y = Math.sqrt(1.0 - right.x + upward.y - forward.z) * 0.5;
			var recip: number = 1.0 / (4.0 * y);
			z = (upward.z + forward.y) * recip;
			w = (forward.x - right.z) * recip;
			x = (right.y + upward.x) * recip;
		}
		else {
			z = Math.sqrt(1.0 - right.x - upward.y + forward.z) * 0.5;
			var recip: number = 1.0 / (4.0 * z);
			y = (upward.z + forward.y) * recip;
			x = (forward.x + right.z) * recip;
			w = (right.y - upward.x) * recip;
		}
		var res: Quaternion = target ? target.set(x, y, z, w) : new Quaternion(x, y, z, w);
		return res;
	}
	public static LookAtQuaternion(sourcePoint: Vector3, destPoint: Vector3, up: Vector3, normalize: boolean = true, target?: Quaternion): Quaternion {
		var forward: Vector3 = destPoint.clone().sub(sourcePoint);
		var upwards: Vector3 = up.clone();
		return (this.LookRotation(forward, upwards, normalize, target));
	}

	public static Orthogonal(vector: Vector3): Vector3 {
		var v: Vector3 = vector;
		return v.z < v.x ? new Vector3(v.y, -v.x, 0) : new Vector3(0, -v.z, v.y);
	}

	public static FromToRotation(fromVector: Vector3, toVector: Vector3): Quaternion {
		var dot: number = (fromVector.clone().dot(toVector));
		var k: number = Math.sqrt((fromVector.lengthSq()) *
			(toVector.lengthSq()));

		if (Math.abs(dot / k + 1.0) < 0.00001) {
			var ortho: Vector3 = QuaternionHelper.Orthogonal(fromVector);
			var axis: Vector3 = (ortho.clone().normalize());
			return new Quaternion(axis.x, axis.y, axis.z, 0);
		}
		var cross: Vector3 = (fromVector.clone().cross(toVector));
		return (new Quaternion(cross.x, cross.y, cross.z, dot + k).clone().normalize());
	}
}
