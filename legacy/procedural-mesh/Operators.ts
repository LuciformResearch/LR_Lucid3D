/// <reference path="../proceduralMesh/ProceduralMeshOperation.ts" />
module GAME {


	export class Operator {


		private static _uvsToQuadsDistances: ProceduralMeshOperation;
		private static _getBounds: ProceduralMeshOperation;
		private static _computeQuadsOperation: ProceduralMeshOperation;
		public static get ComputeQuads(): ProceduralMeshOperation {
			if (Operator._computeQuadsOperation == undefined) {
				var computeQuadsOperation: ProceduralMeshOperation = new ProceduralMeshOperation();
				computeQuadsOperation.addIterator(IteratorType.Detail, <DetailIterator>((data) => {

					var quadNormals: THREE.Vector3[] = [];
					var quads: { [index: number]: number[] } = {};
					var isolateQuadsFromNormals = data.IteratePrimitivesRaw((data, accessor) => {
						var index = -1;
						for (var i = 0; i < quadNormals.length; i++) {
							if (quadNormals[i].angleTo(accessor.N) <= 0.01) {
								var otherQuad = new PrimitiveAccessor(data, quads[i][0]);
								var l: number = 0;
								for (var j = 0; j < otherQuad.Vertices.length; j++) {
									var otherPoint = new PointAccessor(data, otherQuad.Vertices[j]);
									for (var k = 0; k < accessor.Vertices.length; k++) {

										var point = new PointAccessor(data, accessor.Vertices[k]);
										if (otherPoint.P.distanceTo(point.P) <= 0.002) {
											l++;
										}
									}

								}
								if (l == 2) {
									index = i;
									break;
								}
							}
						}
						if (index == -1) {
							index = quadNormals.length;
							quadNormals.push(accessor.N);
							quads[index] = [];
						}
						quads[index].push(accessor.primnum);
					});

					var keys = Object.keys(quads);
					for (var i = 0; i < keys.length; i++) {
						var quadnum: number = data.addquad(quads[i]);
						var quad: QuadAccessor = new QuadAccessor(data, quadnum);
						quad.setAttrib("initialQuadNormal", quad.N.clone());
					}
				}));
				Operator._computeQuadsOperation = computeQuadsOperation;
			}
			return (Operator._computeQuadsOperation);
		}

		public static get Connectivity(): ProceduralMeshOperation {
			var operation = new ProceduralMeshOperation();
			operation.addIterator(IteratorType.Detail, <DetailIterator>(data: ProceduralMesh) => {
				var ptsByGroup: { [index: number]: number[] } = {};
				var groupCount = 0;

				// je prends un point, tout ses neighboors je les passe au meme groupe, si le groupe existe deja, je merge les deux groupes.
				data.IteratePointsRaw((data, accessor) => {
					var ptGroup: number = 0;
					if (accessor.attrib("grouped") == 0) {
						//var groupCount: number = data.detail("groupCount");
						accessor.setAttrib("grouped", 1);
						ptGroup = data.addgroup("connectivity", undefined, [accessor.ptnum]);
						//data.setpointgroup(accessor.ptnum, )
						//accessor.setAttrib("group", groupCount);
						ptsByGroup[ptGroup] = [];
						ptsByGroup[ptGroup].push(accessor.ptnum);

						groupCount++;
					}
					else {
						var ptGroups = accessor.attrib("ptgroups") as number[];
						for (var i = 0; i < ptGroups.length; i++) {
							var groupName: string = data.group(ptGroups[i], "Name");
							if (groupName == "connectivity") {
								ptGroup = ptGroups[i];
								break;
							}
						}
					}

					var neighs = accessor.Neighbors;

					for (var i = 0; i < neighs.length; i++) {
						var neigh: PointAccessor = new PointAccessor(data, neighs[i]);
						if (neigh.attrib("grouped") == 0) {
							neigh.setAttrib("grouped", 1);
							data.setpointgroup(neighs[i], ptGroup);
							//neigh.setAttrib("grouped", 1);
							//neigh.setAttrib("group", ptGroup);
							ptsByGroup[ptGroup].push(neigh.ptnum);
						}
						else {
							var neighgroup = -1;
							var neighptGroups = accessor.attrib("ptgroups") as number[];
							for (var j = 0; j < neighptGroups.length; j++) {
								var groupName: string = data.group(neighptGroups[j], "Name");
								if (groupName == "connectivity") {
									neighgroup = neighptGroups[j];
									break;
								}
							}

							var groupPts: number[] = ptsByGroup[neighgroup as number];
							for (var j = 0; j < groupPts.length; j++) {
								data.setpointgroup(groupPts[j], ptGroup, true, "connectivity");
								//data.setpointattrib(groupPts[j], "group", ptGroup);
								//ptsByGroup[ptGroup].push(groupPts[j]);
							}

							ptsByGroup[neighgroup] = undefined;
						}
					}
				});
				data.IteratePrimitivesRaw((data, accessor) => {
					var pts: number[] = accessor.Vertices;
					var ptGroups: number[] = accessor.attrib("ptgroups");
					var ptGroup: number = -1;
					for (var i = 0; i < ptGroups.length; i++) {
						var groupName: string = data.group(ptGroups[i], "Name");
						if (groupName == "connectivity") {
							ptGroup = ptGroups[i];
							break;
						}
					}
					data.setprimgroup(accessor.primnum, ptGroup, true, "connectivity");
					//accessor.setAttrib("group", data.point(pts[0], "group"));
				});
				//data.setdetailattrib("groupCount", 0);
			});
			return (operation);
		}

