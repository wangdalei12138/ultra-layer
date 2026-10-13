#!/usr/bin/env python3
"""Read family/style names from ordinary sfnt TTF/OTF without dependencies."""
import json
import struct
import sys
from pathlib import Path

def inspect(filename):
    data = Path(filename).read_bytes()
    if data[:4] == b'ttcf':
        raise ValueError('TTC collections are not supported; use a TTF/OTF face')
    count = struct.unpack_from('>H', data, 4)[0]
    for i in range(count):
        tag, _, offset, length = struct.unpack_from('>4sIII', data, 12 + i * 16)
        if tag == b'name':
            break
    else:
        raise ValueError('No sfnt name table found')
    _, count, strings = struct.unpack_from('>HHH', data, offset)
    names = []
    for i in range(count):
        platform, encoding, language, name_id, length, start = struct.unpack_from('>HHHHHH', data, offset + 6 + 12 * i)
        if name_id not in (1, 2, 6, 16, 17) or platform not in (0, 3):
            continue
        value = data[offset + strings + start:offset + strings + start + length].decode('utf-16-be')
        record = {'id': name_id, 'language': language, 'value': value}
        if record not in names:
            names.append(record)
    return {'file': str(filename), 'names': names}

if __name__ == '__main__':
    if len(sys.argv) < 2:
        raise SystemExit('Usage: inspect_font.py font.ttf [font.otf ...]')
    print(json.dumps([inspect(f) for f in sys.argv[1:]], ensure_ascii=False, indent=2))
