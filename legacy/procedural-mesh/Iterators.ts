module GAME
{
	export enum IteratorType {
		Quad = 0,
		Point = 1,
		Primitive = 2,
		Detail = 3
	}
	export type QuadIterator = ((data: ProceduralMesh, accessor: QuadAccessor) => void);
	export type PointIterator = ((data: ProceduralMesh, accessor: PointAccessor) => void);
	export type PrimitiveIterator = ((data: ProceduralMesh, accessor: PrimitiveAccessor) => void);
	export type DetailIterator = ((data: ProceduralMesh) => void);
	export type ProceduralMeshNodeIterator = QuadIterator | PointIterator | PrimitiveIterator | DetailIterator;
	export class IteratorInfo {
		public type: IteratorType;
		public iterator: ProceduralMeshNodeIterator;
		public constructor(type: IteratorType, iterator: ProceduralMeshNodeIterator) {
			this.type = type;
			this.iterator = iterator;
		}
		public clone(): IteratorInfo {
			return (new IteratorInfo(this.type, this.iterator));
		}
	}




	export type QuadCondition = ((data: ProceduralMesh, accessor: QuadAccessor) => boolean);
	export type PointCondition = ((data: ProceduralMesh, accessor: PointAccessor) => boolean);
	export type PrimitiveCondition = ((data: ProceduralMesh, accessor: PrimitiveAccessor) => boolean);
	export type DetailCondition = ((data: ProceduralMesh) => boolean);
	export type ProceduralMeshNodeCondition = QuadCondition | PointCondition | PrimitiveCondition | DetailCondition;
}