		public static get UvsToQuadsDistances(): ProceduralMeshOperation {
			if (Operator._uvsToQuadsDistances == undefined) {

				var uvsToQuadsDistances = new ProceduralMeshOperation();
				uvsToQuadsDistances.addIterator(IteratorType.Quad, <QuadIterator>((data, accessor) => {

					var points = accessor.Points;
					var rightSegment: SegmentAccessor =
						new SegmentAccessor(data, new PointAccessor(data, points[0]), new PointAccessor(data, points[1]));
					var upSegment: SegmentAccessor =
						new SegmentAccessor(data, new PointAccessor(data, points[0]), new PointAccessor(data, points[3]));
					var size: THREE.Vector2 = new THREE.Vector2(rightSegment.length, upSegment.length);

					accessor.setUv(accessor.Vertices[0], new THREE.Vector2(0, 0).multiply(size));
					accessor.setUv(accessor.Vertices[1], new THREE.Vector2(1, 0).multiply(size));
					accessor.setUv(accessor.Vertices[2], new THREE.Vector2(1, 1).multiply(size));
					accessor.setUv(accessor.Vertices[3], new THREE.Vector2(0, 1).multiply(size));
				}));
				Operator._uvsToQuadsDistances = uvsToQuadsDistances;
			}

			return (Operator._uvsToQuadsDistances);
		}
		//
		public static get GetBounds(): ProceduralMeshOperation {
			if (Operator._getBounds == undefined) {
				var getBounds = new ProceduralMeshOperation();
				getBounds.addIterator(IteratorType.Detail, <DetailIterator>((data) => {
					var min: THREE.Vector3 = Vector3.Zero;
					var max: THREE.Vector3 = Vector3.Zero;
					var once: boolean = false;
					data.IteratePointsRaw((data, accessor) => {
						if (once == false) {
							min = accessor.P.clone();
							max = accessor.P.clone();
							once = true;
						}
						else {
							min.min(accessor.P);
							max.max(accessor.P);
						}
					});
					data.setdetailattrib("center", max.clone().sub(min).multiplyScalar(0.5).add(min));
					data.setdetailattrib("min", min);
					data.setdetailattrib("max", max);

				}));
				Operator._getBounds = getBounds;
			}
			return (Operator._getBounds);
		}
		private static _applyBoundsAnchor: ProceduralMeshOperation;

