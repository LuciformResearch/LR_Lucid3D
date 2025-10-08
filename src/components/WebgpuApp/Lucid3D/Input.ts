import { Delegate } from './Typescript/Delegate';
import { Vector2 } from './Math/Vector2';

export enum KeyState {
  Down,
  Pressed,
  Up,
  None
}
export enum MouseButton {
  Left = 0,
  Middle = 1,
  Right = 2
}
export enum KeyCode {
  backspace = 8,
  tab = 9,
  enter = 13,
  shift = 16,
  ctrl = 17,
  alt = 18,
  pause = 19,
  capslock = 20,
  escape = 27,
  spacebar = 32,
  pageup = 33,
  pagedown = 34,
  end = 35,
  home = 36,
  leftarrow = 37,
  uparrow = 38,
  rightarrow = 39,
  downarrow = 40,
  insert = 45,
  delete = 46,
  n0 = 48,
  n1 = 49,
  n2 = 50,
  n3 = 51,
  n4 = 52,
  n5 = 53,
  n6 = 54,
  n7 = 55,
  n8 = 56,
  n9 = 57,
  a = 65,
  b = 66,
  c = 67,
  d = 68,
  e = 69,
  f = 70,
  g = 71,
  h = 72,
  i = 73,
  j = 74,
  k = 75,
  l = 76,
  m = 77,
  n = 78,
  o = 79,
  p = 80,
  q = 81,
  r = 82,
  s = 83,
  t = 84,
  u = 85,
  v = 86,
  w = 87,
  x = 88,
  y = 89,
  z = 90,
  leftwindowkey = 91,
  rightwindowkey = 92,
  selectkey = 93,
  numpad0 = 96,
  numpad1 = 97,
  numpad2 = 98,
  numpad3 = 99,
  numpad4 = 100,
  numpad5 = 101,
  numpad6 = 102,
  numpad7 = 103,
  numpad8 = 104,
  numpad9 = 105,
  multiply = 106,
  add = 107,
  subtract = 109,
  decimalpoint = 110,
  divide = 111,
  f1 = 112,
  f2 = 113,
  f3 = 114,
  f4 = 115,
  f5 = 116,
  f6 = 117,
  f7 = 118,
  f8 = 119,
  f9 = 120,
  f10 = 121,
  f11 = 122,
  f12 = 123,
  numlock = 144,
  scrolllock = 145,
  semicolon = 186,
  equalsign = 187,
  comma = 188,
  dash = 189,
  period = 190,
  forwardslash = 191,
  graveaccent = 192,
  openbracket = 219,
  backslash = 220,
  closebraket = 221,
  singlequote = 222
}
export class KeyStateChangedDelegate extends Delegate<{
  keyCode: KeyCode;
  keyState: KeyState;
}> {}

export class MouseKeyStateChangedDelegate extends Delegate<{
  mouseButton: MouseButton;
  keyState: KeyState;
  position: Vector2;
}> {}
export class KeyDownDelegate extends Delegate<{ keyCode: KeyCode }> {}
export class KeyPressedDelegate extends Delegate<{ keyCode: KeyCode }> {}
export class KeyUpDelegate extends Delegate<{ keyCode: KeyCode }> {}
export class MouseDownDelegate extends Delegate<{
  evt: MouseEvent;
  mousePosition: Vector2;
}> {}
export class MouseUpDelegate extends Delegate<{
  evt: MouseEvent;
  mousePosition: Vector2;
}> {}
export class MouseMoveDelegate extends Delegate<{
  evt: MouseEvent;
  mousePosition: Vector2;
}> {}
export class MouseWheelDelegate extends Delegate<{
  evt: MouseEvent;
  mousePosition: Vector2;
  wheelDelta: number;
}> {}
export class Input {
  windowMousePosition: Vector2 = Vector2.Zero;
  GetNumbersDown(): number[] {
    const res = [];
    for (let i = 0; i <= 9; i++) {
      if (input.IsDown(KeyCode['numpad' + i])) {
        res.push(i);
        //return (true);
      }
    }
    return res;
  }
  GetNumberDown(): number {
    const numbers = this.GetNumbersDown();
    return numbers.length > 0 ? numbers[0] : undefined;
  }
  readingInputNumberListeners: {
    onChange: (value: number) => void;
    onComplete: (value: number) => void;
    onCancel: (value: number) => void;
    value: string;
  }[] = [];
  readingInputNumber = false;
  ReadInputNumber(
    onChange: (value: number) => void,
    onComplete: (value: number) => void,
    onCancel: (value: number) => void
  ): {
    onChange: (value: number) => void;
    onComplete: (value: number) => void;
    onCancel: (value: number) => void;
    value: string;
  } {
    this.readingInputNumber = true;
    const val = {
      onChange: onChange,
      onCancel: onCancel,
      onComplete: onComplete,
      value: ''
    };
    this.readingInputNumberListeners.push(val);
    return val;
  }
  IsNumberDown(): boolean {
    for (let i = 0; i <= 9; i++) {
      if (input.IsDown(KeyCode['numpad' + i])) {
        return true;
      }
    }
    return false;
  }

