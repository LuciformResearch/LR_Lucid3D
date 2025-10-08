// Compatibility shim so imports like '../../WebgpuApp' from within the library
// still resolve after moving Lucid3D into src/lucid3d/.
export { GL } from '../components/WebgpuApp/WebgpuApp';
