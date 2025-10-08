///<reference path="./Serializer.ts"/>

import {Quaternion} from "../../Math/Quaternion";
import {Vector3} from "../../Math/Vector3";
import { Serializer } from "./Serializer";


Serializer.RegisterSerializable(Vector3, false, ["x", "y", "z"], true);
Serializer.RegisterSerializable(Quaternion, false, ["x", "y", "z", "w"], true);