  private _mouseWheelEvent: MouseWheelDelegate = undefined;
  isMouseJustDown: boolean;
  public get MouseWheelEvent(): MouseWheelDelegate {
    if (this._mouseWheelEvent == undefined) {
      this._mouseWheelEvent = new MouseWheelDelegate();
    }
    return this._mouseWheelEvent;
  }
  private _mouseDownEvent: MouseDownDelegate = undefined;
  public get MouseDownEvent(): MouseDownDelegate {
    if (this._mouseDownEvent == undefined) {
      this._mouseDownEvent = new MouseDownDelegate();
    }
    return this._mouseDownEvent;
  }
  private _mouseUpEvent: MouseUpDelegate = undefined;
  public get MouseUpEvent(): MouseUpDelegate {
    if (this._mouseUpEvent == undefined) {
      this._mouseUpEvent = new MouseUpDelegate();
    }
    return this._mouseUpEvent;
  }

  private _mouseMoveEvent: MouseMoveDelegate = undefined;
  public get MouseMoveEvent(): MouseMoveDelegate {
    if (this._mouseMoveEvent == undefined) {
      this._mouseMoveEvent = new MouseMoveDelegate();
    }
    return this._mouseMoveEvent;
  }

  private _keyStateChangedEvent: KeyStateChangedDelegate = undefined;
  public get KeyStateChangedEvent(): KeyStateChangedDelegate {
    if (this._keyStateChangedEvent == undefined) {
      this._keyStateChangedEvent = new KeyStateChangedDelegate();
    }
    return this._keyStateChangedEvent;
  }

  private _mouseKeyStateChangedEvent: MouseKeyStateChangedDelegate = undefined;
  public get MouseKeyStateChangedEvent(): MouseKeyStateChangedDelegate {
    if (this._mouseKeyStateChangedEvent == undefined) {
      this._mouseKeyStateChangedEvent = new MouseKeyStateChangedDelegate();
    }
    return this._mouseKeyStateChangedEvent;
  }

  private _keyDownEvent: KeyDownDelegate = undefined;
  public get KeyDownEvent(): KeyDownDelegate {
    if (this._keyDownEvent == undefined) {
      this._keyDownEvent = new KeyDownDelegate();
    }
    return this._keyDownEvent;
  }

  private _keyPressedEvent: KeyPressedDelegate = undefined;
  public get KeyPressedEvent(): KeyPressedDelegate {
    if (this._keyPressedEvent == undefined) {
      this._keyPressedEvent = new KeyPressedDelegate();
    }
    return this._keyPressedEvent;
  }

  private _keyUpEvent: KeyUpDelegate = undefined;
  public get KeyUpEvent(): KeyUpDelegate {
    if (this._keyUpEvent == undefined) {
      this._keyUpEvent = new KeyUpDelegate();
    }
    return this._keyUpEvent;
  }

