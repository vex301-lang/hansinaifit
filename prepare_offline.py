#!/usr/bin/env python3
"""Optional: download pinned runtime/model files; never reads participant photos.
Run once on an internet-connected computer with Python 3.
Only switches runtime.json to local after ALL downloads succeed.
"""
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path
from urllib.request import urlopen, Request
import json
import hashlib

ROOT=Path(__file__).resolve().parent
BASE='https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.21'
FILES={
 'vendor/vision/vision_bundle.mjs':BASE+'/vision_bundle.mjs',
 'vendor/vision/wasm/vision_wasm_internal.js':BASE+'/wasm/vision_wasm_internal.js',
 'vendor/vision/wasm/vision_wasm_internal.wasm':BASE+'/wasm/vision_wasm_internal.wasm',
 'vendor/vision/wasm/vision_wasm_nosimd_internal.js':BASE+'/wasm/vision_wasm_nosimd_internal.js',
 'vendor/vision/wasm/vision_wasm_nosimd_internal.wasm':BASE+'/wasm/vision_wasm_nosimd_internal.wasm',
 'models/face_landmarker.task':'https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task',
 'licenses/mediapipe-LICENSE.txt':'https://raw.githubusercontent.com/google-ai-edge/mediapipe/master/LICENSE',
}
def download(item):
    path,url=item
    req=Request(url,headers={'User-Agent':'PhotoBooth-OfflineSetup/1.0'})
    with urlopen(req,timeout=90) as response:
        data=response.read()
    if not data or data[:15].lower().startswith(b'<!doctype html'):
        raise ValueError(f'Invalid download: {url}')
    dest=ROOT/path;dest.parent.mkdir(parents=True,exist_ok=True)
    temp=dest.with_suffix(dest.suffix+'.part');temp.write_bytes(data);temp.replace(dest)
    print(f'OK {path} ({len(data):,} bytes)')
    return {'path':path,'url':url,'bytes':len(data),'sha256':hashlib.sha256(data).hexdigest()}
if __name__=='__main__':
    try:
        with ThreadPoolExecutor(max_workers=3) as pool:
            manifest=list(pool.map(download,FILES.items()))
    except Exception as error:
        raise SystemExit(f'Download failed: {error}\nLocal mode was NOT enabled. Check connection and retry.')
    (ROOT/'runtime.json').write_text(json.dumps({'local':True,'version':'0.10.21'})+'\n')
    (ROOT/'offline-manifest.json').write_text(json.dumps(manifest,indent=2)+'\n')
    print('Offline files ready. Start with: python start_local.py')
