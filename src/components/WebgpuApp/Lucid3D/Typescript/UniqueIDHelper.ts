
export class UniqueIDHelper {
	private static _ObjById: { [index: string]: any } = {};
	private static _Lut: string[] = undefined;
	private static get Lut(): string[] {
		if (this._Lut == undefined) {


			var res: string[] = [];
			for (var i = 0; i < 256; i++) {

				res[i] = (i < 16 ? '0' : '') + (i).toString(16);
			}
			this._Lut = res;
		}
		return (this._Lut);
	}
	public static GenerateUUID() {
		// un simple tableau asciii.
		var lut = this.Lut;

		// | 0 semble etre pour etre sur que ça se caste en int.

		// quatres nombres random de 32 bit.
		var d0 = Math.random() * 0xffffffff | 0;

		var d1 = Math.random() * 0xffffffff | 0;
		var d2 = Math.random() * 0xffffffff | 0;
		var d3 = Math.random() * 0xffffffff | 0;

		// on prends un charactere pour chaque byte généré.
		// 16 charactères générés en tout.
		var uuid = lut[d0 & 0xff] + lut[d0 >> 8 & 0xff] + lut[d0 >> 16 & 0xff] + lut[d0 >> 24 & 0xff] + '-' +
			lut[d1 & 0xff] + lut[d1 >> 8 & 0xff] + '-' + lut[d1 >> 16 & 0x0f | 0x40] + lut[d1 >> 24 & 0xff] + '-' +
			lut[d2 & 0x3f | 0x80] + lut[d2 >> 8 & 0xff] + '-' + lut[d2 >> 16 & 0xff] + lut[d2 >> 24 & 0xff] +
			lut[d3 & 0xff] + lut[d3 >> 8 & 0xff] + lut[d3 >> 16 & 0xff] + lut[d3 >> 24 & 0xff];


		// .toUpperCase() here flattens concatenated strings to save heap memory space.

		// j'ai du mal a voir l'utilité du uppercase si justement on a généré a partir d'un tableau de 256...

		return (uuid.toUpperCase());
	}
	public static GetUUID(obj: any): string {
		if (obj.uuid == undefined) {
			var uuid = this.GenerateUUID();
			while (this._ObjById[uuid] != undefined) {
				uuid = this.GenerateUUID();
			}
			obj.uuid = uuid;
			this._ObjById[uuid] = obj;
		}
		return (obj.uuid);
	};
}
