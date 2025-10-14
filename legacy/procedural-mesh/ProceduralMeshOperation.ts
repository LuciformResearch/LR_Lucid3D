module GAME
{

	export class ProceduralMeshOperation {
		public static MergeOperations(...args: ProceduralMeshOperation[]): ProceduralMeshOperation {
			var res = new ProceduralMeshOperation();
			res.iterators = [];
			
			for (var i = 0; i < args.length; i++) {
				
					for (var j = 0; j < args[i].iterators.length; j++) {
						res.iterators.push(args[i].iterators[j].clone());
					}
					//res.iterators.concat(args[i].clone().iterators);
				var keys = Object.keys(args[i].parameters);
				for (var j = 0; j < keys.length; j++)
				{
					res.setparameter(keys[j], args[i].parameter(keys[j]));
				}
			}
		
			return (res);
		}
		public parameters: { [id: string]: CustomData; } = {};
		public parameter<T extends Data>(attributeName: string): T {
			if (this.parameters[attributeName] == undefined) {
				this.parameters[attributeName] = new CustomData(attributeName, 0);
			}
			return (this.parameters[attributeName].value as T);
		}
		public setparameter<T>(attributeName: string, value: Data) {
			this.parameters[attributeName] = new CustomData(attributeName, value);
		}
		public iterators: IteratorInfo[] = [];
		public in: ProceduralMesh;
		public out: ProceduralMesh;
		public execute(): void {
			var keys = Object.keys(this.parameters);

			var current: ProceduralMesh = this.in;
			for (var i = 0; i < this.iterators.length; i++) {
				current.parameters = this.parameters;

				
				var key: IteratorType = this.iterators[i].type;
				if (key == IteratorType.Detail) {

					current = current.IterateDetail(this.iterators[i].iterator as DetailIterator);
				}
				else if (key == IteratorType.Point) {
					current = current.IteratePoints(this.iterators[i].iterator as PointIterator);
				}
				else if (key == IteratorType.Primitive) {
					current = current.IteratePrimitives(this.iterators[i].iterator as PrimitiveIterator);
				}
				else if (key == IteratorType.Quad) {
					current = current.IterateQuads(this.iterators[i].iterator as QuadIterator);
				}
			}
			this.out = current;
		}
		public addIterator(type: IteratorType, iterator: ProceduralMeshNodeIterator) {

			this.iterators.push(new IteratorInfo(type, iterator));
		}
		public clone(): ProceduralMeshOperation {
			var res: ProceduralMeshOperation = new ProceduralMeshOperation();
			for (var i = 0; i < this.iterators.length; i++) {
				res.iterators.push(this.iterators[i].clone());
			}
			return (res);
		}
	}
}