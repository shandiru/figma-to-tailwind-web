import { inflateRawSync } from 'node:zlib';
import { Decompress } from 'fzstd';
import { ByteBuffer, decodeBinarySchema } from 'kiwi-schema';
import { figmaPayload } from '../../../shared/figmaClipboard.js';

const LIMIT = 64 * 1024 * 1024;
function unpack(bytes) {
  if (bytes.length >= 4 && bytes.readUInt32LE(0) === 0xfd2fb528) {
    const chunks = [];
    let size = 0;
    const stream = new Decompress(chunk => {
      size += chunk.length;
      if (size > LIMIT) throw new Error('Clipboard data expands beyond 64 MB. Copy a smaller selection.');
      chunks.push(Buffer.from(chunk));
    });
    stream.push(bytes, true);
    return Buffer.concat(chunks);
  }
  return inflateRawSync(bytes, { maxOutputLength: LIMIT });
}

/** Interpret the embedded Kiwi schema; never execute code from pasted schemas. */
export function decodeClipboard(html) {
  const encoded = figmaPayload(html);
  if (!encoded) throw new Error('No editable Figma data found. Select a frame in Figma and use Copy (Ctrl/Cmd+C), then paste here.');
  const data = Buffer.from(encoded.replace(/\s/g, ''), 'base64');
  if (data.length < 20 || data.subarray(0, 8).toString() !== 'fig-kiwi') throw new Error('This Figma clipboard format is not supported. Try Copy layers from the included plugin.');
  const chunks = [];
  let offset = 12;
  while (offset < data.length) {
    if (offset + 4 > data.length || chunks.length > 8) throw new Error('Incomplete Figma clipboard data. Copy the frame again.');
    const length = data.readUInt32LE(offset);
    offset += 4;
    if (!length || offset + length > data.length) throw new Error('Incomplete Figma clipboard data. Copy the frame again.');
    chunks.push(data.subarray(offset, offset + length));
    offset += length;
  }
  if (chunks.length < 2) throw new Error('The Figma clipboard is missing its schema or scene.');
  const schema = decodeBinarySchema(unpack(chunks[0]));
  if (schema.definitions.length > 3000) throw new Error('Clipboard schema is too complex.');
  const definitions = new Map(schema.definitions.map(def => [def.name, def]));
  const fieldMaps = new Map(schema.definitions.map(def => [def.name, new Map(def.fields.map(f => [f.value, f]))]));
  const bb = new ByteBuffer(unpack(chunks[1]));
  let steps = 0;
  const primitive = { bool: () => !!bb.readByte(), byte: () => bb.readByte(), uint: () => bb.readVarUint(), int: () => bb.readVarInt(), float: () => bb.readVarFloat(), string: () => bb.readString(), uint64: () => bb.readVarUint64(), int64: () => bb.readVarInt64() };
  const read = (type, depth = 0) => {
    if (++steps > 2000000 || depth > 100) throw new Error('Clipboard scene is too complex. Copy a smaller selection.');
    if (Object.hasOwn(primitive, type)) return primitive[type]();
    const def = definitions.get(type);
    if (!def) throw new Error('Unsupported clipboard field type.');
    if (def.kind === 'ENUM') {
      const value = bb.readVarUint();
      return fieldMaps.get(type).get(value)?.name;
    }
    const output = Object.create(null);
    const field = f => {
      let value;
      if (f.isArray && f.type === 'byte') value = bb.readByteArray();
      else if (f.isArray) {
        const length = bb.readVarUint();
        if (length > 200000) throw new Error('Clipboard array is too large.');
        value = Array.from({ length }, () => read(f.type, depth + 1));
      } else value = read(f.type, depth + 1);
      if (!f.isDeprecated) output[f.name] = value;
    };
    if (def.kind === 'STRUCT') for (const f of def.fields) field(f);
    else {
      const fields = fieldMaps.get(type);
      for (let tag = bb.readVarUint(); tag; tag = bb.readVarUint()) {
        const f = fields.get(tag);
        if (!f) throw new Error('The copied Figma scene uses an unsupported field.');
        field(f);
      }
    }
    return output;
  };
  return read('Message');
}
