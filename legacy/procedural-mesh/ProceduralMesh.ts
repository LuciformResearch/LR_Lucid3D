///<reference path="./CustomData.ts"/>

module GAME {
	export class ProceduralMesh {
		clearData(): any {
			this.detailData = {};
			this.pointsData = [];
			this.primitivesData = [];
			this.groupsData = [];
			this.quadsData = [];
			this._pointAccessors = {};
			this._primAccessors = {};
			//throw new Error("Method not implemented.");
		}
		hasDetailAttrib(attrib: string): boolean {
			return (this.detailData[attrib] != undefined);
		}
		private _primAccessors: { [index: number]: PrimitiveAccessor } = {};
		private _pointAccessors: { [index: number]: PointAccessor } = {};
		public PrimitiveAccessor(primnum: number) {
			if (this._primAccessors[primnum] == undefined) {
				this._primAccessors[primnum] = new PrimitiveAccessor(this, primnum);
			}
			return (this._primAccessors[primnum]);
		}
		public PointAccessor(ptnum: number) {
			if (this._pointAccessors[ptnum] == undefined) {
				this._pointAccessors[ptnum] = new PointAccessor(this, ptnum);
			}
			return (this._pointAccessors[ptnum]);
		}

		groupAttribs(index: number): any {
			if (this.groupsData[index] == undefined) {
				return (undefined);
			}
			var keys = Object.keys(this.groupsData[index]);
			return (keys);
		}
		primAttribs(index: number): string[] {
			if (this.primitivesData[index] == undefined) {
				return (undefined);
			}
			var keys = Object.keys(this.primitivesData[index]);
			return (keys);
		}
		pointAttribs(index: number): string[] {
			if (this.pointsData[index] == undefined) {
				return (undefined);
			}
			var keys = Object.keys(this.pointsData[index]);
			return (keys);
		}
		public constructor() {

		}

		static SeparateParts(data: ProceduralMesh, computeConnectivity: boolean = true): ProceduralMesh[] {
			var out = data;
			if (computeConnectivity) {
				var connectivity = Operator.Connectivity;
				connectivity.in = data;
				connectivity.execute();
				out = connectivity.out;
			}
			var vertRemap: { [index: number]: number } = {};
			var meshes: ProceduralMesh[] = [];
			var keys = Object.keys(out.groupsData);
			for (var i = 0; i < keys.length; i++) {
				var group: GroupAccessor = new GroupAccessor(data, Number.parseInt(keys[i]));
				if (group.Name == "connectivity") {
					var mesh: ProceduralMesh = new ProceduralMesh();
					var primitives = group.Primitives;
					var points = group.Points;
					for (var j = 0; j < primitives.length; j++) {
						var newPrimPts: number[] = [];
						var primAccessor = new PrimitiveAccessor(data, primitives[j]);

						var primpts: number[] = primAccessor.Vertices;
						for (var k = 0; k < primpts.length; k++) {
							var pt: PointAccessor = new PointAccessor(data, primpts[k]);
							if (vertRemap[pt.ptnum] == undefined) {
								vertRemap[pt.ptnum] = mesh.addpoint(pt.P);
							}
							var newPtnum = vertRemap[pt.ptnum];
							newPrimPts.push(newPtnum);
							var attribs = data.pointAttribs(pt.ptnum);
							for (var l = 0; l < attribs.length; l++) {
								if (attribs[l] != "ptprims") {
									var value = pt.attrib(attribs[l]);
									mesh.setpointattrib(newPtnum, attribs[l], value);
								}
							}
						}
						var newPrimnum = mesh.addprim(newPrimPts);
						var primAttribs = data.primAttribs(primAccessor.primnum);
						for (var k = 0; k < primAttribs.length; k++) {
							if (primAttribs[k] != "Vertices") {

								var value = primAccessor.attrib(primAttribs[k]);
								mesh.setprimattrib(newPrimnum, primAttribs[k], value);
							}
						}
					}
					var groupAttribs = data.groupAttribs(group.groupIndex);
					for (var k = 0; k < groupAttribs.length; k++) {
						if (groupAttribs[k] != "Points" && groupAttribs[k] != "Primitives") {
							var value = data.group(group.groupIndex, groupAttribs[k]);
							mesh.setdetailattrib(groupAttribs[k], value);
						}
					}
					meshes.push(mesh);
				}
			}
			return (meshes);
		}