		public static get ApplyBoundsAnchor(): ProceduralMeshOperation {
			if (Operator._applyBoundsAnchor == undefined) {
				var applyBoundsAnchor = new ProceduralMeshOperation();
				//applyBoundsAnchor.setparameter("anchor", new THREE.Vector3(0.0, 1.0, 0));
				applyBoundsAnchor.addIterator(IteratorType.Detail, <DetailIterator>((data) => {
					var min: THREE.Vector3 = data.detail("min");
					var max: THREE.Vector3 = data.detail("max");
					var anchoredDisplacement = (max.clone().sub(min).multiply(data.ch("anchor"))).multiplyScalar(-1.0);
					data.IteratePointsRaw((data, accessor) => {
						accessor.P.sub(min).add(anchoredDisplacement);
					});
				}));
				Operator._applyBoundsAnchor = applyBoundsAnchor;
			}
			return (Operator._applyBoundsAnchor);
		}
		private static _originToAnchor: ProceduralMeshOperation;
		public static get OriginToAnchor(): ProceduralMeshOperation {
			if (Operator._originToAnchor == undefined) {
				var originToAnchor = ProceduralMeshOperation.MergeOperations(Operator.GetBounds, Operator.ApplyBoundsAnchor);
				originToAnchor.setparameter("anchor", new THREE.Vector3(0.0, 1.0, 0));
				Operator._originToAnchor = originToAnchor;
			}
			return (Operator._originToAnchor);
		}



		private static _uvsToQuads: ProceduralMeshOperation;
		public static get UvsToQuads(): ProceduralMeshOperation {
			if (Operator._uvsToQuads == undefined) {
				var uvsToQuads = new ProceduralMeshOperation();
				uvsToQuads.addIterator(IteratorType.Quad, <QuadIterator>((data, accessor) => {

					accessor.setUv(accessor.Vertices[0], new THREE.Vector2(0, 0));
					accessor.setUv(accessor.Vertices[1], new THREE.Vector2(1, 0));
					accessor.setUv(accessor.Vertices[2], new THREE.Vector2(1, 1));
					accessor.setUv(accessor.Vertices[3], new THREE.Vector2(0, 1));
				}));
				Operator._uvsToQuads = uvsToQuads;
			}
			return (Operator._uvsToQuads);
		}

		private static _applyEulerRotation: ProceduralMeshOperation;
		public static get ApplyEulerRotation(): ProceduralMeshOperation {
			if (Operator._applyEulerRotation == undefined) {
				var applyEulerRotation = new ProceduralMeshOperation();
				applyEulerRotation.setparameter("euler", new THREE.Vector3(90, 0, 0));
				applyEulerRotation.addIterator(IteratorType.Point, <PointIterator>((data, accessor) => {
					accessor.P = accessor.P.clone()
						.applyEuler(new THREE.Euler()
							.setFromVector3(data.ch("euler")));

				}));
				Operator._applyEulerRotation = applyEulerRotation;
			}
			return (Operator._applyEulerRotation);
		}
		private static _applyAxisangleRotation: ProceduralMeshOperation;
		public static get ApplyAxisAngleRotation(): ProceduralMeshOperation {
			if (Operator._applyAxisangleRotation == undefined) {
				var applyAxisAngleRotation = new ProceduralMeshOperation();
				applyAxisAngleRotation.setparameter("angle", 90);
				applyAxisAngleRotation.setparameter("axis", new THREE.Vector3(1, 0, 0));
				applyAxisAngleRotation.addIterator(IteratorType.Point, <PointIterator>((data, accessor) => {
					accessor.P.applyAxisAngle(data.ch("axis"), data.ch("angle"));
				}));
				Operator._applyAxisangleRotation = applyAxisAngleRotation;

			}
			return (Operator._applyAxisangleRotation);
		}
		private static _applyLookatRotation: ProceduralMeshOperation;
		public static get ApplyLookAtRotation(): ProceduralMeshOperation {
			if (Operator._applyLookatRotation == undefined) {
				var applyLookAtRotation = new ProceduralMeshOperation();
				applyLookAtRotation.setparameter("forward", new THREE.Vector3(1, 0, 0));
				applyLookAtRotation.setparameter("up", new THREE.Vector3(0, 1, 0));
				applyLookAtRotation.addIterator(IteratorType.Point, <PointIterator>((data, accessor) => {
					accessor.P.applyQuaternion(QuaternionHelper.LookAtQuaternion(Vector3.Zero, data.ch("forward"), data.ch("up")));// (data.ch("axis"), data.ch("angle"));
				}));
				Operator._applyLookatRotation = applyLookAtRotation;
			}
			return (Operator._applyLookatRotation);
		}

