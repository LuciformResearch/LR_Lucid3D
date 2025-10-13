import { MaterialDesc } from './MaterialDesc';
import { MaterialFactory, ForwardPBRMaterial } from './MaterialFactory';

export class MaterialFactory2 {
  static buildForward(device: GPUDevice, format: GPUTextureFormat, desc: MaterialDesc): ForwardPBRMaterial {
    return MaterialFactory.buildForward(device, format, desc);
  }
}