  public static keyCodeFromAscii: { [index: number]: KeyCode } = {
    8: KeyCode.backspace,
    9: KeyCode.tab,
    13: KeyCode.enter,
    16: KeyCode.shift,
    17: KeyCode.ctrl,
    18: KeyCode.alt,
    19: KeyCode.pause,
    20: KeyCode.capslock,
    27: KeyCode.escape,
    33: KeyCode.pageup,
    34: KeyCode.pagedown,
    35: KeyCode.end,
    36: KeyCode.home,
    37: KeyCode.leftarrow,
    38: KeyCode.uparrow,
    39: KeyCode.rightarrow,
    40: KeyCode.downarrow,
    45: KeyCode.insert,
    46: KeyCode.delete,
    48: KeyCode.n0,
    49: KeyCode.n1,
    50: KeyCode.n2,
    51: KeyCode.n3,
    52: KeyCode.n4,
    53: KeyCode.n5,
    54: KeyCode.n6,
    55: KeyCode.n7,
    56: KeyCode.n8,
    57: KeyCode.n9,
    65: KeyCode.a,
    66: KeyCode.b,
    67: KeyCode.c,
    68: KeyCode.d,
    69: KeyCode.e,
    70: KeyCode.f,
    71: KeyCode.g,
    72: KeyCode.h,
    73: KeyCode.i,
    74: KeyCode.j,
    75: KeyCode.k,
    76: KeyCode.l,
    77: KeyCode.m,
    78: KeyCode.n,
    79: KeyCode.o,
    80: KeyCode.p,
    81: KeyCode.q,
    82: KeyCode.r,
    83: KeyCode.s,
    84: KeyCode.t,
    85: KeyCode.u,
    86: KeyCode.v,
    87: KeyCode.w,
    88: KeyCode.x,
    89: KeyCode.y,
    90: KeyCode.z,
    91: KeyCode.leftwindowkey,
    92: KeyCode.rightwindowkey,
    93: KeyCode.selectkey,
    96: KeyCode.numpad0,
    97: KeyCode.numpad1,
    98: KeyCode.numpad2,
    99: KeyCode.numpad3,
    100: KeyCode.numpad4,
    101: KeyCode.numpad5,
    102: KeyCode.numpad6,
    103: KeyCode.numpad7,
    104: KeyCode.numpad8,
    105: KeyCode.numpad9,
    106: KeyCode.multiply,
    107: KeyCode.add,
    109: KeyCode.subtract,
    110: KeyCode.decimalpoint,
    111: KeyCode.divide,
    112: KeyCode.f1,
    113: KeyCode.f2,
    114: KeyCode.f3,
    115: KeyCode.f4,
    116: KeyCode.f5,
    117: KeyCode.f6,
    118: KeyCode.f7,
    119: KeyCode.f8,
    120: KeyCode.f9,
    121: KeyCode.f10,
    122: KeyCode.f11,
    123: KeyCode.f12,
    144: KeyCode.numlock,
    145: KeyCode.scrolllock,
    186: KeyCode.semicolon,
    187: KeyCode.equalsign,
    188: KeyCode.comma,
    189: KeyCode.dash,
    190: KeyCode.period,
    191: KeyCode.forwardslash,
    192: KeyCode.graveaccent,
    219: KeyCode.openbracket,
    220: KeyCode.backslash,
    221: KeyCode.closebraket,
    222: KeyCode.singlequote
  };

  //		inputManager: plume.InputManager;
  mousePosition: Vector2 = undefined;
  mouseDiff: Vector2 = Vector2.Zero;
  keyStates: { [index: number]: KeyState } = {};
  mouseKeyStates: { [index: number]: KeyState } = {};
  downKeys: KeyCode[] = [];
  downMouseKeys: MouseButton[] = [];