		private static _fuse: ProceduralMeshOperation;
		public static get Fuse(): ProceduralMeshOperation {
			if (Operator._fuse == undefined) {
				var fuse = new ProceduralMeshOperation();
				fuse.setparameter("maxDist", 0.002);
				fuse.addIterator(IteratorType.Point, <PointIterator>((data, accessor) => {
					for (var i = 0; i < data.pointsData.length; i++) {
						if (data.pointsData[i] != undefined && i != accessor.ptnum) {
							if (data.pointsData[accessor.ptnum] == undefined) {
							}
							var other = new PointAccessor(data, i);
							if (other.P.distanceTo(accessor.P) <= data.ch("maxDist")) {
								var ptprims = other.ptprims;
								for (var j = 0; j < ptprims.length; j++) {
									var prim = new PrimitiveAccessor(data, ptprims[j]);
									var Vertices = prim.Vertices;
									var index = Vertices.indexOf(other.ptnum);
									if (Vertices.indexOf(accessor.ptnum) == -1) {
										Vertices[index] = accessor.ptnum;
										accessor.ptprims.push(prim.primnum);
									}
								}
								data.removepoint(other.ptnum);
							}
						}
					}
				}));
				fuse.addIterator(IteratorType.Point, <PointIterator>((data, accessor) => {
					var ptprims = <number[]>accessor.ptprims;
					var N: THREE.Vector3 = Vector3.Zero;
					if (typeof (accessor.attrib("ptprims")) === "number" || ptprims.length == 0) {
					}
					for (var i = 0; i < ptprims.length; i++) {
						var prim = new PrimitiveAccessor(data, ptprims[i]);
						var primN = prim.N;
						(primN as any) == 0;
						prim.RecalculateNormal();
						N.add(prim.N.clone().divideScalar(ptprims.length));
					}
					accessor.N = N.normalize();
				}));

				Operator._fuse = fuse;
			}
			return (Operator._fuse);
		}

