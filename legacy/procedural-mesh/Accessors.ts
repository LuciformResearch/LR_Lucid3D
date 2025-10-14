module GAME
{
	export class SegmentAccessor {
		public objectData: ProceduralMesh;
		public pt0: PointAccessor;
		public pt1: PointAccessor;
		public get length(): number {
			return (this.pt0.P.clone().sub(this.pt1.P).length());
		}
		public get sqrLength(): number {
			return (this.pt0.P.clone().sub(this.pt1.P).lengthSq());
		}
		public get dir(): THREE.Vector3 {
			return (this.pt1.P.clone().sub(this.pt0.P).normalize());
		}
		public get scaledDir(): THREE.Vector3 {
			return (this.pt1.P.clone().sub(this.pt0.P));
		}
		public get center(): THREE.Vector3 {
			return (this.scaledDir.multiplyScalar(0.5).add(this.pt0.P));
		}
		public constructor(objectData: ProceduralMesh, pt0: PointAccessor, pt1: PointAccessor) {
			this.pt0 = pt0;
			this.pt1 = pt1;
			this.objectData = objectData;
		}
	}

	export class EdgeAccessor extends SegmentAccessor {
		v0: number;
		v1: number;
	}
	export class VertexAccessor {
		point: PointAccessor;
		vertex: number;
		primitive: number;
	}
	export class PointAccessor {
		
		GetPrimitivesNormals(): THREE.Vector3[] {
			var res: THREE.Vector3[] = [];
			var prims = this.ptprims;
			for (var i = 0; i < prims.length; i++)
			{
				var prim: PrimitiveAccessor = new PrimitiveAccessor(this.objectData, prims[i]);
				res.push(prim.N);
			}
			return (res);
		}
		RecalculateNormal(): void {
			var prims = this.ptprims;
			var medianNormal = Vector3.Zero;
			for (var i = 0; i < prims.length; i++)
			{
				var accessor = new PrimitiveAccessor(this.objectData, prims[i]);
				medianNormal.add(accessor.N.clone().divideScalar(prims.length));
			}
			this.N = medianNormal.multiplyScalar(1.0);
		}
		public get Neighbors(): number[]
		{
			var ptPrims = this.ptprims;
			var res: number[] = [];
			for (var i = 0; i < this.ptprims.length; i++)
			{
				var prim: PrimitiveAccessor = new PrimitiveAccessor(this.objectData, this.ptprims[i]);
				var pts = prim.Vertices;
				var index = pts.indexOf(this.ptnum);
				var index0: number = (index + 1) % pts.length;
				var index1: number = (index + (pts.length - 1)) % pts.length;
				res.push(index0);
				res.push(index1);
			}
			return (res);
		}
		public constructor(objectData: ProceduralMesh, ptnum: number) {
			this.ptnum = ptnum;
			this.objectData = objectData;
		}
		public objectData: ProceduralMesh;
		public ptnum: number;
		public get P(): THREE.Vector3 {
			return (this.objectData.point(this.ptnum, "P"));
		}
		public set P(value: THREE.Vector3) {
			this.objectData.setpointattrib(this.ptnum, "P", value);
		}
		public get N(): THREE.Vector3 {
			return (this.objectData.point(this.ptnum, "N"));
		}
		public set N(value: THREE.Vector3) {
			this.objectData.setpointattrib(this.ptnum, "N", value);
		}

		public get ptprims(): number[] {
			return (this.objectData.point(this.ptnum, "ptprims"));
		}
		public set ptprims(value: number[]) {
			this.objectData.setpointattrib(this.ptnum, "ptprims", value);
		}

		public get ptgroups(): number[] {
			return (this.objectData.point(this.ptnum, "ptgroups"));
		}

		public attrib<T extends Data>(attributeName: string): T {

			return (this.objectData.point(this.ptnum, attributeName));
		}
		public setAttrib(attributeName: string, value: Data) {
			this.objectData.setpointattrib(this.ptnum, attributeName, value);
		}
	}
	export class GroupAccessor
	{
		groupIndex: number;
		objectdata: ProceduralMesh;
		public constructor(objectData: ProceduralMesh, groupIndex: number)
		{
			this.groupIndex = groupIndex;
			this.objectdata = objectData;
		}
		public attrib<T extends Data>(attributeName : string) : T
		{
			return (this.objectdata.group(this.groupIndex, attributeName));
		}
		public setAttrib(attributeName: string, value: Data)
		{
			this.objectdata.setgroupattrib(this.groupIndex, attributeName, value);
		}
		public get Points(): number[]
		{
			return (this.objectdata.group(this.groupIndex, "Points"));
		}
		public set Points(value: number[])
		{
			this.objectdata.setgroupattrib(this.groupIndex, "Points",  value);
		}

		public get Primitives(): number[]
		{
			return (this.objectdata.group(this.groupIndex, "Primitives"));
		}
		public set Primitives(value: number[])
		{
			this.objectdata.setgroupattrib(this.groupIndex, "Primitives",  value);
		}
		public get Name() : string
		{
			return (this.objectdata.group(this.groupIndex, "Name"));
		}
		public set Name(value: string)
		{
			this.objectdata.setgroupattrib(this.groupIndex, "Name", value);
		}
	}
	export class PrimitiveAccessor {
		RecalculateNormal(): void {
			var p0: PointAccessor = new PointAccessor(this.objectData, this.Vertices[0]);
			var p1: PointAccessor = new PointAccessor(this.objectData, this.Vertices[1]);
			var p2: PointAccessor = new PointAccessor(this.objectData, this.Vertices[2]);

			var n = p1.P.clone().sub(p0.P).cross(p2.P.clone().sub(p0.P));
			this.N = n;
			//throw new Error("Method not implemented.");
		}
		public constructor(objectData: ProceduralMesh, primnum: number) {
			this.primnum = primnum;
			this.objectData = objectData;
		}
		public objectData: ProceduralMesh;
		public primnum: number;
		public get N(): THREE.Vector3 {
			//return (this.objectData.test(this.primnum, "N"));
			return (this.objectData.prim<THREE.Vector3>(this.primnum, "N"));
		}
		public set N(value: THREE.Vector3) {
			this.objectData.setprimattrib(this.primnum, "N", value);
		}

		public get Vertices(): number[] {
			return (this.objectData.prim(this.primnum, "Vertices"));
		}
		public set Vertices(value: number[]) {
			this.objectData.setprimattrib(this.primnum, "Vertices", value);
		}

		public get uvs(): THREE.Vector2[] {
			return (this.objectData.prim(this.primnum, "uvs"));
		}
		public set uvs(value: THREE.Vector2[]) {
			this.objectData.setprimattrib(this.primnum, "uvs", value);
		}

		public get materialIndex(): number {
			return (this.objectData.prim(this.primnum, "materialIndex"));
		}
		public set materialIndex(value: number) {
			this.objectData.setprimattrib(this.primnum, "materialIndex", value);
		}


		public get colors(): THREE.Color[] {
			return (this.objectData.prim(this.primnum, "colors"));
		}
		public set colors(value: THREE.Color[]) {
			this.objectData.setprimattrib(this.primnum, "colors", value);
		}

		public get primgroups(): number[] {
			return (this.objectData.prim(this.primnum, "primgroups"));
		}


		public attrib<T extends Data>(attributeName: string): T {
			return (this.objectData.prim(this.primnum, attributeName));
		}
		public setAttrib(attributeName: string, value: Data) {
			this.objectData.setprimattrib(this.primnum, attributeName, value);
		}
	}

	export class QuadAccessor {
		public constructor(objectData: ProceduralMesh, polynum: number) {
			this.polynum = polynum;
			this.objectData = objectData;
		}
		public objectData: ProceduralMesh;
		public polynum: number;
		public get N(): THREE.Vector3 {
			//return (this.objectData.test(this.primnum, "N"));
			return (this.objectData.prim<THREE.Vector3>(this.Primitives[0], "N"));
		}
		public set N(value: THREE.Vector3) {
			this.objectData.setprimattrib(this.Primitives[0], "N", value);
			this.objectData.setprimattrib(this.Primitives[1], "N", value);
		}

		public get Points(): number[] {
			return (this.objectData.quad(this.polynum, "Points"));
		}
		public set Points(value: number[]) {
			this.objectData.setquadattrib(this.polynum, "Points", value);
		}

		public get Vertices(): number[] {
			return (this.objectData.quad(this.polynum, "Vertices"));
		}
		public set Vertices(value: number[]) {
			this.objectData.setquadattrib(this.polynum, "Vertices", value);
		}

		public get Primitives(): number[] {
			return (this.objectData.quad(this.polynum, "Primitives"));
		}
		public set Primitives(value: number[]) {
			this.objectData.setquadattrib(this.polynum, "Primitives", value);
		}

		public getUv(verticeIndex: number): THREE.Vector2 {
			if (verticeIndex >= 3) {
				verticeIndex -= 3;
				return (new PrimitiveAccessor(this.objectData, this.Primitives[1]).uvs[verticeIndex]);
			}
			else {
				return (new PrimitiveAccessor(this.objectData, this.Primitives[0]).uvs[verticeIndex]);
			}
		}

		public setUv(verticeIndex: number, uv: THREE.Vector2) {
			var ptIndex: number;
			if (verticeIndex >= 3) {
				verticeIndex -= 3;
				ptIndex = (new PrimitiveAccessor(this.objectData, this.Primitives[1]).Vertices[verticeIndex]);
			}
			else {
				ptIndex = (new PrimitiveAccessor(this.objectData, this.Primitives[0]).Vertices[verticeIndex]);
			}
			var point = new PointAccessor(this.objectData, ptIndex);
			var ptIndex0: number = -1;
			var ptIndex1: number = -1;
			var prim0: PrimitiveAccessor = new PrimitiveAccessor(this.objectData, this.Primitives[0]);
			var prim1: PrimitiveAccessor = new PrimitiveAccessor(this.objectData, this.Primitives[1]);

			for (var i = 0; i < prim0.Vertices.length; i++) {
				var point0: PointAccessor = new PointAccessor(this.objectData, prim0.Vertices[i]);
				if (point0.P.distanceTo(point.P) <= Number.EPSILON) {
					ptIndex0 = i;
					break;
				}
			}
			for (var i = 0; i < prim1.Vertices.length; i++) {
				var point1: PointAccessor = new PointAccessor(this.objectData, prim1.Vertices[i]);
				if (point1.P.distanceTo(point.P) <= Number.EPSILON) {

					ptIndex1 = i;
					break;
				}
			}
			if (ptIndex0 != -1) {
				prim0.uvs[ptIndex0] = uv;

			}
			if (ptIndex1 != -1) {
				prim1.uvs[ptIndex1] = uv;
			}
		}

		public attrib<T extends Data>(attributeName: string): T {
			return (this.objectData.quad(this.polynum, attributeName));
		}
		public setAttrib(attributeName: string, value: Data) {
			this.objectData.setquadattrib(this.polynum, attributeName, value);
		}
	}


	
}