		public static FromTHREEGeometry(primitive: THREE.Geometry | THREE.BufferGeometry): ProceduralMesh {
			if (primitive instanceof THREE.Geometry) {
				var res = new ProceduralMesh();
				for (var i = 0; i < primitive.vertices.length; i++) {
					res.addpoint(primitive.vertices[i]);
				}
				for (var i = 0; i < primitive.faces.length; i++) {
					res.addprim([primitive.faces[i].a, primitive.faces[i].b, primitive.faces[i].c]);

					//primitive.faceVertexUvs[i][0][0] // le dernier certainement correspond a l'uv2 / uv3 / uv4...
					var verticeUvs: THREE.Vector2[] = primitive.faceVertexUvs[0][i];

					/*if (faceVertexUvs != undefined && faceVertexUvs.length > 0) {
						for (var j = 0; j < faceVertexUvs[0].length; j++) {
							verticeUvs.push(faceVertexUvs[0][j]);
						}
					}*/
					//primitive.faces[i].vertexNormals[0];
					res.setpointattrib(primitive.faces[i].a, "N", primitive.faces[i].vertexNormals[0]);
					res.setpointattrib(primitive.faces[i].b, "N", primitive.faces[i].vertexNormals[1]);
					res.setpointattrib(primitive.faces[i].c, "N", primitive.faces[i].vertexNormals[2]);
					res.setprimattrib(i, "N", primitive.faces[i].normal);
					res.setprimattrib(i, "uvs", verticeUvs);
					res.setpointattrib(primitive.faces[i].a, "color", primitive.faces[i].vertexColors[0]);
					res.setpointattrib(primitive.faces[i].b, "color", primitive.faces[i].vertexColors[1]);
					res.setpointattrib(primitive.faces[i].c, "color", primitive.faces[i].vertexColors[2]);
				}
				return (res);
			}
			else {
				// colors
				// normals
				// positions
				var res = new ProceduralMesh();
				for (var i = 0; i < primitive.attributes["position"].length; i++) {
					res.addpoint(primitive.attributes["position"][i]);
				}
				if (primitive.attributes["normal"] != undefined) {

					for (var i = 0; i < primitive.attributes["position"].length; i++) {
						res.setpointattrib(i, "N", primitive.attributes["normal"][i]);
					}

				}
				return (res);
				/*	if (primitive.attributes["normal"] != undefined)
					{
						res.setpointattrib(i, "N", primitive.attributes["normal"][i]);
					}
					if (primitive.attributes["color"] != undefined)
					{
						res.setpointattrib(i, "color", primitive.attributes["color"][i]);
					}
				*/

			}
		}
		public CalcNormal(normals: THREE.Vector3[], normal: THREE.Vector3, angle: number) {

			let allowed = normals.filter(n => n.angleTo(normal) < angle * Math.PI / 180);
			if (allowed.length == 0) {
				return (normal);
			}
			//			debugger;
			return allowed.reduce((a, b) => a.clone().add(b)).normalize();
		}
		public GenerateTHREEGeometry(verbose: boolean = false, ceaseAngle: number = 65): THREE.Geometry {
			var vertices: THREE.Vector3[] = [];
			var triangles: THREE.Face3[] = [];
			var activeIndex = 0;
			var remappedVertices: { [index: number]: number } = {};
			var uvs: THREE.Vector2[][] = [];
			for (var i = 0; i < this.pointsData.length; i++) {
				if (this.pointsData[i] != undefined && this.pointsData[i]["ptprims"] != undefined) {
					var ptAccessor: PointAccessor = new PointAccessor(this, i);
					vertices.push(ptAccessor.P);
					remappedVertices[i] = activeIndex;
					activeIndex++;
				}
				/*else if (this.pointsData[i] != undefined && this.pointsData[i]["ptprims"] == undefined)
				{
				}*/
			}
			var k = 0;
			for (var i = 0; i < this.primitivesData.length; i++) {
				if (this.primitivesData[i] != undefined) {
					var primAccessor: PrimitiveAccessor = new PrimitiveAccessor(this, i);
					primAccessor.RecalculateNormal();
				}
			}
			for (var i = 0; i < this.primitivesData.length; i++) {
				if (this.primitivesData[i] != undefined) {
					uvs.push([]);

					var primAccessor: PrimitiveAccessor = new PrimitiveAccessor(this, i);
					if (typeof primAccessor.attrib("uvs") === "number") {
						if (verbose) {
							// console.error("no uvs found.");
						}
						primAccessor.setAttrib("uvs", [new THREE.Vector2(0, 0), new THREE.Vector2(0, 1), new THREE.Vector2(1, 1)]);
					}

					uvs[k] = primAccessor.uvs;

					triangles.push(new THREE.Face3(
						remappedVertices[primAccessor.Vertices[0]],
						remappedVertices[primAccessor.Vertices[1]],
						remappedVertices[primAccessor.Vertices[2]])
					);
					var pt0 = new PointAccessor(this, primAccessor.Vertices[0]);
					var pt1 = new PointAccessor(this, primAccessor.Vertices[1]);
					var pt2 = new PointAccessor(this, primAccessor.Vertices[2]);

					var pt0Normals = pt0.GetPrimitivesNormals();
					var pt1Normals = pt1.GetPrimitivesNormals();
					var pt2Normals = pt2.GetPrimitivesNormals();


					triangles[triangles.length - 1].normal = primAccessor.N;// pt1.P.clone().sub(pt0.P).cross(pt2.P.clone().sub(pt0.P));

					var n = triangles[triangles.length - 1].normal;
					triangles[triangles.length - 1].materialIndex = primAccessor.materialIndex;

					triangles[triangles.length - 1].vertexNormals = [];
					triangles[triangles.length - 1].vertexNormals.push(this.CalcNormal(pt0Normals, n, ceaseAngle), this.CalcNormal(pt1Normals, n, ceaseAngle), this.CalcNormal(pt2Normals, n, ceaseAngle));
					triangles[triangles.length - 1].vertexColors = primAccessor.colors;
					//triangles[triangles.length - 1].vertexNormals.push(pt0.N, pt1.N, pt2.N);
					k++;
				}
			}
			var uvs2: THREE.Vector2[][][] = [];
			uvs2.push(uvs);
			var resGeom: THREE.Geometry = new THREE.Geometry();
			resGeom.vertices = vertices;

			resGeom.faces = triangles;
			resGeom.faceVertexUvs = uvs2;
			resGeom.uvsNeedUpdate = true;


			//resGeom.computeVertexNormals();
			//resGeom.computeFaceNormals();
			//resGeom.computeFlatVertexNormals();
			//resGeom.computeFaceNormals();
			//resGeom.normalsNeedUpdate = true;
			return (resGeom);
		}
		// detail
		// vertices
		// primitives
		public detailData: { [id: string]: CustomData; } = {};
		public groupsData: { [id: string]: CustomData; }[] = [];
		public primitivesData: { [id: string]: CustomData; }[] = [];
		public quadsData: { [id: string]: CustomData; }[] = [];
		public pointsData: { [id: string]: CustomData; }[] = [];
		public parameters: { [id: string]: CustomData; } = {};
		public addpoint(pos: THREE.Vector3): number {
			var index: number = this.pointsData.length;
			this.pointsData.push({});
			this.setpointattrib(index, "P", pos);
			this.setpointattrib(index, "N", Vector3.Up.multiplyScalar(-1.0));

			return (index);
		}