		private static _polyExtrude: ProceduralMeshOperation;
		public static get PolyExtrude(): ProceduralMeshOperation {
			if (Operator._polyExtrude == undefined) {
				var polyExtrude = new ProceduralMeshOperation();
				polyExtrude.setparameter("separateParts", 0);
				polyExtrude.setparameter("length", 2.0);
				polyExtrude.addIterator(IteratorType.Detail, <DetailIterator>((data) => {
					var newPrims: number[][] = [];
					var newUvs: THREE.Vector2[][] = [];
					var oldPrims: PrimitiveAccessor[] = [];
					var separateParts = data.ch("separateParts") == 0 ? false : true;

					var pointsClone: { [index: number]: number } = {};
					var extrudedPts: { [index: number]: number } = {};
					var cloneExtrudedPts: { [index: number]: number } = [];
					var points2: number[] = [];
					data.IteratePointsRaw((data, accessor) => {
						points2.push(accessor.ptnum);
					});

					for (var i = 0; i < points2.length; i++) {

						var point = new PointAccessor(data, points2[i]);
						var attribs = data.pointAttribs(points2[i]);
						
						if (separateParts) {
							var clonePt = data.addpoint(point.P.clone());
							pointsClone[point.ptnum] = clonePt;
							for (var j = 0; j < attribs.length; j++)
							{
								if (attribs[j] == "ptgroups")
								{

								}
								else if (attribs[j] != "ptprims")
								{
									data.setpointattrib(clonePt, attribs[j], point.attrib(attribs[j]));	
								}
							}

						}
						extrudedPts[point.ptnum] = (data.addpoint(point.P.clone()));
						var extruded = new PointAccessor(data, extrudedPts[i]);
						extruded.N = point.N.clone();
						extruded.P = extruded.P.add(extruded.N.clone().multiplyScalar(data.ch("length")));// .add(extruded.N.clone().multiply(data.ch("length")));
						
						for (var j = 0; j < attribs.length; j++)
						{
							if (attribs[j] == "ptgroups")
							{

							}
							else if (attribs[j] != "ptprims" && attribs[j] != "P")
							{
					
								extruded.setAttrib(attribs[j], point.attrib(attribs[j]));	
							}
						}
					}


					if (separateParts) {
						for (var i = 0; i < points2.length; i++) {
							var point = new PointAccessor(data, points2[i]);
							cloneExtrudedPts[point.ptnum] = (data.addpoint(point.P.clone()));
							var extruded = new PointAccessor(data, cloneExtrudedPts[i]);
							extruded.N = point.N.clone();
							extruded.P = extruded.P.add(extruded.N.clone().multiplyScalar(data.ch("length")));// .add(extruded.N.clone().multiply(data.ch("length")));
							var attribs = data.pointAttribs(points2[i]);
							for (var j = 0; j < attribs.length; j++)
							{
								if (attribs[j] != "ptprims")
								{
									extruded.setAttrib(attribs[j], point.attrib(attribs[j]));	
								}
							}
						}
					}

					data.IteratePrimitivesRaw((data, accessor) => {
						accessor.RecalculateNormal();
						var primPoints = accessor.Vertices;
						var uvs = accessor.uvs;
						var edges: SegmentAccessor[] = [];
						for (var i = 0; i < primPoints.length; i++) {
							edges.push(
								new SegmentAccessor(data, new PointAccessor(data, primPoints[i]), new PointAccessor(data, primPoints[(i + 1) % primPoints.length])));
						}
						var contourEdges: { [index: number]: boolean } = {};
						for (var i = 0; i < edges.length; i++) {
							var commonPrimitives: number[] = [];
							var ptprims = edges[i].pt0.ptprims;
							var ptprims1 = edges[i].pt1.ptprims;
							for (var j = 0; j < ptprims.length; j++) {
								for (var k = 0; k < ptprims1.length; k++) {
									if (ptprims[j] == ptprims1[k]) {
										commonPrimitives.push(ptprims[j]);
									}
								}
							}
							if (commonPrimitives.length > 1) {
								contourEdges[i] = false;
								// we wont add a face following this segment.
							}
							else {
								contourEdges[i] = true;
							}
						}
						var primExtrudedPts: number[] = [];
						for (var i = 0; i < primPoints.length; i++) {
							primExtrudedPts.push(extrudedPts[primPoints[i]]);
						}


						var primExtrudedPtsClone: number[] = [];
						if (separateParts)
						{
						for (var i = 0; i < primPoints.length; i++) {
							primExtrudedPtsClone.push(cloneExtrudedPts[primPoints[i]]);
						}
					}
					else
					{
						primExtrudedPtsClone = primExtrudedPts;
					}


						var primPointsClone: number[] = [];
						if (separateParts)
						{
						for (var i = 0; i < primPoints.length; i++) {
							primPointsClone.push(pointsClone[primPoints[i]]);
						}
					}
					else
					{
						primPointsClone = primPoints;
					}
					
						// les faces des cotés:
						// un point, son extrusion, le point d'après, 
						// son extrusion, l'extrusion du point d'après, le point d'après.
						for (var i = 0; i < primPoints.length; i++) {
							if (contourEdges[i] == true) {
								var prim0: number[] = [];
								//tri0



								prim0.push(primPointsClone[i]);
								prim0.push(primExtrudedPtsClone[i]);
								prim0.push(primPointsClone[(i + 1) % primPointsClone.length]);

								var prim0UVs: THREE.Vector2[] = [new THREE.Vector2(0, 0), new THREE.Vector2(0, 1), new THREE.Vector2(1, 0)];
								
								/*prim0UVs.push(uvs[i].());
								prim0UVs.push(uvs[i].());
								prim0UVs.push(uvs[(i + 1) % uvs.length].());
			*/
								var prim1: number[] = [];
								//tri1



								prim1.push(primExtrudedPtsClone[i]);
								prim1.push(primExtrudedPtsClone[(i + 1) % primPointsClone.length]);
								prim1.push(primPointsClone[(i + 1) % primPointsClone.length]);




								var prim1UVs: THREE.Vector2[] = [new THREE.Vector2(0, 1), new THREE.Vector2(1, 1), new THREE.Vector2(1, 0)];
								/*
														prim1UVs.push(uvs[i].clone());
														prim1UVs.push(uvs[(i + 1) % uvs.length].clone());
														prim1UVs.push(uvs[(i + 1) % uvs.length].clone());
								*/
								oldPrims.push(accessor);
								oldPrims.push(accessor);

								newPrims.push(prim0);
								newPrims.push(prim1);
								
								newUvs.push(prim0UVs);
								newUvs.push(prim1UVs);
							}
							//data.addprim(prim0);
							//data.addprim(prim1);
						}

						var prim2 = new PrimitiveAccessor(data, accessor.primnum);
					
						oldPrims.push(accessor);
						newPrims.push(primExtrudedPts.reverse());

						var newPrimUvs: THREE.Vector2[] = [];
						for (var i = 0; i < uvs.length; i++) {
							newPrimUvs.push(uvs[i].clone());
						}
						newUvs.push(newPrimUvs);
						// la face du dessus:
						//data.addprim(extrudedPts);	

					});
					/*
						pour les nouvelles primitives, il faut recalculer les normales. 
						//(en effet les primitives sur le coté ne peuvent pas copier simplement l'ancienne normale)
						pour les uvs, il faut les stoquer en plus.
					*/

					for (var i = 0; i < newPrims.length; i++) {
						var oldPrim = oldPrims[i];
						
						var newPrimNum = data.addprim(newPrims[i]);
						var newPrim: PrimitiveAccessor = new PrimitiveAccessor(data, newPrimNum);
						var attribs = data.primAttribs(oldPrim.primnum);
						for (var j = 0; j < attribs.length; j++)
						{
							if (attribs[j] == "primgroups")
							{
								var groups = oldPrim.primgroups;
								for (var k = 0; k < groups.length; k++)
								{
									data.setprimgroup(newPrimNum, groups[k], false);
								}
							}
							else if (attribs[j] == "materialIndex")
							{
								data.setprimattrib(newPrimNum, "materialIndex", oldPrim.materialIndex);
							}
							/*else if (attribs[j] != "Vertices" && attribs[j] != "N")
							{
								newPrim.setAttrib(attribs[j], oldPrim.attrib(attribs[j]));									
							}*/
						}
						newPrim.RecalculateNormal();// newPrim.ComputeNormal();
						newPrim.uvs = newUvs[i];//[new THREE.Vector2(0, 0), new THREE.Vector2(1, 0), new THREE.Vector2(1, 1)];
						/*for (var j = 0; j < oldPrim.uvs.length; j++)
						{
							newPrim.uvs.push(oldPrim.uvs[j].clone());
						}*/
					}
					data.IteratePointsRaw((data, accessor) => {
						accessor.RecalculateNormal();
						
					});
				}));

				Operator._polyExtrude = polyExtrude;
			}
			return (Operator._polyExtrude);
		}
		private static _fuseAndExtrude: ProceduralMeshOperation;
		public static get FuseAndExtrude(): ProceduralMeshOperation {
			if (this._fuseAndExtrude == undefined) {
				var fuseAndExtrude: ProceduralMeshOperation = ProceduralMeshOperation.MergeOperations(Operator.Fuse, Operator.PolyExtrude);
				fuseAndExtrude.setparameter("maxDist", 0.002);
				fuseAndExtrude.setparameter("length", 2.0);
				this._fuseAndExtrude = fuseAndExtrude;
			}
			return (this._fuseAndExtrude);
		}
		private _operation: ProceduralMeshOperation;
		public constructor(operation: ProceduralMeshOperation) {
			this._operation = operation;
		}
		protected executeOperation(mesh: ProceduralMesh, parameters: { [id: string]: Data }): ProceduralMesh {
			var keys = Object.keys(parameters);
			for (var i = 0; i < keys.length; i++) {

				this._operation.setparameter(keys[i], parameters[keys[i]]);
			}
			this._operation.in = mesh;
			this._operation.execute();
			return (this._operation.out);
		}
	}
	export class ComputeQuadsOperator extends Operator {
		public constructor() {
			super(Operator.ComputeQuads);
		}
		public execute(mesh: ProceduralMesh): ProceduralMesh {
			return (super.executeOperation(mesh, {}));
		}

