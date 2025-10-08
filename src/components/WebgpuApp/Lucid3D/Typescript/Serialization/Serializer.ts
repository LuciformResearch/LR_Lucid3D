import { UniqueIDHelper } from "../UniqueIDHelper";


export interface ICustomSerializer {
	Serialize(blob: SerializationBlob): void;
	Deserialize(blob: SerializationBlob): void;
}
export interface ICustomPropertiesSerializer {
	GetSerializedProperties(): string[];
}
export interface ISerializable {

}
export interface ISerializationInitializable {
	OnAfterDeserialization();
}
export interface SerializationBlob {
	subBlob?: string;
	typeName: string,
	typedProperties: { [index: string]: {} },
	typeHierarchy: string[],
	serializedObjects: { [index: string]: string };
	customSerializedObjects?: { [index: string]: any };
}

export enum ReferenceType {
	SpecifiedByObject,
	Clone,
	SerializedReference,
	RuntimeReference,
}
export class Serializer {
	static GlobalDeserializationVariables: { [index: string]: any } = {};
	static ReferenceTypes: { [index: string]: boolean } = {};
	static RegisterSerializable(classConstructor: Function, serializeAsReference: boolean = true, propertyNames: string[] = [], setClassAsSerializable: boolean = true): void {
		var current = classConstructor as any;
		var typedProperties: { [index: string]: {} };
		if (setClassAsSerializable) {
			Serializable(classConstructor);
		}
		var protoName: string = current.name;
		if (this.PropertiesByType[protoName] == undefined) {
			this.PropertiesByType[protoName] = {};
			this.ClassByType[protoName] = current;
		}
		if (serializeAsReference && this.ReferenceTypes[protoName] == undefined) {
			this.ReferenceTypes[protoName] = true;
		}
		for (var i = 0; i < propertyNames.length; i++) {
			this.PropertiesByType[protoName][propertyNames[i]] = true;
		}
		while (current != undefined) {
			protoName = current.name;
			if (protoName == "Object") {
				return;
			}
			if (this.PropertiesByType[protoName] == undefined) {
				this.PropertiesByType[protoName] = {};
				this.ClassByType[protoName] = current;
			}
			current = (current as any).prototype;
			if (current != undefined) {
				current = (current as any).__proto__;
				if (current != undefined) {
					current = (current as any).constructor;
				}
			}
		}
	}
	static PropertiesByType: { [index: number]: { [index: string]: ReferenceType } } = {};
	static ConstructorByType: { [index: string]: () => any } = {};
	static ClassByType: { [index: string]: any } = {};
	static GetSerializedProperty(name: string, object: ISerializable, protoName: string) {
		var key = name;
		var ok: boolean = false;
		if (((object as any)[key]) != undefined) {
			var property: ReferenceType = ReferenceType.SerializedReference;
			if (this.PropertiesByType[protoName] != undefined) {
				property = this.PropertiesByType[protoName][key];
			}
			var name00 = ((object as any)[key]).constructor.name;
			console.error("CONSTRUCTOR NAME:" + name00);
			if (this.ConstructorByType[name00] != undefined) {
				if (this.ReferenceTypes[name00] == true && property != ReferenceType.Clone) {
					var ref = this.GetReference((object as any)[key]);
					return ({ value: ref.idOnly(), __serializedReference__: true });
				}
				else {
					return ({ value: this.SerializeObject((object as any)[key], false), __serializedObject__: true, });
				}
				ok = true;
			}

			if ((object as any)[key].constructor == Object) {

				var ref = this.GetReference((object as any)[key]);
				return ({ value: ref.idOnly(), __serializedReference__: true });
				ok = true;
			}
			else if ((object as any)[key] instanceof Array) {

				var ref = this.GetReference((object as any)[key]);
				return ({ value: ref.idOnly(), __serializedReference__: true });
			}

		}
		if (!ok) {
			if (typeof ((object as any)[key]) === "string" || typeof ((object as any)[key]) === "number" || (object as any)[key] == undefined) {
				return ((object as any)[key]);
			}
			else {
				var name00 = ((object as any)[key]).constructor.name;
				if (this.ConstructorByType[name00] == undefined) {
					Serializable(((object as any)[key]).constructor);
					//					this.ConstructorByType[name00] = ((object as any)[key]).constructor;
				}
				console.error("TYPE.... " + typeof object);
				console.error("OBJECT:" + JSON.stringify(object));
				var ref = this.GetReference((object as any)[key]);
				return ({ value: ref.idOnly(), __serializedReference__: true });
				ok = true;
			}
		}
	}
	static GetSerializedProperties(properties: string[], object: ISerializable, protoName: string, existingProperties: {} = undefined): {} {
		var res = {};


		for (var i = 0; i < properties.length; i++) {
			var key = properties[i];
			if (existingProperties == undefined || existingProperties[keys[i]] == undefined) {
				res[key] = this.GetSerializedProperty(key, object, protoName);
			}
		}
		if (existingProperties != undefined) {
			var keys = Object.keys(existingProperties);

			for (var i = 0; i < keys.length; i++) {
				res[keys[i]] = existingProperties[keys[i]];
			}
		}
		return (res);
	}
	private static _ReferenceCount = 0;
	private static _ReferenceByID: { [index: string]: SerializedObjectReference } = {};
	private static ClearReferences() {
		this._ReferenceCount = 0;
		var keys = Object.keys(this._ReferenceByID);
		this._ReferenceByID = {};
	}
	private static GetReference(obj: Object): SerializedObjectReference {
		var id = UniqueIDHelper.GetUUID(obj);
		if (obj != undefined && this._ReferenceByID[id] == undefined) {
			this._ReferenceByID[id] = new SerializedObjectReference({ id: id, jsObject: undefined, serializedObject: undefined });
			var serialized = this.GetSerializedObject(obj, false);
			this._ReferenceByID[id].serializedObject = serialized;
		}
		return (this._ReferenceByID[id]);
	}
	static Reset() {
		this.ClearReferences();
	}