		public removepoint(ptnum: number) {
			this.pointsData[ptnum] = undefined;
		}
		public point<T extends Data>(index: number, attributeName: string): T {
			if (this.pointsData[index][attributeName] == undefined) {
				this.pointsData[index][attributeName] = new CustomData(attributeName, 0);
			}

			return (this.pointsData[index][attributeName].value as T);
		}
		public setpointattrib(index: number, attributeName: string, value: Data): void {
			this.pointsData[index][attributeName] = new CustomData(attributeName, value);
		}
		public test(index: number, attributeName: string): THREE.Vector3 {
			return (new THREE.Vector3());
		}

		public addprim(pointIds: number[]): number {
			var index: number = this.primitivesData.length;
			this.primitivesData.push({});
			this.setprimattrib(index, "Vertices", pointIds);
			return (index);
		}


		public prim<T extends Data>(index: number, attributeName: string): T {
			if (this.primitivesData[index][attributeName] == undefined) {
				this.primitivesData[index][attributeName] = new CustomData(attributeName, 0);
			}
			return (this.primitivesData[index][attributeName].value as T);
		}
		public setprimattrib<T>(index: number, attributeName: string, value: Data): void {
			if (attributeName === "Vertices") {
				var vertices = value as number[];
				for (var i = 0; i < (vertices).length; i++) {
					if (this.pointsData[(vertices)[i]]["ptprims"] == undefined) {
						var data: CustomData = new CustomData("ptprims", <number[]>[]);
						this.pointsData[(vertices)[i]]["ptprims"] = data;
					}
					if ((<number[]>(this.pointsData[(vertices)[i]]["ptprims"].value)).indexOf(index) <= -1) {
						(<number[]>(this.pointsData[(vertices)[i]]["ptprims"].value)).push(index);
					}
				}
			}
			this.primitivesData[index][attributeName] = new CustomData(attributeName, value);
		}
		public addgroup(name: string = "", primIds: number[] = undefined, points: number[] = undefined): number {
			var index: number = this.groupsData.length;
			this.groupsData.push({});
			this.setgroupattrib(index, "Name", name);
			if (points != undefined) {
				this.setgroupattrib(index, "Points", points);
			}
			if (primIds != undefined) {
				this.setgroupattrib(index, "Primitives", primIds);
			}
			return (index);
		}
		public group<T extends Data>(index: number, attributeName: string): T {
			if (this.groupsData[index][attributeName] == undefined) {
				this.groupsData[index][attributeName] = new CustomData(attributeName, 0);
			}
			return (this.groupsData[index][attributeName].value as T);
		}
		public setpointgroup(index: number, groupIndex: number, removeFromOtherGroups: boolean = true, groupsName: string = undefined) {
			if (this.groupsData[groupIndex] == undefined) {
				// console.error("Group not found.")
			}
			else {
				var points: number[] = this.group(groupIndex, "Points");
				if (points.indexOf(index) <= -1) {
					points.push(index);
				}
				if (removeFromOtherGroups && this.pointsData[index]["ptgroups"] != undefined) {
					var ptgroups = this.pointsData[index]["ptgroups"].value as number[];
					for (var i = 0; i < ptgroups.length; i++) {
						var groupName: string = this.group(ptgroups[i], "Name");
						if (groupsName == undefined || groupName == groupsName) {
							var groupprims: number[] = this.group(ptgroups[i], "Points");
							var index2: number = -1;
							while ((index2 = groupprims.indexOf(index)) > -1) {
								groupprims.splice(index2, 1);
							}
						}
					}
					(this.pointsData[index]["ptgroups"].value as number[]).length = 0;
				}
				if (this.pointsData[index]["ptgroups"] == undefined) {
					var data: CustomData = new CustomData("ptgroups", <number[]>[]);
					this.pointsData[index]["ptgroups"] = data;
				}
				if ((<number[]>(this.pointsData[index]["ptgroups"].value)).indexOf(index) <= -1) {
					(<number[]>(this.pointsData[index]["ptgroups"].value)).push(index);
				}
			}
		}
		public setprimgroup(index: number, groupIndex: number, removeFromOtherGroups: boolean = false, groupsName: string = undefined) {
			if (this.groupsData[groupIndex] == undefined) {
				// console.error("Group not found.")
			}
			else {
				var primitives: number[] = this.group(groupIndex, "Primitives");
				if (primitives.indexOf(index) <= -1) {
					primitives.push(index);
				}
				if (removeFromOtherGroups && this.primitivesData[index]["primgroups"] != undefined) {
					var primgroups = this.primitivesData[index]["primgroups"].value as number[];
					for (var i = 0; i < primgroups.length; i++) {
						var groupName: string = this.group(primgroups[i], "Name");
						if (groupsName == undefined || groupName == groupsName) {
							var groupprims: number[] = this.group(primgroups[i], "Primitives");
							var index2: number = -1;
							while ((index2 = groupprims.indexOf(index)) > -1) {
								groupprims.splice(index2, 1);
							}
						}
					}
					(this.primitivesData[index]["primgroups"].value as number[]).length = 0;
				}
				if (this.primitivesData[index]["primgroups"] == undefined) {
					var data: CustomData = new CustomData("primgroups", <number[]>[]);
					this.primitivesData[index]["primgroups"] = data;
				}
				if ((<number[]>(this.primitivesData[index]["primgroups"].value)).indexOf(index) <= -1) {
					(<number[]>(this.primitivesData[index]["primgroups"].value)).push(index);
				}
			}
		}
		public removepointfromgroup(index: number, groupIndex: number) {
			var ptgroups = this.pointsData[index]["ptgroups"].value as number[];
			var index2: number = -1;
			while ((index2 = ptgroups.indexOf(groupIndex)) > -1) {
				ptgroups.splice(index2, 1);
			}
			var grouppts: number[] = this.group(groupIndex, "Points");
			while ((index2 = grouppts.indexOf(index)) > -1) {
				grouppts.splice(index2, 1);
			}
		}
		public removeprimfromgroup(index: number, groupIndex: number) {
			var primgroups = this.pointsData[index]["primgroups"].value as number[];
			var index2: number = -1;
			while ((index2 = primgroups.indexOf(groupIndex)) > -1) {
				primgroups.splice(index2, 1);
			}
			var groupprims: number[] = this.group(groupIndex, "Primitives");
			while ((index2 = groupprims.indexOf(index)) > -1) {
				groupprims.splice(index2, 1);
			}
		}

