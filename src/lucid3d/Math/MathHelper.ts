import { Quaternion } from "./Quaternion";
import { Vector2 } from "./Vector2";
import { Vector3 } from "./Vector3";

declare var uheprng: any;

export const DegToRad: number = 1 / 180.0 * Math.PI;
export const RadToDeg: number = 1 / Math.PI * 180.0;
export interface LocRotScale {
	loc: Vector3;
	rot: Quaternion;
	scale: Vector3;
}
export class MathHelper {
	static ArrayLikeToArray<T>(array: ArrayLike<T>) : T[] {
		let res: T[] = [];
		for (let i = 0; i < array.length; i++)
		{
			res.push(array[i]);
		}
		return (res);		
	}
	
	
	public static GetNormalsFromTriangles(positions: Vector3[], indices: ArrayLike<number> = undefined) : Vector3[]
	{
		// p1 - p0 X p2 - p0
		let res: Vector3[] = [];
		if (indices == undefined)
		{
			for (var i = 0; i < positions.length / 3; i++)
			{
				let p0 = positions[(i * 3) + 0];
				let p1 = positions[(i * 3) + 1];
				let p2 = positions[(i * 3) + 2];
				let A = p1.clone().sub(p0);
				let B = p2.clone().sub(p0);
				res.push(A.clone().cross(B));
				res.push(A.clone().cross(B));
				res.push(A.clone().cross(B));
			}
		}
		else
		{
			for (var i = 0; i < indices.length / 3; i++)
			{
				let i0 = indices[(i * 3) + 0];
				let i1 = indices[(i * 3) + 1];
				let i2 = indices[(i * 3) + 2];
				let p0 = positions[i0];
				let p1 = positions[i1];
				let p2 = positions[i2];
				let A = p1.clone().sub(p0);
				let B = p2.clone().sub(p0);
				res.push(A.clone().cross(B));
				res.push(A.clone().cross(B));
				res.push(A.clone().cross(B));
			}
		}
		return (res);
	}
	public static readonly Deg2Rad = Math.PI / 180.0;
	public static readonly Rad2Deg = 180.0 / Math.PI;
	static readonly DegToRad: number = 1 / 180.0 * Math.PI;
	static readonly RadToDeg: number = 1 / Math.PI * 180.0;
	public static CloneLocRotScale(lrs: LocRotScale) {
		return (<LocRotScale>{ loc: lrs.loc.clone(), rot: lrs.rot.clone(), scale: lrs.scale.clone() });
	}

	public static InterpolateLocRotScale(lrs0: LocRotScale, lrs1: LocRotScale, t: number) {
		var resLoc = lrs1.loc.clone().sub(lrs0.loc).multiplyScalar(t).add(lrs0.loc);
		var resQuat = lrs0.rot.clone().slerp(lrs1.rot, t);
		var resScale = lrs1.scale.clone().sub(lrs0.scale).multiplyScalar(t).add(lrs0.scale);
		return (<LocRotScale>{ loc: resLoc, rot: resQuat, scale: resScale });
	}
	public static ClosestToLine(p: Vector3, l1: Vector3, l2: Vector3) {
		var lambda: number;
		var h: Vector3;
		var u: Vector3;
		u = l2.clone().sub(l1);
		h = p.clone().sub(l1);
		lambda = u.dot(h) / u.dot(u);
		var res: { point: Vector3, lambda: number } = { point: new Vector3(l1.x + u.x * lambda, l1.y + u.y * lambda, l1.z + u.z * lambda), lambda: lambda };
		// float h[3], u[3], lambda;
		// sub_v3_v3v3(u, l2, l1);
		// sub_v3_v3v3(h, p, l1);
		// lambda = dot_v3v3(u, h) / dot_v3v3(u, u);
		// r_close[0] = l1[0] + u[0] * lambda;
		// r_close[1] = l1[1] + u[1] * lambda;
		// r_close[2] = l1[2] + u[2] * lambda;
		return res;
	}
	public static ClosestToLineSegment(p: Vector3, l1: Vector3, l2: Vector3) {
		var res: Vector3;
		var data = this.ClosestToLine(p, l1, l2);
		var lambda = data.lambda;
		var cp = data.point;
		if (!(lambda > 0.0)) {
			res = l1.clone();
		}
		else if (!(lambda < 1.0)) {
			res = l2.clone();
		}
		else {
			res = cp.clone();
		}
		return (res);
	}
	static randomDirection(): number {
		return ((MathHelper.fit01int(MathHelper.Random(), 0, 1) * 2) - 1);
	}
	static _rng: any;
	static Clamp(value: number, min: number, max: number): number {
		value = Math.max(value, min);
		value = Math.min(value, max);
		return (value);
	}
	static Clamp01(value: number) {
		return (Math.min(Math.max(value, 0), 1));
	}
	static floatMod(n: number, mod: number): any {
		return (n % mod);
	}