  upKeys: KeyCode[] = [];
  upMouseKeys: MouseButton[] = [];
  isMouseDown = false;
  wheel = 0;
  wheelDelta = 0;
  newMousePosition: Vector2;
  ignoredKeys: { [index: number]: boolean } = { [KeyCode.f12]: true };
  controlKeys: { [index: number]: boolean } = {
    [KeyCode.ctrl]: true,
    [KeyCode.shift]: true,
    [KeyCode.alt]: true
  };
  lastDownTarget: any;
  ListenDomElement(domElement: HTMLElement) {
    const self = this;
    {
      //console.error("EL NAME:" + domElement.parentElement.id);
      document.addEventListener('keydown', (keyEvent: KeyboardEvent) => {
        //keyEvent.keyCode ==
        if (
          self.lastDownTarget == domElement ||
          domElement == (document as any)
        ) {
          const keyCode = Input.keyCodeFromAscii[keyEvent.keyCode];
          self.keyStates[<number>keyCode] = KeyState.Down;
          self.downKeys.push(keyCode);

          self.KeyStateChangedEvent.invoke({
            keyCode: keyCode,
            keyState: KeyState.Down
          });
          self.KeyDownEvent.invoke({ keyCode: keyCode });
          if (this.readingInputNumber) {
            const key = keyCode;
            if (key == KeyCode.backspace) {
              for (
                var i = 0;
                i < this.readingInputNumberListeners.length;
                i++
              ) {
                if (this.readingInputNumberListeners[i].value.length > 0) {
                  this.readingInputNumberListeners[i].value =
                    this.readingInputNumberListeners[i].value.substr(
                      0,
                      this.readingInputNumberListeners[i].value.length - 1
                    );
                  this.readingInputNumberListeners[i].onChange(
                    Number.parseFloat(this.readingInputNumberListeners[i].value)
                  );
                }
              }
            }
            if (key == KeyCode.subtract) {
            }
            if (
              this.IsNumpad(key) ||
              key == KeyCode.decimalpoint ||
              key == KeyCode.subtract
            ) {
              for (
                var i = 0;
                i < this.readingInputNumberListeners.length;
                i++
              ) {
                var val = this.readingInputNumberListeners[i].value;
                if (key == KeyCode.decimalpoint && val.indexOf('.') >= 0) {
                  continue;
                } else if (
                  key == KeyCode.subtract &&
                  (val.indexOf('-') >= 0 || val.length > 0)
                ) {
                  continue;
                } else {
                  if (key == KeyCode.decimalpoint) {
                    this.readingInputNumberListeners[i].value += '.';
                  } else if (key == KeyCode.subtract) {
                    this.readingInputNumberListeners[i].value += '-';
                  } else {
                    this.readingInputNumberListeners[i].value +=
                      this.GetNumpadNumber(key);
                  }
                  var val = this.readingInputNumberListeners[i].value;
                  this.readingInputNumberListeners[i].onChange(
                    Number.parseFloat(val)
                  );
                }
              }
            } else if (keyCode == KeyCode.enter) {
              for (
                var i = 0;
                i < this.readingInputNumberListeners.length;
                i++
              ) {
                //this.readingInputNumberListeners[i].value += this.GetNumpadNumber(this.downKeys[i]);
                var val = this.readingInputNumberListeners[i].value;
                this.readingInputNumberListeners[i].onComplete(
                  Number.parseFloat(val)
                );
              }
              this.readingInputNumberListeners = [];
              this.readingInputNumber = false;
            } else if (keyCode == KeyCode.escape) {
              for (
                var i = 0;
                i < this.readingInputNumberListeners.length;
                i++
              ) {
                //this.readingInputNumberListeners[i].value += this.GetNumpadNumber(this.downKeys[i]);
                var val = this.readingInputNumberListeners[i].value;
                this.readingInputNumberListeners[i].onCancel(
                  Number.parseFloat(val)
                );
              }
              this.readingInputNumberListeners = [];
              this.readingInputNumber = false;
            }
          }
          if (this.ignoredKeys[keyCode] == undefined) {
            if ((domElement as any) != document) {
              keyEvent.preventDefault();
              keyEvent.stopPropagation();
            }
          }
          if (this.controlKeys[keyCode] != undefined) {
            if ((domElement as any) != document) {
              keyEvent.preventDefault();
              keyEvent.stopPropagation();
            }
          }
        } else {
        }
      });

      document.addEventListener('keyup', (keyEvent: KeyboardEvent) => {
        //keyEvent.keyCode ==

        const keyCode = Input.keyCodeFromAscii[keyEvent.keyCode];
        self.keyStates[<number>keyCode] = KeyState.Up;
        self.upKeys.push(keyCode);
        self.KeyStateChangedEvent.invoke({
          keyCode: keyCode,
          keyState: KeyState.Up
        });
        self.KeyUpEvent.invoke({ keyCode: keyCode });
      });
      window.addEventListener('mousemove', (ev: MouseEvent) => {
        self.windowMousePosition = new Vector2(ev.pageX, ev.pageY);
      });
      domElement.addEventListener('mousemove', (ev: MouseEvent) => {
        self.newMousePosition = new Vector2(ev.pageX, ev.pageY);
        self.MouseMoveEvent.invoke({
          evt: ev,
          mousePosition: self.newMousePosition
        });

        if (
          !ev.shiftKey &&
          (self.keyStates[KeyCode.shift] == KeyState.Pressed ||
            self.keyStates[KeyCode.shift] == KeyState.Down)
        ) {
          self.keyStates[KeyCode.shift] = KeyState.Up;
          self.upKeys.push(KeyCode.shift);
        }
        if (
          !ev.altKey &&
          (self.keyStates[KeyCode.alt] == KeyState.Pressed ||
            self.keyStates[KeyCode.alt] == KeyState.Down)
        ) {
          self.keyStates[KeyCode.alt] = KeyState.Up;
          self.upKeys.push(KeyCode.alt);
        }
        if (
          !ev.ctrlKey &&
          (self.keyStates[KeyCode.ctrl] == KeyState.Pressed ||
            self.keyStates[KeyCode.ctrl] == KeyState.Down)
        ) {
          self.keyStates[KeyCode.ctrl] = KeyState.Up;
          self.upKeys.push(KeyCode.ctrl);
        }
      });
      document.addEventListener(
        'mousedown',
        function (event) {
          self.lastDownTarget = event.target;
          if (
            self.lastDownTarget == domElement &&
            (domElement as any) != document
          ) {
            const inputs = document.getElementsByTagName('input');
            for (let index = 0; index < inputs.length; ++index) {
              // deal with inputs[index] element.
              inputs[index].blur();
            }
            //console.error("LOST FOCUS!!!!");
            //if( el ) el.blur();
          }
          //console.error("MOUSE DOWN///");
        },
        false
      );

      domElement.addEventListener('mousedown', (ev: MouseEvent) => {
        //console.error("mouse down... !!");
        self.isMouseDown = true;
        self.isMouseJustDown = true;
        const mouseButton = <MouseButton>ev.button;
        self.mouseKeyStates[ev.button] = KeyState.Down;
        //self.newMousePosition = new Vector2(ev.pageX, ev.pageY);
        self.downMouseKeys.push(ev.button);
        self.MouseKeyStateChangedEvent.invoke({
          mouseButton: mouseButton,
          keyState: KeyState.Down,
          position: self.newMousePosition
        });
        self.MouseDownEvent.invoke({
          evt: ev,
          mousePosition: self.newMousePosition
        });
      });
      domElement.addEventListener('mouseup', (ev: MouseEvent) => {
        self.isMouseDown = false;
        const mouseButton = <MouseButton>ev.button;
        self.mouseKeyStates[ev.button] = KeyState.Up;

        self.upMouseKeys.push(ev.button);
        self.MouseKeyStateChangedEvent.invoke({
          mouseButton: mouseButton,
          keyState: KeyState.Up,
          position: self.newMousePosition
        });
        self.MouseUpEvent.invoke({
          evt: ev,
          mousePosition: self.newMousePosition
        });
      });
      domElement.addEventListener('wheel', (ev: WheelEvent) => {
        self.wheel -= (ev as any).wheelDelta;
        self.MouseWheelEvent.invoke({
          evt: ev,
          mousePosition: self.mousePosition,
          wheelDelta: (ev as any).wheelDelta
        });
        //console.error("wheel");
      });
    }
  }
  Start(): void {
    //console.error("input start");
    var self = this;
    const listeners: EventListener[] = [];

    //			this.inputManager = Game.get().inputManager;
    this.mousePosition = Vector2.Zero;
    var self = this;
    this.newMousePosition = this.mousePosition;
    /*			this.inputManager.mouse.mouseWheelHandlers.add((e: any) => {
							self.wheel = e;
						})*/
  }
  Update(deltaTime: number): void {
    //var tmp: { [index: number]: string } = { 4: "yoyo", 5: "toto" };
    const newPos = new Vector2(this.newMousePosition.x, this.newMousePosition.y);
    this.mouseDiff = newPos.clone().sub(this.mousePosition);
    this.mousePosition = newPos;
    //	console.error("hey");
    //	console.log("mouse pos:" + this.mousePosition.toArray());
    //	console.log("mouse diff:" + this.mouseDiff.toArray());
    this.wheelDelta = this.wheel;
    this.wheel = 0;

    for (var i = 0; i < this.downKeys.length; i++) {
      this.keyStates[this.downKeys[i]] = KeyState.Pressed;
      this.KeyPressedEvent.invoke({ keyCode: this.downKeys[i] });
      this.KeyStateChangedEvent.invoke({
        keyCode: this.downKeys[i],
        keyState: KeyState.Pressed
      });
    }
    for (var i = 0; i < this.downMouseKeys.length; i++) {
      this.isMouseJustDown = false;
      //console.log("mouse not down anymore:" + this.downMouseKeys[i]);
      this.mouseKeyStates[this.downMouseKeys[i]] = KeyState.Pressed;
      //this.KeyPressedEvent.invoke({ keyCode: this.downMouseKeys[i] });
      this.MouseKeyStateChangedEvent.invoke({
        mouseButton: <MouseButton>this.downMouseKeys[i],
        keyState: KeyState.Pressed,
        position: this.mousePosition
      });
    }
    this.downKeys = [];
    this.downMouseKeys = [];
    for (var i = 0; i < this.upKeys.length; i++) {
      this.keyStates[this.upKeys[i]] = KeyState.None;
      this.KeyStateChangedEvent.invoke({
        keyCode: this.upKeys[i],
        keyState: KeyState.None
      });
    }
    for (var i = 0; i < this.upMouseKeys.length; i++) {
      this.mouseKeyStates[this.upMouseKeys[i]] = KeyState.None;
      this.MouseKeyStateChangedEvent.invoke({
        mouseButton: <MouseButton>this.upMouseKeys[i],
        keyState: KeyState.None,
        position: this.mousePosition
      });
    }

    this.upKeys = [];
    this.upMouseKeys = [];
  }