		public setgroupattrib<T>(index: number, attributeName: string, value: Data): void {

			if (attributeName === "Points") {
				var vertices = value as number[];
				for (var i = 0; i < (vertices).length; i++) {
					if (this.pointsData[(vertices)[i]]["ptgroups"] == undefined) {
						var data: CustomData = new CustomData("ptgroups", <number[]>[]);
						this.pointsData[(vertices)[i]]["ptgroups"] = data;
					}
					if ((<number[]>(this.pointsData[(vertices)[i]]["ptgroups"].value)).indexOf(index) <= -1) {
						(<number[]>(this.pointsData[(vertices)[i]]["ptgroups"].value)).push(index);
					}
				}
			}

			if (attributeName === "Primitives") {
				var primitives = value as number[];
				for (var i = 0; i < (primitives).length; i++) {
					if (this.primitivesData[(primitives)[i]]["primgroups"] == undefined) {
						var data: CustomData = new CustomData("primgroups", <number[]>[]);
						this.primitivesData[(primitives)[i]]["primgroups"] = data;
					}
					if ((<number[]>(this.primitivesData[(primitives)[i]]["primgroups"].value)).indexOf(index) <= -1) {
						(<number[]>(this.primitivesData[(primitives)[i]]["primgroups"].value)).push(index);
					}
				}
			}

			this.groupsData[index][attributeName] = new CustomData(attributeName, value);
		}