	static AddPropertiesToBlob(blob: SerializationBlob, obj: ISerializable, propertyNames: string[]) {
		var protoName = blob.typeName;
		blob.typedProperties[protoName] = this.GetSerializedProperties(propertyNames, obj, protoName);
	}
	static InitializeBlob(blob: SerializationBlob, obj: ISerializable) {
		var current = obj.constructor;
		var typedProperties: { [index: string]: {} } = {};
		var typeName: string = current.name;
		var typeHierarchy: string[] = [];
		typeHierarchy.push(typeName);
		blob.customSerializedObjects = {};
		blob.typeName = typeName;
		blob.typedProperties = typedProperties;
		blob.typeHierarchy = typeHierarchy;

	}
	static GetSerializedObject(obj: ISerializable, packageRoot: boolean = true): SerializationBlob {

		if (packageRoot) {
			this.Reset();
		}
		var current = obj.constructor;
		var typedProperties: { [index: string]: {} } = {};
		var typeName: string = current.name;
		var typeHierarchy: string[] = [];
		var blob: SerializationBlob = <SerializationBlob>{ typeName: typeName, typedProperties: typedProperties, typeHierarchy: typeHierarchy, serializedObjects: undefined };
		if (obj instanceof Array) {

			typeName = "__Array__";
			protoName = typeName;
			typedProperties[typeName] = [];
			typeHierarchy = [typeName];

			var arr = typedProperties[typeName] as Array<any>;
			for (var i = 0; i < obj.length; i++) {
				arr.push(this.GetSerializedProperty("" + i, obj, typeName));
			}
		}
		else if (obj.constructor == Object) {

			typeName = "__Object__";
			protoName = typeName;
			typeHierarchy = [typeName];
			var keys = Object.keys(obj);
			typedProperties[typeName] = this.GetSerializedProperties(keys, obj, protoName);
		}
		else {
			while (current != undefined) {
				var protoName = current.name;
				if (obj["Serialize"] != undefined) {
					this.InitializeBlob(blob, obj);
					obj["Serialize"](blob);
					blob.subBlob = JSON.stringify(this.GetSerializedObject(blob.customSerializedObjects, false));
					blob.customSerializedObjects = undefined;
				}
				if (obj["GetSerializedProperties"] != undefined) {
					typedProperties[protoName] = this.GetSerializedProperties(obj["GetSerializedProperties"](), obj, protoName, blob.typedProperties[protoName]);
					typeHierarchy.push(protoName);
				}
				if (this.PropertiesByType[protoName] != undefined) {
					var keys = Object.keys(this.PropertiesByType[protoName]);

					typedProperties[protoName] = this.GetSerializedProperties(keys, obj, protoName, blob.typedProperties[protoName]);
					typeHierarchy.push(protoName);
				}


				var keys = Object.keys(current);
				current = (current as any).prototype;
				if (current != undefined) {
					current = (current as any).__proto__;
					if (current != undefined) {
						current = (current as any).constructor;
					}
				}
			}
			typeHierarchy.reverse();
		}

		var serializedObjects: { [index: string]: string } = undefined;
		if (packageRoot) {
			serializedObjects = {};
			var keys = Object.keys(this._ReferenceByID);
			for (var i = 0; i < keys.length; i++) {

				var ref: SerializedObjectReference = this._ReferenceByID[keys[i]];
				var serialized = ref.serializedObject;
				var id = ref.id;
				serializedObjects[id] = JSON.stringify(serialized);
			}
			// also serialize references.
			// on met leur jsObject a undefined avant la sérialisation.


			// a la serialization,
			// on appelle OnBeforeSerialize(object: Object)
			// on sérialize,
			// on appelle OnAfterSerialize(blob: SerializationBlob)


			// a la deserialization on reconstruit (les references uniquement, en leur mettant uniquement leurs valeurs non references) de ces jsObject avant d'aller plus loin.
			// on appelle apres creer les objets, avant de mettre leurs valeurs, OnBeforeDeserialize.
			// ensuite on repasse dessus, on leur assigne aussi leurs valeurs references.


			// ensuite on passe partout ailleurs, on assigne les valeurs references ou pas.
			// on appelle apres creer les objets, avant de mettre leurs valeurs, OnBeforeDeserialize(object: Object).

			// ensuite on passe sur les truc serializeCustom, et/ou les serializedProperty

			// ensuite on passe sur une eventuelle override de OnAfterDeserialize(object: Object, blob: SerializationBlob).
		}
		if (packageRoot) {
			var keys = Object.keys(serializedObjects);
		}
		blob.typeName = typeName;
		blob.typedProperties = typedProperties;
		blob.typeHierarchy = typeHierarchy;
		blob.serializedObjects = serializedObjects;
		return (blob);
	}

