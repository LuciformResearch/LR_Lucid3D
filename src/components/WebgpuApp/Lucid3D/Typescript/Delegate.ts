
export abstract class Delegate<T> {
    private _listeners: ((args: T, instance?: any) => void)[] = [];
    private _instances: any[] = [];
    public addListener(instance: any, listener: (args: T, instance?: any) => void) {
        this._listeners.push(listener);
        this._instances.push(instance);
        return (listener);
    }
    public removeListener(instance: any, listener: (args: T, instance?: any) => void) {
        let index = this._listeners.indexOf(listener);
        while (index >= 0) {
            this._instances.splice(index, 1);
            this._listeners.splice(index, 1);
            index = this._listeners.indexOf(listener);
        }
    }
    public invoke(args: T): void {
        for (let i = 0; i < this._listeners.length; i++) {
            this._listeners[i].call(this._instances[i], args, this._instances[i]);
        }
    }
    public removeAllListeners(): void {
        this._listeners = [];
        this._instances = [];
    }
}
export class SimpleDelegate<T> extends Delegate<T>
{

}