		public removeprim(primnum: number, andPoints: boolean = false) {
			if (this.primitivesData[primnum] != undefined) {
				var primAccessor = new PrimitiveAccessor(this, primnum);
				// si la prim est retirée, on doit la retirer des edges, si l'edge n'a plus de primitives, alors il dégage.


				for (var i = 0; i < primAccessor.Vertices.length; i++) {
					var accessor = new PointAccessor(this, primAccessor.Vertices[i]);

					var ptprims: number[] = accessor.attrib("ptprims");

					if (andPoints) {
						for (var j = 0; j < ptprims.length; j++) {
							if (ptprims[j] != primnum) {
								this.removeprim(ptprims[j], false);
							}
						}
					}
				}

				for (var i = 0; i < primAccessor.Vertices.length; i++) {
					var accessor = new PointAccessor(this, primAccessor.Vertices[i]);

					var ptprims: number[] = accessor.attrib("ptprims");
					ptprims.splice(ptprims.indexOf(primnum), 1);

				}

				if (andPoints) {

					var vertices = primAccessor.Vertices;
					for (var i = 0; i < vertices.length; i++) {
						this.removepoint(vertices[i]);
					}
				}

				this.primitivesData[primnum] = undefined;
			}
		}





		public addquad(primIds: number[]): number {
			var index: number = this.quadsData.length;
			this.quadsData.push({});
			var linkedEdge: number[] = [];
			var linkedEdge2: number[] = [];
			var linkedEdgeIndices: number[] = [];
			var primAccessor = new PrimitiveAccessor(this, primIds[0]);
			var primAccessor2 = new PrimitiveAccessor(this, primIds[1]);
			for (var i = 0; i < primAccessor.Vertices.length; i++) {
				var ptAccessor = new PointAccessor(this, primAccessor.Vertices[i]);
				for (var j = 0; j < ptAccessor.ptprims.length; j++) {
					if (ptAccessor.ptprims[j] == primIds[1]) {
						linkedEdge.push(ptAccessor.ptnum);
						linkedEdge2.push(ptAccessor.ptnum);
						linkedEdgeIndices.push(i);
					}
				}
			}
			if (linkedEdge.length == 0) {
				for (var i = 0; i < primAccessor.Vertices.length; i++) {
					var ptAccessor = new PointAccessor(this, primAccessor.Vertices[i]);
					for (var j = 0; j < primAccessor2.Vertices.length; j++) {
						var ptAccessor2 = new PointAccessor(this, primAccessor2.Vertices[j]);
						if (ptAccessor.P.distanceTo(ptAccessor2.P) <= Number.EPSILON) {
							linkedEdge.push(ptAccessor.ptnum);
							linkedEdge2.push(ptAccessor2.ptnum);
							linkedEdgeIndices.push(i);
						}
					}
				}
			}
			var quadPoints: number[] = [];
			var quadVertices: number[] = [];
			for (var i = 0; i < primAccessor.Vertices.length; i++) {
				if (linkedEdge.indexOf(primAccessor.Vertices[i]) <= -1) {
					var nextIndex = linkedEdge.indexOf(primAccessor.Vertices[(i + 1) % primAccessor.Vertices.length]);
					quadPoints.push(primAccessor.Vertices[i]);
					quadVertices.push(i);
					quadPoints.push(linkedEdge[nextIndex]);
					quadVertices.push(linkedEdgeIndices[nextIndex]);
					for (var j = 0; j < primAccessor2.Vertices.length; j++) {
						if (linkedEdge2.indexOf(primAccessor2.Vertices[j]) <= -1) {
							quadPoints.push(primAccessor2.Vertices[j]);
							quadVertices.push(j + 3);
						}
						else {
						}
					}
					quadPoints.push(linkedEdge[(nextIndex + 1) % 2]);
					if (linkedEdge[(nextIndex + 1) % 2] == undefined) {
					}
					quadVertices.push(linkedEdgeIndices[(nextIndex + 1) % 2]);
					break;
				}
			}
			this.setquadattrib(index, "Vertices", quadVertices);
			this.setquadattrib(index, "Points", quadPoints);
			this.setquadattrib(index, "Primitives", primIds);

			return (index);
		}
		public quad<T extends Data>(index: number, attributeName: string): T {
			if (this.quadsData[index][attributeName] == undefined) {
				this.quadsData[index][attributeName] = new CustomData(attributeName, 0);
			}
			return (this.quadsData[index][attributeName].value as T);
		}
		public setquadattrib<T>(index: number, attributeName: string, value: Data): void {
			this.quadsData[index][attributeName] = new CustomData(attributeName, value);
		}
		public removequad(quadnum: number, andPoints: boolean = false) {
			this.quadsData[quadnum] = undefined;
		}