  GetNumpadNumber(value: KeyCode): any {
    for (let i = 0; i <= 9; i++) {
      if (value == KeyCode['numpad' + i]) {
        return i;
      }
    }
    return undefined;
  }
  IsNumpad(value: KeyCode): any {
    for (let i = 0; i <= 9; i++) {
      if (value == KeyCode['numpad' + i]) {
        return true;
      }
    }
    return false;
  }
  IsMouseButtonDown(button: MouseButton) {
    return (
      this.mouseKeyStates[button] == KeyState.Down ||
      this.mouseKeyStates[button] == KeyState.Pressed
    );
  }
  IsMouseButtonJustDown(button: MouseButton) {
    return this.mouseKeyStates[button] == KeyState.Down;
  }
  IsMouseButtonPressed(button: MouseButton) {
    return this.mouseKeyStates[button] == KeyState.Pressed;
  }
  GetMouseButtonState(mouseButton: MouseButton) {
    if (this.mouseKeyStates[mouseButton] == undefined) {
      this.mouseKeyStates[mouseButton] = KeyState.None;
    }
    return this.mouseKeyStates[mouseButton];
  }

  IsPressed(keycode: KeyCode) {
    return this.keyStates[keycode] == KeyState.Pressed;
  }
  IsDown(keycode: KeyCode) {
    return (
      this.keyStates[keycode] == KeyState.Down ||
      this.keyStates[keycode] == KeyState.Pressed
    );
  }
  IsJustDown(keycode: KeyCode) {
    return this.keyStates[keycode] == KeyState.Down;
  }
  GetKeyState(keycode: KeyCode) {
    if (this.keyStates[keycode] == undefined) {
      this.keyStates[keycode] = KeyState.None;
    }
    return this.keyStates[keycode];
  }

  Destroy(): void {}
  public constructor(private autoUpdateKeys: boolean = true) {
    Input._Main = this;
    this.Start();
  }
  private static _Main: Input = undefined;
  public static get Main() {
    return this._Main;
  }
}

export var input = new Input();