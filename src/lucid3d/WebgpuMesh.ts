
import { AbstractGeomBase } from "./WebgpuGeom";
import { WebgpuSkin } from "./WebgpuSkin";

export class AbstractMaterial
{

}

export class AbstractMeshGroup {
    skin: WebgpuSkin;

	clone(): AbstractMeshGroup {
		return (new AbstractMeshGroup(this.primitives.slice()));
	}
	primitives: AbstractMeshBase[];
	constructor(primitives: AbstractMeshBase[] = []) {
		this.primitives = primitives;
	}
}

// pour l'instant virer cette classe transform, mettre tout dans mesh base, 
// et ensuite on verra eventuellement pour une foncitonnalité du genre GetComponent(Transform)
// le pb c'est que la du coup ça crée des soucis faudrait que transform soit ce qui est stoqué dans la hierarchie sinon.
// ou au minimum c'est lui qui a les childs mais pareil ça pose des soucis faudra récupérer les meshs donc circular dependency pas top.

export class AbstractMeshBase {

	name: string = "";


	material: AbstractMaterial;
	geometry: AbstractGeomBase;


	constructor(geometry?: AbstractGeomBase, material?: AbstractMaterial) {
		this.geometry = geometry;
		this.material = material;
	}
}

export abstract class AbstractAbstractMesh<G extends AbstractGeomBase, M extends AbstractMaterial, O> extends AbstractMeshBase {
	protected options: O;

	abstract Initialize();
	declare material: M;
	declare geometry: G;
	constructor(options?: O, geometry?: G, material?: M) {
		super(geometry, material);
		this.options = options;
		this.Initialize();
	}
}
export class AbstractMesh<G extends AbstractGeomBase, M extends AbstractMaterial> extends AbstractMeshBase {
	Initialize() {

	}
	declare material: M;
	declare geometry: G;
	constructor(geometry?: G, material?: M) {
		super(geometry, material);
	}

}