		public ch<T extends Data>(attributeName: string): T {
			if (this.parameters[attributeName] == undefined) {
				var keys = Object.keys(this.parameters);

				for (var i = 0; i < keys.length; i++)// key in Object.keys(this.parameters))
				{
				}
				this.parameters[attributeName] = new CustomData(attributeName, 0);
			}
			return (this.parameters[attributeName].value as T);
		}
		public detail<T extends Data>(attributeName: string): T {
			if (this.detailData[attributeName] == undefined) {
				this.detailData[attributeName] = new CustomData(attributeName, 0);
			}
			return (this.detailData[attributeName].value as T);
		}
		public setdetailattrib<T>(attributeName: string, value: Data) {
			this.detailData[attributeName] = new CustomData(attributeName, value);
		}
		public clone(): ProceduralMesh {
			//clone chaque array.
			var newPrimitivesData = [];
			var newPointsData = [];
			var newDetailData = {};
			var newQuadsData = [];
			var newgroupsData = [];
			for (var i = 0; i < this.primitivesData.length; i++) {

				if (this.primitivesData[i] != undefined) {
					newPrimitivesData.push({});
					var keys = Object.keys(this.primitivesData[i]);
					for (var j = 0; j < keys.length; j++) {
						if (this.primitivesData[i][keys[j]] != undefined) {
							newPrimitivesData[i][keys[j]] = this.primitivesData[i][keys[j]].clone();
						}
						else {
							newPrimitivesData[i][keys[j]] = undefined;
						}
					}
				}
				else {
					newPrimitivesData.push(undefined);
				}
			}



			for (var i = 0; i < this.groupsData.length; i++) {

				if (this.groupsData[i] != undefined) {
					newgroupsData.push({});
					var keys = Object.keys(this.groupsData[i]);
					for (var j = 0; j < keys.length; j++) {
						if (this.groupsData[i][keys[j]] != undefined) {
							newgroupsData[i][keys[j]] = this.groupsData[i][keys[j]].clone();
						}
						else {
							newgroupsData[i][keys[j]] = undefined;
						}
					}
				}
				else {
					newgroupsData.push(undefined);
				}
			}

			for (var i = 0; i < this.quadsData.length; i++) {

				if (this.quadsData[i] != undefined) {
					newQuadsData.push({});
					var keys = Object.keys(this.quadsData[i]);
					for (var j = 0; j < keys.length; j++) {
						if (this.quadsData[i][keys[j]] != undefined) {
							newQuadsData[i][keys[j]] = this.quadsData[i][keys[j]].clone();
						}
						else {
							newQuadsData[i][keys[j]] = undefined;
						}
					}
				}
				else {
					newQuadsData.push(undefined);
				}
			}
			for (var i = 0; i < this.pointsData.length; i++) {

				if (this.pointsData[i] != undefined) {
					newPointsData.push({});
					var keys = Object.keys(this.pointsData[i]);
					for (var j = 0; j < keys.length; j++) {
						if (this.pointsData[i][keys[j]] != undefined) {
							newPointsData[i][keys[j]] = this.pointsData[i][keys[j]].clone();
						}
						else {
							newPointsData[i][keys[j]] = undefined;
						}
					}
				}
				else {
					newPointsData.push(undefined);
				}
			}
			var keys = Object.keys(this.detailData);
			for (var j = 0; j < keys.length; j++) {
				if (this.detailData[keys[j]] != undefined) {
					newDetailData[keys[j]] = this.detailData[keys[j]].clone();
				}
				else {
					newDetailData[keys[j]] = undefined;
				}
			}



			var res = new ProceduralMesh();
			res.primitivesData = newPrimitivesData;
			res.pointsData = newPointsData;
			res.detailData = newDetailData;
			res.quadsData = newQuadsData;
			res.parameters = this.parameters;
			res.groupsData = newgroupsData;
			return (res);
		}