	public static toViewportInterpolant(value: number, min: number, max: number): number {
		return (this.toInterpolant(value, min, max)) * 2.0 - 1.0;
	}
	public static fit01(interpolation: number, min: number, max: number): number {
		return ((interpolation * (max - min)) + min);
	}
	public static fit01int(interpolation: number, min: number, max: number): number {
		max += 0.95;
		return (Math.floor((interpolation * (max - min)) + min));
	}
	public static toInterpolant(value: number, min: number, max: number) {
		return ((value - min) / (max - min));
	}
	public static interpolateIndex<T>(t: number, array: T[]): number {
		return (MathHelper.fit01int(t, 0, array.length - 1));
	}
	public static interpolateValue<T>(t: number, array: T[]): T {
		return (array[MathHelper.fit01(t, 0, array.length - 1)]);
	}
	public static interpolateIndexValue<T>(t: number, array: T[]): { index: number, value: T } {
		var index = MathHelper.fit01int(t, 0, array.length - 1);
		var value = array[index];
		return ({ index: index, value: value });
	}
	public static randomIndex<T>(array: T[]): number {
		var index = MathHelper.fit01int(MathHelper.Random(), 0, array.length - 1);
		return (index);
	}
	public static randomIndexValue<T>(array: T[]): { index: number, value: T } {
		var randIndex = MathHelper.fit01int(MathHelper.Random(), 0, array.length - 1);
		return ({ index: randIndex, value: array[randIndex] });
	}
	public static randomValue<T>(array: T[]): T {
		var randIndex = MathHelper.fit01int(MathHelper.Random(), 0, array.length - 1);
		return (array[randIndex]);
	}
	public static randomInRange(min: number, max: number): number {
		return (MathHelper.fit01int(MathHelper.Random(), min, max));
	}
	public static fit(value: number, min: number, max: number, newMin: number, newMax: number): number {
		var interpolation: number = (value - min) / (max - min);
		return (MathHelper.fit01(interpolation, newMin, newMax));
	}
	public static sign(value: number): number {
		return (value >= 0 ? 1.0 : -1.0);
	}
	public static ToDeg(rad: number): number {
		return (rad * RadToDeg);
	}
	public static ToRad(deg: number): number {
		return (deg * DegToRad);
	}
	private static _randomSeed: number = MathHelper.fit01int(Math.random(), 0, 1541899);
	public static RandomSeed(seed: number = undefined) {
		if (seed != undefined) {
			this._randomSeed = seed;
			this._rng = new uheprng(seed);
		}
		return (this._randomSeed);
	}
	public static Random() {
		return (this._rng(10000.0) / 10000.0);
	}