		public static Execute(mesh: ProceduralMesh): ProceduralMesh {
			return (new ComputeQuadsOperator().execute(mesh));
		}
	}
	export class UvsToQuadsDistancesOperator extends Operator {
		public constructor() {
			super(Operator.UvsToQuadsDistances);
		}
		public execute(mesh: ProceduralMesh): ProceduralMesh {
			return (super.executeOperation(mesh, {}));
		}
		public static Execute(mesh: ProceduralMesh): ProceduralMesh {
			return (new UvsToQuadsDistancesOperator().execute(mesh));
		}
	}
	export class UvsToQuadsOperator extends Operator {
		public constructor() {
			super(Operator.UvsToQuads);
		}
		public execute(mesh: ProceduralMesh): ProceduralMesh {
			return (super.executeOperation(mesh, {}));
		}
		public static Execute(mesh: ProceduralMesh): ProceduralMesh {
			return (new UvsToQuadsOperator().execute(mesh));
		}
	}
	export class GetBoundsOperator extends Operator {
		public constructor() {
			super(Operator.GetBounds);
		}
		public execute(mesh: ProceduralMesh): ProceduralMesh {
			return (super.executeOperation(mesh, {}));
		}
		public static Execute(mesh: ProceduralMesh): ProceduralMesh {
			return (new GetBoundsOperator().execute(mesh));
		}
	}

