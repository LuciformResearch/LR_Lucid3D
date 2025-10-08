
import { TEST_ANIMATION_TIME } from "../AppSetup";
import { WebgpuAnimationChannel } from "./WebgpuAnimationChannel";
export class WebgpuAnimation
{
  maxTime: number = 0;
  currentTime: number = 0;
  constructor(public channels: WebgpuAnimationChannel[] = [])
  {
    if (this.maxTime == 0) {
      for (let i = 0; i < this.channels.length; ++i) {
          const channel = this.channels[i];
          this.maxTime = Math.max(this.maxTime, channel.sampler.maxTime);
      }
  }
  }
  playing: boolean = true;
  OnUpdate(deltaTime: number)
  {
    if (this.playing)
    {
      let time = this.currentTime;
      if (TEST_ANIMATION_TIME != undefined)
      {
        time = TEST_ANIMATION_TIME;
      }
      for (let i = 0; i < this.channels.length; i++)
      {
        let tr = this.channels[i].boneTransform;
        //tr.position.set(0, 6.05999, 0);
        //let test = tr.GetWorldPosition();
        //console.log("TEST: " + test);
        // debugger;
        this.channels[i].sampler.ApplyToTransform(tr, time);
        
      }
      this.currentTime += deltaTime;
      this.currentTime %= this.maxTime;
      //debugger;
    }
  }
	Play()
  {
    this.playing = true;
  }
  Pause()
  {
    this.playing = false;
  }
  Stop()
  {
    // stop and reset.
    this.currentTime = 0;
    this.OnUpdate(0);
    this.playing = false;
  }
}
/*
"animations": [
    { // une animation....
        // il y a plusieurs samplers, qui définissent des temps et des valeurs, par exemple pour des rotations ce sera des quaternions.
      "samplers" : [
        {
          "input" : 2, // un accesseur de timestamps, toujours >= 0, et qui vont par ordre croissant.
          "interpolation" : "LINEAR",
          "output" : 3 // un accesseur de valeurs (par exemple rotation ce sera des quaternion)
        }
      ],
      // plusieurs channels a animer, donc simplement par exemple la rotation pour la node 0, etc...
      // pourquoi plusieurs channel, parceque plusieurs os, et des fois des os qui bougent en plus de tourner etc...
      // un channel par mouvement, d'un os.
      "channels" : [ {
        "sampler" : 0,
        "target" : {
          "node" : 0,
          "path" : "rotation"
        }
      } ]
    }
  ],
    
    */