	static SerializeObject(obj: ISerializable, packageRoot: boolean = true): string {
		if (packageRoot) {
			return (JSON.stringify(this.GetSerializedObject([obj], packageRoot)));
		}
		else {
			return (JSON.stringify(this.GetSerializedObject(obj, packageRoot)));
		}
		//this.GetReference(obj);

	}

	static SetSerializedProperty(obj: any, key: string, serializedProperties: any) {
		var ok: boolean = false;
		if (serializedProperties[key] != undefined) {
			if (serializedProperties[key].__serializedObject__ != undefined) {
				if (serializedProperties[key].value != undefined) {
					obj[key] = this.DeserializeObject(serializedProperties[key].value, false);
				}
				else {
					obj[key] = undefined;
				}
				ok = true;
			}
			else if (serializedProperties[key].__serializedReference__ != undefined) {
				var ref = serializedProperties[key].value as SerializedObjectReference;
				var id = ref.id;
				if (this.RestoredObjects[id] == undefined) {
					this.NeededObjects.push({ object: obj, idNeeded: id, propertyName: "" + key });
				}
				else {
					obj[key] = this.RestoredObjects[id].jsObject;
				}
				ok = true;
			}
		}
		if (!ok) {
			obj[key] = serializedProperties[key];
		}
	}


