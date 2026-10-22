import { deflateRawSync } from 'node:zlib';
import { parseSchema, compileSchema, encodeBinarySchema } from 'kiwi-schema';

// A small, self-authored scene schema exercising the same container and field types
// as native Figma copy. No private design data is included in the fixture.
const schema = parseSchema(`
enum NodeType { DOCUMENT = 1; CANVAS = 2; FRAME = 4; VECTOR = 6; RECTANGLE = 10; TEXT = 13; SYMBOL = 15; INSTANCE = 16; }
enum PaintType { SOLID = 0; IMAGE = 5; }
struct GUID { uint sessionID; uint localID; }
struct Vector { float x; float y; }
struct Matrix { float m00; float m01; float m02; float m10; float m11; float m12; }
struct ParentIndex { GUID guid; string position; }
struct Color { float r; float g; float b; float a; }
struct FontName { string family; string style; string postscript; }
struct Blob { byte[] bytes; }
message Image { uint dataBlob = 3; }
message Paint { PaintType type = 1; Color color = 2; Image image = 8; Image imageThumbnail = 9; }
message TextData { string characters = 1; uint[] characterStyleIDs = 2; NodeChange[] styleOverrideTable = 3; }
message Path { uint commandsBlob = 2; }
message GUIDPath { GUID[] guids = 1; }
message SymbolData { GUID symbolID = 1; NodeChange[] symbolOverrides = 2; }
message NodeChange {
  GUID guid = 1; ParentIndex parentIndex = 3; NodeType type = 4; string name = 5;
  bool visible = 6; float opacity = 8; Vector size = 11; Matrix transform = 12;
  float fontSize = 21; uint styleID = 49; FontName fontName = 41; TextData textData = 42;
  Paint[] fillPaints = 38; Path[] fillGeometry = 51;
  GUID overrideKey = 50; GUIDPath guidPath = 111; SymbolData symbolData = 113; NodeChange[] derivedSymbolData = 125;
}
message Message { NodeChange[] nodeChanges = 4; Blob[] blobs = 6; uint blobBaseIndex = 30; }
`.replace(/message (\w+) \{([^}]+)\}/g, (_match, name, body) => {
  let id = 0;
  return `message ${name} {${body.replace(/= \d+/g, () => `= ${++id}`)}}`;
}));

const guid = localID => ({ sessionID: 1, localID });
const matrix = (x, y) => ({ m00: 1, m01: 0, m02: x, m10: 0, m11: 1, m12: y });
const node = (id, parent, name, type, x, y, width, height) => ({ guid: guid(id), ...(parent ? { parentIndex: { guid: guid(parent), position: String.fromCharCode(65 + id) } } : {}), type, name, size: { x: width, y: height }, transform: matrix(x, y) });
const paint = { type: 'SOLID', color: { r: 0.2, g: 0.1, b: 0.6, a: 1 } };

export function sampleMessage() {
  return { nodeChanges: [
    node(1, null, 'Landing page', 'FRAME', 300, 500, 1200, 800),
    { ...node(2, 1, 'Hero section', 'FRAME', 0, 100, 1200, 400), fillPaints: [paint] },
    { ...node(3, 2, 'Heading', 'TEXT', 30, 40, 500, 60), fontSize: 32, fontName: { family: 'Inter', style: 'Regular', postscript: '' }, textData: { characters: 'Hello world', characterStyleIDs: [0, 0, 0, 0, 0, 0, 1, 1, 1, 1, 1], styleOverrideTable: [{ styleID: 1, fontName: { family: 'Inter', style: 'Bold', postscript: '' } }] } },
    node(4, 1, 'Footer', 'FRAME', 0, 700, 1200, 100),
  ], blobs: [] };
}

function rawZstd(bytes) {
  const header = Buffer.alloc(12);
  header.writeUInt32LE(0xfd2fb528, 0); header[4] = 0xa0;
  header.writeUInt32LE(bytes.length, 5);
  header.writeUIntLE((bytes.length << 3) | 1, 9, 3);
  return Buffer.concat([header, Buffer.from(bytes)]);
}

export function nativeClipboardHtml(message = sampleMessage(), compression = 'deflate') {
  const codec = compileSchema(schema);
  const scene = codec.encodeMessage(message);
  const blocks = [deflateRawSync(encodeBinarySchema(schema)), compression === 'zstd' ? rawZstd(scene) : deflateRawSync(scene)];
  const header = Buffer.alloc(12);
  header.write('fig-kiwi'); header.writeUInt32LE(106, 8);
  const archive = Buffer.concat([header, ...blocks.flatMap(block => {
    const size = Buffer.alloc(4); size.writeUInt32LE(block.length);
    return [size, block];
  })]);
  return `<meta charset="utf-8"><span data-buffer="<!--(figma)${archive.toString('base64')}(/figma)-->"></span>`;
}
