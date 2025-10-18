
import { input, KeyCode, MouseButton } from "./Input";
import { MathHelper } from "./Math/MathHelper";
import { Matrix4 } from "./Math/Matrix4";
import { Quaternion } from "./Math/Quaternion";
import { Vector3 } from "./Math/Vector3";
import { WebgpuTransform } from "./WebgpuTransform";

export abstract class WebgpuCamera extends WebgpuTransform
{
    constructor()
    {
        super();

    }
    abstract get projectionMatrix(): Matrix4;
    abstract get projectionMatrixInverse(): Matrix4;
}

export class WebgpuPerspectiveCamera extends WebgpuCamera
{
    videoGameStyle = false;
    private _needUpdate: boolean = true;
    private updateProjMat()
    {
        const near = this.near;
		let top = near * Math.tan( MathHelper.Deg2Rad * 0.5 * this.fov ) / this.zoom;
		let height = 2 * top;
		let width = this.aspectRatio * height;
		let left = - 0.5 * width;
		/*const view = this.view;

		if ( this.view !== null && this.view.enabled ) {

			const fullWidth = view.fullWidth,
				fullHeight = view.fullHeight;

			left += view.offsetX * width / fullWidth;
			top -= view.offsetY * height / fullHeight;
			width *= view.width / fullWidth;
			height *= view.height / fullHeight;

		}*/

		//const skew = this.filmOffset;
		//if ( skew !== 0 ) left += near * skew / this.getFilmWidth();

		this._projectionMatrix.makePerspective( left, left + width, top, top - height, near, this.far );

		this._projectionMatrixInverse.copy( this._projectionMatrix ).invert();
        this._needUpdate = false;
    }

    private _projectionMatrixInverse: Matrix4 = new Matrix4();
    public get projectionMatrixInverse(): Matrix4
    {
        if (this._needUpdate)
        {
            this.updateProjMat();
        }
        return (this._projectionMatrixInverse);
    }


    private _projectionMatrix: Matrix4 = new Matrix4();
    public get projectionMatrix(): Matrix4
    {
        if (this._needUpdate)
        {
            this.updateProjMat();
        }
        return (this._projectionMatrix);
    }

    private _zoom: number = 1.0;
    public get zoom(): number
    {
        return (this._zoom);
    }
    public set zoom(value: number)
    {
        this._zoom = value;
        this._needUpdate = true;
    }
    private _fov: number;
    public get fov(): number
    {
        return (this._fov);
    }
    public set fov(value: number)
    {
        this._fov = value;
        this._needUpdate = true;
    }

    private _aspectRatio: number;
    public get aspectRatio(): number
    {
        return (this._aspectRatio);
    }
    public set aspectRatio(value: number)
    {
        this._aspectRatio = value;
        this._needUpdate = true;
    }

    private _near: number;
    public get near(): number
    {
        return (this._near);
    }
    public set near(value: number)
    {
        this._near = value;
        this._needUpdate = true;
    }

    private _far: number;
    public get far(): number
    {
        return (this._far);
    }
    public set far(value: number)
    {
        this._far = value;
        this._needUpdate = true;
    }
    constructor(fov: number = 50, aspectRatio: number = 1, near: number = 0.1, far: number = 2000)
    {
        super();
        this._near = near;
        this._far = far;
        this._fov = fov;
        this._aspectRatio = aspectRatio;
    }
    // aspect, far, near, focus, fov

}

export class WebgpuFlyControls
{
    camera: WebgpuCamera;
    yaw: number = 0;
    pitch: number = 0;
    viewSensivity: number = 0.0025;
    //minSpeed: number = 1.0;
    //maxSpeed: number = 20.0;
    
    moveSpeed: number = 5.0;
    pitchMinAngle: number = -Math.PI * 0.5;
    pitchMaxAngle: number = Math.PI * 0.5;
    needUpdate: boolean = false;
    position: Vector3 = new Vector3();
    direction: Vector3 = new Vector3();
    UpdateYawPitch(deltaTime: number)
    {
        let quatY = new Quaternion().setFromAxisAngle(new Vector3(1, 0, 0), this.pitch);
        let quatX = new Quaternion().setFromAxisAngle(new Vector3(0, 1, 0), this.yaw);
        quatY.premultiply(quatX);
        this.camera.quaternion.copy(quatY);
    }
    UpdateTranslation(deltaTime: number)
    {   
        let useY = false;
        if (input.IsDown(KeyCode.shift))
        {
            useY = true;
        }
        let globalDirection: Vector3 = new Vector3(0, 0, 0);
        if (input.IsDown(KeyCode.r) || input.IsDown(KeyCode.spacebar) || input.IsDown(KeyCode.e))
        {
            globalDirection.y += 1.0;
            useY = false;
        }
        if (input.IsDown(KeyCode.ctrl) || input.IsDown(KeyCode.c))
        {
            globalDirection.y -= 1.0;
            useY = false;
        }

        if (input.IsDown(KeyCode.z) || input.IsDown(KeyCode.w))
        {
            if (!useY)
            {
                this.direction.z = -1.0;
            }
            else
            {
                this.direction.y = 1.0;
            }
        }
        if (input.IsDown(KeyCode.s))
        {
            if (!useY)
            {
                this.direction.z = 1.0;
            }
            else
            {
                this.direction.y = -1.0;
            }
        }
        if (input.IsDown(KeyCode.d))
        {
            this.direction.x = 1.0;
        }
        if (input.IsDown(KeyCode.q) || input.IsDown(KeyCode.a))
        {
            this.direction.x = -1.0;
        }
        let quaternion = this.camera.quaternion;
        let dir = this.direction.applyQuaternion(quaternion).normalize();
        if (globalDirection.lengthSq() > 0)
        {
            dir.add(globalDirection);
            dir.normalize();
        }
        this.camera.position.add(dir.multiplyScalar(deltaTime * this.moveSpeed));
        this.direction.setScalar(0);
        
    }
    constructor(camera: WebgpuCamera)
    {
        this.camera = camera;
        input.MouseMoveEvent.addListener(this, (args) => {
            if (input.IsMouseButtonDown(MouseButton.Left))
            {
            let dx = args.evt.movementX;
            let dy = args.evt.movementY;
            this.yaw += dx * this.viewSensivity;
            this.pitch += dy * this.viewSensivity;
            if (this.pitch < this.pitchMinAngle) {
            this.pitch = this.pitchMinAngle;
            }
            if (this.pitch > this.pitchMaxAngle) {
            this.pitch = this.pitchMaxAngle;
            }
            this.needUpdate = true;
            }
        });
        input.MouseWheelEvent.addListener(this, (args) => {
            this.moveSpeed *= (((args.wheelDelta / 120) * 0.1) + 1.0);
            if (this.moveSpeed < 0.005)
            {
                this.moveSpeed = 0.005;
            }
        });
    }
    Update(deltaTime: number)
    {
        if (this.needUpdate)
        {
            this.needUpdate = false;
            this.UpdateYawPitch(deltaTime);
            if (this.direction.lengthSq() > 0)
            {
                this.UpdateTranslation(deltaTime);
            }
        }
        this.UpdateTranslation(deltaTime);
    }
}