	public static GetAngleRange(a0: number, a1: number, keepOrder: boolean = false): { a0: number, a1: number } {
		a0 = a0 % 360;
		if (a0 < 0) {
			a0 += 360;
		}
		a1 = a1 % 360;
		if (a1 < 0) {
			a1 += 360;
		}

		if (a0 > a1 && a0 - a1 >= 180) {
			a1 += 360;
		}
		if (a1 > a0 && a1 - a0 >= 180) {
			a0 += 360;
		}
		if (a0 > a1 && !keepOrder) {
			var tmp = a1;
			a1 = a0;
			a0 = tmp;
		}

		return ({ a0: a0, a1: a1 });
	}
	public static GetAngleDiff(from: number, to: number) {
		var range = this.GetAngleRange(from, to, true);
		return (range.a1 - range.a0);
	}

}
export class Vector3H {
	private static _starPattern: Vector3[] = undefined;
	private static _starPatternDistances = undefined;
	static Star(currentCell: Vector3): { values: Vector3[], distances: number[] } {
		// diagonales (8) + diagonales segment (8) + faces (6)
		if (this._starPattern == undefined) {
			var starPattern = [Vector3H.Right, Vector3H.Right.multiplyScalar(-1), Vector3H.Up, Vector3H.Up.multiplyScalar(-1), Vector3H.Forward, Vector3H.Forward.multiplyScalar(-1)];

			for (var i = 0; i < 6; i++) {
				for (var j = (Math.floor(i / 2) + 1); j < 3; j++) {
					for (var k = 0; k < 2; k++) {
						var l = (j * 2) + k;
						starPattern.push(starPattern[i].clone().add(starPattern[l]));
					}
				}
			}

			for (var k = 0; k < 2; k++) {
				var m = k;
				for (var k2 = 0; k2 < 2; k2++) {
					var n = 2 + k2;
					for (var k3 = 0; k3 < 2; k3++) {
						var o = 4 + k3;
						starPattern.push(starPattern[m].clone().add(starPattern[n]).add(starPattern[o]));
					}
				}
			}
			this._starPattern = starPattern;
			var starPatternDistances: number[] = [];
			for (var i = 0; i < this._starPattern.length; i++) {
				starPatternDistances.push(this._starPattern[i].length());
			}
			this._starPatternDistances = starPatternDistances;
		}
		var res: { values: Vector3[], distances: number[] } = { values: [], distances: [] };
		for (var i = 0; i < this._starPattern.length; i++) {
			res.values.push(currentCell.clone().add(this._starPattern[i]));
			res.distances.push(this._starPatternDistances[i]);
		}
		return (res);
	}
	static get(value: Vector3, axis: number): number {
		return (axis == 0 ? value.x : axis == 1 ? value.y : value.z);
	}
	public static FromHash(hash: string): Vector3 {
		var res: Vector3 = new Vector3();
		var obj = JSON.parse(hash);
		for (var i = 0; i < obj.length; i++) {
			res[i] = obj[i];
		}
		return (res);
	}
	public static GetHash(vector: Vector3): string {
		return (JSON.stringify(vector.toArray()));
	}
	public static AxisOffsetVector(vector: Vector3, axisOffset: number, reverse: boolean = false): Vector3 {
		if (reverse) {
			axisOffset += 2;
		}
		var arr = [vector.x, vector.y, vector.z];
		var res = new Vector3(arr[(axisOffset + 0) % 3], arr[(axisOffset + 1) % 3], arr[(axisOffset + 2) % 3]);
		return (res);
	}
	public static GetIntegerHash(vector: Vector3): string {
		return (JSON.stringify(vector.clone().floor()));
	}
	public static GetDividerHash(vector: Vector3, divider: Vector3, integer: boolean = false): string {
		var res = vector.clone().divide(divider);
		if (integer) {
			res.floor();
		}
		return (JSON.stringify(res));
	}
	public static GetDividerScalarHash(vector: Vector3, dividerScalar: number, integer: boolean = false): string {
		var res = vector.clone().divideScalar(dividerScalar);
		if (integer) {
			res.floor();
		}
		return (JSON.stringify(res));
	}
	public static GetDividerPosition(vector: Vector3, divider: Vector3, integer: boolean = false): Vector3 {
		var res = vector.clone().divide(divider);
		if (integer) {
			res.floor();
		}
		return (res);
	}
	public static GetDividerScalarPosition(vector: Vector3, dividerScalar: number, integer: boolean = false, round: boolean = false): Vector3 {
		var res = vector.clone().divideScalar(dividerScalar);
		if (integer) {
			if (round) {
				res.round();
			}
			else {
				res.floor();
			}

		}
		return (res);
	}
	public static get Zero(): Vector3 {
		return (new Vector3());
	}
	public static get Forward(): Vector3 {
		return (new Vector3(0, 0, 1));
	}
	public static get Up(): Vector3 {
		return (new Vector3(0, 1, 0));
	}
	public static get Right(): Vector3 {
		return (new Vector3(1, 0, 0));
	}
	public static get One(): Vector3 {
		return (new Vector3(1, 1, 1));
	}
	public static fit01(interpolation: number, min: Vector3, max: Vector3) {
		var res = new Vector3().set(MathHelper.fit01(Math.random(), min.x, max.x), MathHelper.fit01(Math.random(), min.y, max.y), MathHelper.fit01(Math.random(), min.z, min.z));
		return (res);
	}
}
export class Vector2H {
	public static get Zero(): Vector2 {
		return (new Vector2());
	}
	public static get Up(): Vector2 {
		return (new Vector2(0, 1));
	}
	public static get Right(): Vector2 {
		return (new Vector2(1, 0));
	}
	public static get Left(): Vector2 {
		return (new Vector2(-1, 0));
	}
	public static get Down(): Vector2 {
		return (new Vector2(0, -1));
	}
}
/*
export class GeometryHelper {

	static GetVerticesNormals(geometry: Geometry) {
		var normals: Vector3[] = new Array<Vector3>(geometry.vertices.length);
		for (var i = 0; i < normals.length; i++) {
			normals[i] = new Vector3();
		}
		for (var i = 0; i < geometry.faces.length; i++) {
			var verts = [geometry.faces[i].a, geometry.faces[i].b, geometry.faces[i].c];
			for (var j = 0; j < verts.length; j++) {
				normals[verts[j]].add(geometry.faces[i].normal);
			}
		}
		for (var i = 0; i < normals.length; i++) {
			normals[i].normalize();
		}
		return (normals);
	}
	static GetVerticesUvs(geometry: Geometry) {
		var uvs: Vector2[] = new Array<Vector2>(geometry.vertices.length);
		if (geometry.faceVertexUvs && geometry.faceVertexUvs[0]) {
			for (var i = 0; i < geometry.faces.length; i++) {
				var verts = [geometry.faces[i].a, geometry.faces[i].b, geometry.faces[i].c];
				for (var j = 0; j < verts.length; j++) {
					if (uvs[verts[j]] == undefined) {
						uvs[verts[j]] = geometry.faceVertexUvs[0][i][j].clone();
					}
				}
			}
		}
		return (uvs);
	}
	static GetIndex(geometry: Geometry) {
		var indices: number[] = [];
		for (var i = 0; i < geometry.faces.length; i++) {
			indices.push(geometry.faces[i].a, geometry.faces[i].b, geometry.faces[i].c);
		}
		return (indices);
	}
	static UpdateSkinWeights(source: Geometry, target: BufferGeometry) {
		if (source.skinIndices.length > 0) {
			var array = target.attributes["skinIndex"].array;
			for (var i = 0; i < source.skinIndices.length; i++) {
				(array[i] as Vector4).copy(source.skinIndices[i]);
			}
		}
		if (source.skinIndices.length > 0) {
			var array = target.attributes["skinWeight"].array;
			for (var i = 0; i < source.skinIndices.length; i++) {
				(array[i] as Vector4).copy(source.skinWeights[i]);
			}
		}
	}

	static ToBufferGeometry(geometry: Geometry) {
		var res: BufferGeometry = new BufferGeometry();
		var positions = new Float32Array(geometry.vertices.length * 3);
		var self = res;
		var geometry_normals = this.GetVerticesNormals(geometry);
		var geometry_uvs = this.GetVerticesUvs(geometry);
		self.addAttribute('position', new BufferAttribute(positions, 3).copyVector3sArray(geometry.vertices));

		if (geometry_normals.length > 0) {

			var normals = new Float32Array(geometry_normals.length * 3);
			self.addAttribute('normal', new BufferAttribute(normals, 3).copyVector3sArray(geometry_normals));

		}

		if (geometry.colors.length > 0) {

			var colors = new Float32Array(geometry.colors.length * 3);
			self.addAttribute('color', new BufferAttribute(colors, 3).copyColorsArray(geometry.colors));

		}

		if (geometry_uvs.length > 0) {

			var uvs = new Float32Array(geometry_uvs.length * 2);
			self.addAttribute('uv', new BufferAttribute(uvs, 2).copyVector2sArray(geometry_uvs));
		}
		var idColor = new Float32Array(positions.length);

		// if (geometry.uvs2.length > 0) {

		// 	var uvs2 = new Float32Array(geometry.uvs2.length * 2);
		// 	self.addAttribute('uv2', new BufferAttribute(uvs2, 2).copyVector2sArray(geometry.uvs2));

		// }

		// groups

		//self.groups = geometry.groups;

		// morphs


		{
			var name = "position";
			var array = [];
			//var morphTargets = geometry.morphTargets[name];

			for (var i = 0, l = geometry.morphTargets.length; i < l; i++) {

				var morphTarget = geometry.morphTargets[i].vertices;

				var attribute = new (THREE as any).Float32BufferAttribute(morphTarget.length * 3, 3);

				array.push(attribute.copyVector3sArray(morphTarget));

			}

			self.morphAttributes[name] = array;


			var name = "normals";
			var array = [];
			//var morphTargets = geometry.morphTargets[name];

			for (var i = 0, l = geometry.morphNormals.length; i < l; i++) {

				var morphTarget = geometry.morphNormals[i].normals;

				var attribute = new (THREE as any).Float32BufferAttribute(morphTarget.length * 3, 3);

				array.push(attribute.copyVector3sArray(morphTarget));

			}

			self.morphAttributes[name] = array;

		}

		// skinning

		if (geometry.skinIndices.length > 0) {

			var skinIndices = new (THREE as any).Float32BufferAttribute(geometry.skinIndices.length * 4, 4);
			self.addAttribute('skinIndex', skinIndices.copyVector4sArray(geometry.skinIndices));

		}

		if (geometry.skinWeights.length > 0) {

			var skinWeights = new (THREE as any).Float32BufferAttribute(geometry.skinWeights.length * 4, 4);
			self.addAttribute('skinWeight', skinWeights.copyVector4sArray(geometry.skinWeights));

		}

		//

		if (geometry.boundingSphere !== null) {

			self.boundingSphere = geometry.boundingSphere.clone();

		}

		if (geometry.boundingBox !== null) {

			self.boundingBox = geometry.boundingBox.clone();

		}

		self.setIndex(this.GetIndex(geometry));
		return (self);

	}

	static ToGeometry(geometry: BufferGeometry) {

	}

}
*/
/*
export class MeshHelper {
	static GetLocRotScale(obj: Object3D): LocRotScale {
		return ({ loc: obj.position.clone(), rot: obj.quaternion.clone(), scale: obj.scale.clone() });
	}
	static GetWorldLocRotScale(obj: Object3D, forceUpdateMatrices: boolean = false): LocRotScale {
		if (forceUpdateMatrices) {
			MeshHelper.ForceUpdateMatrixWorld(obj, {});
		}
		let loc: Vector3 = new Vector3();
		let rot: Quaternion = new Quaternion();
		let scale: Vector3 = new Vector3();
		obj.matrixWorld.decompose(loc, rot, scale);
		return ({ loc: loc, rot: rot, scale: scale });
	}
	static TransferGeometry(obj: Mesh, clone: Mesh, updateMatrixs: boolean = true): any {
		//if (updateMatrixs)
		{
			this.ForceUpdateMatrixWorld(obj);
			this.ForceUpdateMatrixWorld(clone);
		}
		var newGeom = new Geometry();
		var geom: Geometry | BufferGeometry = obj.geometry;
		if (geom instanceof Geometry) {
			geom = geom.clone();
		}
		else {
			geom = new Geometry().fromBufferGeometry(geom);
		}

		var median: Vector3 = new Vector3();
		for (var i = 0; i < geom.vertices.length; i++) {
			geom.vertices[i].applyMatrix4(obj.matrixWorld);
			median.add(geom.vertices[i]);
			
		}
		median.divideScalar(geom.vertices.length);
		for (var i = 0; i < geom.vertices.length; i++) {
			geom.vertices[i].sub(median);

		}

		geom.normalsNeedUpdate = true;

		geom.computeVertexNormals();
		geom.computeFaceNormals();

		clone.geometry = geom;
		clone.position.copy(median);
		clone.quaternion.copy(new Quaternion(0, 0, 0, 1.0));
		clone.scale.set(1, 1, 1);

		clone.geometry.computeBoundingBox();
	}
	static ApplyScale(obj: Mesh): any {
		var scale = obj.scale;
		var geom: Geometry | BufferGeometry = obj.geometry;
		if (geom instanceof Geometry) {
			geom = geom.clone();
		}
		else {
			geom = new Geometry().fromBufferGeometry(geom);
		}
		for (var i = 0; i < geom.vertices.length; i++) {
			geom.vertices[i].multiply(scale);
		}
		obj.geometry = geom;
		obj.scale = new Vector3().setScalar(1.0);
	}


	public static ForceUpdateMatrixWorld(obj: Object3D, doneMap: { [index: string]: boolean } = {}) {

		var doneObjs = doneMap;
		var parents: Object3D[] = [];
		var current: Object3D = obj;
		while (current != undefined) {
			parents.push(current);
			current = current.parent;
		}
		parents = parents.reverse();
		for (var i = 0; i < parents.length; i++) {
			if (!(doneObjs[parents[i].uuid])) {
				parents[i].updateMatrixWorld(true);
				doneObjs[parents[i].uuid] = true;
			}
		}
	}

}*/