		public IteratePoints(iterator: (data: ProceduralMesh, accessor: PointAccessor) => void): ProceduralMesh {
			var res: ProceduralMesh = this.clone();

			for (var i = 0; i < this.pointsData.length; i++) {
				if (res.pointsData[i] != undefined) {
					iterator(res, new PointAccessor(res, i));
				}
			}
			return (res);
		}
		public IteratePointsRaw(iterator: (data: ProceduralMesh, accessor: PointAccessor) => void): ProceduralMesh {
			var res: ProceduralMesh = this;
			for (var i = 0; i < this.pointsData.length; i++) {
				if (res.pointsData[i] != undefined) {
					iterator(res, new PointAccessor(res, i));
				}
			}
			return (res);
		}
		public IteratePrimitives(iterator: (data: ProceduralMesh, accessor: PrimitiveAccessor) => void): ProceduralMesh {
			var res: ProceduralMesh = this.clone();
			for (var i = 0; i < this.primitivesData.length; i++) {
				if (res.primitivesData[i] != undefined) {
					iterator(res, new PrimitiveAccessor(res, i));
				}
			}
			return (res);
		}


		public IteratePrimitivesRaw(iterator: (data: ProceduralMesh, accessor: PrimitiveAccessor) => void): ProceduralMesh {
			var res: ProceduralMesh = this;
			for (var i = 0; i < this.primitivesData.length; i++) {
				if (res.primitivesData[i] != undefined) {
					iterator(res, new PrimitiveAccessor(res, i));
				}
			}
			return (res);
		}

		public IterateQuads(iterator: (data: ProceduralMesh, accessor: QuadAccessor) => void): ProceduralMesh {
			var res: ProceduralMesh = this.clone();
			for (var i = 0; i < this.quadsData.length; i++) {
				if (res.quadsData[i] != undefined) {
					iterator(res, new QuadAccessor(res, i));
				}
			}
			return (res);
		}
		public IterateDetail(iterator: (data: ProceduralMesh) => void): ProceduralMesh {
			var res: ProceduralMesh = this.clone();
			iterator(res);
			return (res);
		}

		public IterateDetailRaw(iterator: (data: ProceduralMesh) => void): ProceduralMesh {
			var res: ProceduralMesh = this;
			iterator(res);
			return (res);
		}


	}
}