	export class ApplyBoundsAnchorOperator extends Operator {
		public constructor() {
			super(Operator.ApplyBoundsAnchor);
		}
		public execute(mesh: ProceduralMesh, anchor: THREE.Vector3): ProceduralMesh {
			return (super.executeOperation(mesh, { "anchor": anchor }));
		}
		public static Execute(mesh: ProceduralMesh, anchor: THREE.Vector3): ProceduralMesh {
			return (new ApplyBoundsAnchorOperator().execute(mesh, anchor));
		}
	}

	export class OriginToAnchorOperator extends Operator {
		public constructor() {
			super(Operator.OriginToAnchor);
		}
		public execute(mesh: ProceduralMesh, anchor: THREE.Vector3): ProceduralMesh {
			return (super.executeOperation(mesh, { "anchor": anchor }));
		}
		public static Execute(mesh: ProceduralMesh, anchor: THREE.Vector3): ProceduralMesh {
			return (new OriginToAnchorOperator().execute(mesh, anchor));
		}
	}


	export class ApplyLookAtRotationOperator extends Operator {
		public constructor() {
			super(Operator.ApplyLookAtRotation);
		}
		public execute(mesh: ProceduralMesh, forward: THREE.Vector3, up: THREE.Vector3): ProceduralMesh {
			return (super.executeOperation(mesh, { "forward": forward, "up": up }));
		}
		public static Execute(mesh: ProceduralMesh, forward: THREE.Vector3, up: THREE.Vector3): ProceduralMesh {

			return (new ApplyLookAtRotationOperator().execute(mesh, forward, up));
		}
	}


}