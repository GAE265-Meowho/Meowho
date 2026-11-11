"""把 new.glb 的某個動畫換進 base.glb，其他內容一個位元組都不動（2026-11-10，#319）

    python3 scripts/clips/splice_clip.py base.glb new.glb out.glb [clip（預設 groom）]

用途：母體 glb 有些動作是匯出後才用腳本改的（例如 scripts/clips/eat_drink.mjs 改 eat、drink），
重新從 Blender 匯出整支 glb 會把那些修改蓋回去。只想換一個動作時，用這支把新匯出的那個動作接進目前的 glb。
新動作的資料接在 buffer 後面，舊動作的資料留著不引用；節點用名稱對應。
"""
import json, struct, sys
import numpy as np

def load(fn):
    b = open(fn, 'rb').read()
    l = struct.unpack('<I', b[12:16])[0]; j = json.loads(b[20:20 + l])
    off = 20 + l; bl = struct.unpack('<I', b[off:off + 4])[0]
    return j, b[off + 8:off + 8 + bl]

CT = {5126: np.float32, 5123: np.uint16, 5125: np.uint32, 5121: np.uint8, 5122: np.int16, 5120: np.int8}
NC = {'SCALAR': 1, 'VEC2': 2, 'VEC3': 3, 'VEC4': 4, 'MAT4': 16}

def raw(j, b, i):
    a = j['accessors'][i]; bv = j['bufferViews'][a['bufferView']]
    n = a['count'] * NC[a['type']]; dt = CT[a['componentType']]
    o = bv.get('byteOffset', 0) + a.get('byteOffset', 0)
    stride = bv.get('byteStride'); es = NC[a['type']] * np.dtype(dt).itemsize
    if stride and stride != es:                # 交錯排列：逐筆取出再緊密排好
        return b''.join(b[o + k * stride:o + k * stride + es] for k in range(a['count']))
    return np.frombuffer(b, dtype=dt, count=n, offset=o).tobytes()

base, bb = load(sys.argv[1]); new, nb = load(sys.argv[2]); clip = sys.argv[4] if len(sys.argv) > 4 else 'groom'
names = {n.get('name'): i for i, n in enumerate(base['nodes'])}
src = next(a for a in new['animations'] if a['name'] == clip)
blobs = []                                   # (accessor json, bytes) to append
def add(acc_i):
    a = dict(new['accessors'][acc_i]); data = raw(new, nb, acc_i)
    a.pop('bufferView', None); a.pop('byteOffset', None); a.pop('sparse', None)
    blobs.append((a, data)); return ('NEW', len(blobs) - 1)
anim = {'name': clip, 'samplers': [], 'channels': []}
for s in src['samplers']:
    anim['samplers'].append({'input': add(s['input']), 'output': add(s['output']), 'interpolation': s.get('interpolation', 'LINEAR')})
for c in src['channels']:
    nn = new['nodes'][c['target']['node']].get('name')
    anim['channels'].append({'sampler': c['sampler'], 'target': {'node': names[nn], 'path': c['target']['path']}})
idx = next(i for i, a in enumerate(base['animations']) if a['name'] == clip)
base['animations'][idx] = anim

# 原本的 buffer 一個位元組都不動，新的 groom 資料接在後面（舊 groom 的資料留著不引用）
out = bytearray(bb)
def push(data):
    while len(out) % 4: out.append(0)
    base['bufferViews'].append({'buffer': 0, 'byteOffset': len(out), 'byteLength': len(data)})
    out.extend(data); return len(base['bufferViews']) - 1
new_acc = {}
for k, (a, data) in enumerate(blobs):
    a['bufferView'] = push(data); base['accessors'].append(a); new_acc[k] = len(base['accessors']) - 1
for s_ in anim['samplers']:
    s_['input'] = new_acc[s_['input'][1]]; s_['output'] = new_acc[s_['output'][1]]
while len(out) % 4: out.append(0)
base['buffers'][0]['byteLength'] = len(out)
js = json.dumps(base, separators=(',', ':'), ensure_ascii=False).encode()
while len(js) % 4: js += b' '
total = 12 + 8 + len(js) + 8 + len(out)
with open(sys.argv[3], 'wb') as f:
    f.write(struct.pack('<III', 0x46546C67, 2, total))
    f.write(struct.pack('<II', len(js), 0x4E4F534A)); f.write(js)
    f.write(struct.pack('<II', len(out), 0x004E4942)); f.write(out)
print('ok', sys.argv[3], total)
