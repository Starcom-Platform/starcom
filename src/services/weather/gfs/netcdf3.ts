/**
 * A netCDF reader for the fallback only: GFS from PacIOOS's ERDDAP, read when
 * NOAA's bucket on AWS has failed (decision D-W, WX5).
 *
 * ERDDAP writes the simplest form netCDF has: classic (version 1), no record
 * dimension, the axes as doubles and the data as floats. This reads that and
 * refuses anything else by name; the tests hold it to SciPy's reading of a
 * real response.
 */
import type { LatLonGrid } from './grib2';

type Attribute = string | number | number[];

export interface NcVariable {
  dims: string[];
  shape: number[];
  attributes: Record<string, Attribute>;
  type: number;
  begin: number;
}

export interface NcFile {
  attributes: Record<string, Attribute>;
  variables: Record<string, NcVariable>;
  /** A variable's values, in the file's order (the last dimension varies fastest). */
  read(name: string): Float32Array | Float64Array;
}

const NC_CHAR = 2, NC_FLOAT = 5, NC_DOUBLE = 6;
const SIZE: Record<number, number> = { 1: 1, 2: 1, 3: 2, 4: 4, 5: 4, 6: 8 };
const TAG_DIMENSION = 10, TAG_VARIABLE = 11, TAG_ATTRIBUTE = 12;

export function readNetcdf3(bytes: Uint8Array): NcFile {
  const dv = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let o = 0;
  const need = (n: number) => { if (o + n > bytes.length) throw new Error(`The file ends at byte ${bytes.length}, inside its header.`); };
  const u32 = () => { need(4); const v = dv.getUint32(o); o += 4; return v; };
  const pad = (n: number) => (4 - (n % 4)) % 4;
  const text = () => { const n = u32(); need(n); const s = new TextDecoder().decode(bytes.subarray(o, o + n)); o += n + pad(n); return s; };

  need(4);
  if (bytes[0] !== 0x43 || bytes[1] !== 0x44 || bytes[2] !== 0x46) throw new Error('This is not a classic netCDF file.');
  if (bytes[3] !== 1) throw new Error(`netCDF version ${bytes[3]} is not read; only version 1 (classic) is.`);
  o = 4;
  if (u32() !== 0) throw new Error('The file has record variables; this reader takes only files without them.');

  const dims: { name: string; size: number }[] = [];
  const dimTag = u32(), dimCount = u32();
  if (dimTag !== TAG_DIMENSION && dimCount !== 0) throw new Error('The dimension list is malformed.');
  for (let i = 0; i < dimCount; i++) {
    const name = text();
    const size = u32();
    if (size === 0) throw new Error(`Dimension ${name} is unlimited; this reader takes only fixed dimensions.`);
    dims.push({ name, size });
  }

  const attributes = (): Record<string, Attribute> => {
    const tag = u32(), count = u32();
    if (tag !== TAG_ATTRIBUTE && count !== 0) throw new Error('An attribute list is malformed.');
    const out: Record<string, Attribute> = {};
    for (let i = 0; i < count; i++) {
      const name = text();
      const type = u32(), n = u32();
      const size = SIZE[type];
      if (!size) throw new Error(`Attribute ${name} has unknown type ${type}.`);
      need(n * size);
      if (type === NC_CHAR) {
        out[name] = new TextDecoder().decode(bytes.subarray(o, o + n)).replace(/\0+$/, '');
      } else {
        const values: number[] = [];
        for (let k = 0; k < n; k++) {
          const at = o + k * size;
          values.push(type === 1 ? dv.getInt8(at) : type === 3 ? dv.getInt16(at) : type === 4 ? dv.getInt32(at) : type === NC_FLOAT ? dv.getFloat32(at) : dv.getFloat64(at));
        }
        out[name] = n === 1 ? values[0] : values;
      }
      o += n * size + pad(n * size);
    }
    return out;
  };
  const global = attributes();

  const variables: Record<string, NcVariable> = {};
  const varTag = u32(), varCount = u32();
  if (varTag !== TAG_VARIABLE && varCount !== 0) throw new Error('The variable list is malformed.');
  for (let i = 0; i < varCount; i++) {
    const name = text();
    const rank = u32();
    const ids: number[] = [];
    for (let k = 0; k < rank; k++) ids.push(u32());
    const attrs = attributes();
    const type = u32();
    u32(); // vsize: recomputed from the shape, which is what the reader trusts
    const begin = u32();
    const shape = ids.map((id) => dims[id]?.size ?? Number.NaN);
    if (shape.some(Number.isNaN)) throw new Error(`Variable ${name} names a dimension the file does not have.`);
    variables[name] = { dims: ids.map((id) => dims[id].name), shape, attributes: attrs, type, begin };
    const length = shape.reduce((a, s) => a * s, 1) * (SIZE[type] ?? 0);
    if (begin + length > bytes.length) throw new Error(`The file ends at byte ${bytes.length}, before ${name}'s values end.`);
  }

  return {
    attributes: global,
    variables,
    read(name: string) {
      const v = variables[name];
      if (!v) throw new Error(`The file has no variable ${name}.`);
      const n = v.shape.reduce((a, s) => a * s, 1);
      if (v.type === NC_FLOAT) {
        const out = new Float32Array(n);
        for (let k = 0; k < n; k++) out[k] = dv.getFloat32(v.begin + k * 4);
        return out;
      }
      if (v.type === NC_DOUBLE) {
        const out = new Float64Array(n);
        for (let k = 0; k < n; k++) out[k] = dv.getFloat64(v.begin + k * 8);
        return out;
      }
      throw new Error(`Variable ${name} has type ${v.type}; only floats and doubles are read.`);
    },
  };
}

/**
 * One GFS field from an ERDDAP response, on the grid NOAA's own files use
 * (rows from the north), with fill values turned into no value.
 */
export function erddapField(file: NcFile, name: string): { grid: LatLonGrid; values: Float32Array; valid: Date } {
  const v = file.variables[name];
  if (!v) throw new Error(`The response has no ${name}.`);
  if (v.dims.join(',') !== 'time,latitude,longitude' || v.shape[0] !== 1) {
    throw new Error(`${name} is shaped ${v.dims.join(' × ')}; one time on a latitude–longitude grid is read.`);
  }
  if ('scale_factor' in v.attributes || 'add_offset' in v.attributes) throw new Error(`${name} is packed; this reader takes only unpacked values.`);
  const timeUnits = file.variables.time?.attributes.units;
  if (timeUnits !== 'seconds since 1970-01-01T00:00:00Z') throw new Error(`Time is in "${String(timeUnits)}", not seconds since 1970.`);

  const lat = file.read('latitude'), lon = file.read('longitude');
  if (lat.length < 2 || lon.length < 2) throw new Error('The grid needs at least two points each way.');
  if (lat[1] >= lat[0]) throw new Error('Latitudes run from the south; the fallback asks for them from the north.');
  const grid: LatLonGrid = {
    ni: lon.length, nj: lat.length,
    la1: lat[0], lo1: lon[0], la2: lat[lat.length - 1], lo2: lon[lon.length - 1],
    di: lon[1] - lon[0], dj: lat[0] - lat[1],
  };

  const raw = file.read(name);
  const fill = v.attributes._FillValue;
  const values = new Float32Array(raw.length);
  for (let k = 0; k < raw.length; k++) values[k] = raw[k] === fill ? Number.NaN : raw[k];
  return { grid, values, valid: new Date(file.read('time')[0] * 1000) };
}