	static SetSerializedProperties(obj: any, serializedProperties: any) {
		var initializable = obj as ISerializationInitializable;
		if (initializable.OnAfterDeserialization != undefined) {
			this.InitializableObjects.push(initializable);
		}

		if (obj instanceof Array) {
			for (var i = 0; i < serializedProperties.length; i++) {
				var key = "" + i;
				this.SetSerializedProperty(obj, key, serializedProperties);
			}
		}
		else {
			var keys = Object.keys(serializedProperties);

			for (var i = 0; i < keys.length; i++) {
				var key = keys[i];
				this.SetSerializedProperty(obj, key, serializedProperties);
			}
		}
	}
	static InitializableObjects: ISerializationInitializable[] = [];
	static NeededObjects: { object: Object, idNeeded: string, propertyName: string }[];
	static RestoredObjects: { [index: string]: SerializedObjectReference } = {};
	static NeedsDeserialize: { object: Object, blob: SerializationBlob }[] = [];
	static NeedsAfterDeserialize: { object: Object, blob: SerializationBlob }[] = [];
	static DeserializeObject<T>(stringified: string, root: boolean = true): T {
		if (root) {
			this.RestoredObjects = {};
			this.NeededObjects = [];
			this.InitializableObjects = [];
		}
		var res: T = undefined;
		var deserialized = JSON.parse(stringified) as SerializationBlob;
		var typeName = deserialized.typeName;
		if (deserialized.subBlob != undefined) {


			//
			deserialized.customSerializedObjects = this.DeserializeObject(deserialized.subBlob, false) as {};
			//var j = 0;
		}

		if (typeName == "__Object__") {
			res = {} as any;
		}
		else if (typeName == "__Array__") {
			res = [] as any;
		}
		else {
			if (this.ConstructorByType[typeName] == undefined) {
				console.error("constructor undefined: " + typeName);
			}
			res = this.ConstructorByType[typeName]() as T;
		}
		if (res["Deserialize"] != undefined) {
			console.error("NEEDS DESERIALIZE..." + typeName);
			this.NeedsDeserialize.push({ object: res, blob: deserialized });

		}
		if (res["AfterDeserialize"] != undefined) {
			this.NeedsAfterDeserialize.push({ object: res, blob: deserialized });
		}
		var keys = deserialized.typeHierarchy;
		for (var i = 0; i < keys.length; i++) {
			this.SetSerializedProperties(res, deserialized.typedProperties[keys[i]]);
		}
		if (root) {
			var objs = deserialized.serializedObjects;
			var keys = Object.keys(objs);
			for (var i = 0; i < keys.length; i++) {
				var id = keys[i];
				var serializedString = deserialized.serializedObjects[id];
				var obj = this.DeserializeObject(serializedString, false);
				var ref = new SerializedObjectReference({ id: id, jsObject: obj, serializedObject: undefined });
				this.RestoredObjects[id] = ref;
			}

			while (this.NeededObjects.length > 0) {
				var first = this.NeededObjects.splice(0, 1)[0];
				first.object[first.propertyName] = this.RestoredObjects[first.idNeeded].jsObject;
			}
			for (var i = 0; i < this.NeedsDeserialize.length; i++) {
				this.NeedsDeserialize[i].object["Deserialize"](this.NeedsDeserialize[i].blob);
			}
			this.NeedsDeserialize = [];
			for (var i = 0; i < this.NeedsAfterDeserialize.length; i++) {
				this.NeedsAfterDeserialize[i].object["AfterDeserialize"](this.NeedsAfterDeserialize[i].blob);
			}
			this.NeedsAfterDeserialize = [];
			for (var i = 0; i < this.InitializableObjects.length; i++) {
				this.InitializableObjects[i].OnAfterDeserialization();
			}

		}

		if (root) {
			return (res[0]);
		}
		return (res);
	}
}

export function serialize(options?: any): (proto: Object, propertyName: string) => void {
	return ((proto, propertyName) => {
		var a = propertyName;
		var current = proto.constructor;
		var protoName = current.name;

		if (Serializer.PropertiesByType[protoName] == undefined) {
			Serializer.RegisterSerializable(current);
		}
		if (Serializer.PropertiesByType[protoName][propertyName] == undefined) {


			Serializer.PropertiesByType[protoName][propertyName] = ReferenceType.SpecifiedByObject;
		}
	});
}

export function runtimeReference(options?: any): (proto: Object, propertyName: string) => void {
	return ((proto, propertyName) => {
		var a = propertyName;
		var current = proto.constructor;
		var protoName = current.name;
		if (Serializer.PropertiesByType[protoName] == undefined) {
			Serializer.RegisterSerializable(current);
		}
		Serializer.PropertiesByType[protoName][propertyName] = ReferenceType.RuntimeReference;
	});
}

export function reference(options?: any): (proto: Object, propertyName: string) => void {
	return ((proto, propertyName) => {
		var a = propertyName;
		var current = proto.constructor;
		var protoName = current.name;
		if (Serializer.PropertiesByType[protoName] == undefined) {
			Serializer.RegisterSerializable(current);
		}

		Serializer.PropertiesByType[protoName][propertyName] = ReferenceType.SerializedReference;

	});
}
export function noReference(options?: any): (proto: Object, propertyName: string) => void {
	return ((proto, propertyName) => {
		var a = propertyName;
		var current = proto.constructor;
		var protoName = current.name;
		if (Serializer.PropertiesByType[protoName] == undefined) {
			Serializer.RegisterSerializable(current);
		}

		Serializer.PropertiesByType[protoName][propertyName] = ReferenceType.Clone;
	});
}

export function Serializable(constructor: Function) {
	Serializer.ConstructorByType[constructor.name] = function () { return (new (constructor as any)) };
}
export function Referencable(constructor: Function) {
	Serializer.ReferenceTypes[constructor.name] = true;
}

export function NonReferencable(constructor: Function) {
	Serializer.ReferenceTypes[constructor.name] = false;
}

@Serializable
export class SerializedObjectReference {
	idOnly(): SerializedObjectReference {
		return (new SerializedObjectReference({ id: this.id }));
	}
	@serialize()
	id: string;

	jsObject: Object;
	serializedObject: SerializationBlob;


	constructor(init: Partial<SerializedObjectReference>) {
		Object.assign(this, init);

	}
}