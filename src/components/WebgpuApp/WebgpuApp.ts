export function createWebGLContext(glAttribs?) {
    glAttribs = glAttribs || { alpha: false };

    let webglCanvas = document.createElement('canvas');

    let contextTypes = glAttribs.webgl2 ? ['webgl2'] : ['webgl', 'experimental-webgl'];
    let context = null;

    for (let contextType of contextTypes) {
        context = webglCanvas.getContext(contextType, glAttribs);
        if (context) {
            break;
        }
    }

    if (!context) {
        let webglType = (glAttribs.webgl2 ? 'WebGL 2' : 'WebGL');
        console.error('This browser does not support ' + webglType + '.');
        return null;
    }

    return context;
}
export var GL: WebGL2RenderingContext = createWebGLContext({});


//@ts-ignore
import { XRHandedness, XRRigidTransform, XRSession, XRViewerPose, XRVisibilityState } from 'webxr';
//@ts-ignore
import { XRFrame } from 'webxr';

// If requested, use the polyfill to provide support for mobile devices
// and devices which only support WebVR.
import { QueryArgs } from './util/query-args';

import { WebgpuMain } from './Lucid3D/WebgpuMain';
declare class XRWebGLLayer {
    constructor(session: XRSession, gl: WebGL2RenderingContext);

}
// If requested, don't display the frame rate info.
let hideStats = QueryArgs.getBool('hideStats', false);

// XR globals.
let xrButton = null;
let xrImmersiveRefSpace = null;
let inlineViewerHelper = null;

// WebGL scene globals.
let gl: WebGL2RenderingContext = null;

let floorSize = 10;
let floorPosition = [0, -floorSize / 2 + 0.01, 0];

const BOX_SIZE = 0.03;
const BOX_MOTION_RANGE = 0.010;
const BOX_SEPARATION = 0.04;
const BOX_SET_HEIGHT = 0.03;
const BOX_SET_DEPTH = -0.06;
var inited = false;

export function initWebgpuTest()
{
    
    let webgpuCanvas = document.createElement('canvas');
    webgpuCanvas.style.width = "" + window.innerWidth + "px";
    webgpuCanvas.style.height = "" + window.innerHeight + "px";
    
    document.body.appendChild(webgpuCanvas);
    let wgpu = new WebgpuMain(webgpuCanvas);
    let lastTime = 0;
    let frame = (time) => {
        let dt = time - lastTime;
        dt *= 0.001;

        lastTime = time;
        if (wgpu.isReady && lastTime != 0)
        {
            wgpu.frame(dt);
        }
        requestAnimationFrame(frame);
    };
    requestAnimationFrame(frame);
//    let wgpuApp = new WebgpuApp(webgpuCanvas);
    


}