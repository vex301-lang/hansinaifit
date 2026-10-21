/* PHOTO BOOTH 1.0
 * Fixed-photo, still-image face compositing. No live AR, API keys, upload endpoints,
 * identity embeddings, analytics, or persistent storage of participant photographs.
 * The optional face-landmark runtime is loaded only as a static dependency.
 */
(() => {
'use strict';
const $=id=>document.getElementById(id), F=window.FacePhoto;
const view=$('result'), ctx=view.getContext('2d'), guides=$('guides'), gx=guides.getContext('2d');
const video=$('video'), sourceView=$('sourceView'), sx=sourceView.getContext('2d');
const base=document.createElement('canvas'), bx=base.getContext('2d',{willReadFrequently:true});
const raw=document.createElement('canvas'), rx=raw.getContext('2d',{willReadFrequently:true});
base.width=1440;base.height=1080;
const S={ready:false,stage:'welcome',count:1,slot:0,booth:new URLSearchParams(location.search).get('mode')!=='studio',
 stream:null,front:true,session:0,operation:0,cameraTicket:0,starting:false,counting:false,model:null,modelPromise:null,
 modelEpoch:0,backend:null,backendPromise:null,refined:false,sourceReady:false,faces:[],assignments:new Map(),targets:[],
 manual:null,selected:0,urls:new Set(),lastActivity:performance.now(),lastIdle:-1,log:[],busy:false,wake:null,printWindow:null};
const clamp=(x,a,b)=>Math.min(b,Math.max(a,x));
const transform=(x,y,slot)=>({x:x*.78+(slot?503:83),y:y*.78+(slot?75:87)});
const fallbackPoints=[F.synthetic([[507.5,203.5],[567.5,203.5],[535,264]].map(([x,y])=>transform(x,y,0))),F.synthetic([[500,222],[570,223],[535,291]].map(([x,y])=>transform(x,y,1)))];
const REFERENCE_BOXES=[{x:385,y:110,w:240,h:260},{x:808,y:110,w:240,h:295}];
const options=()=>({size:100,offsetX:0,offsetY:0,feather:8,tone:40});
function text(id,t){if($(id).textContent!==t)$(id).textContent=t;}
function status(t,kind=''){text('status',t);$('dot').className='status-dot '+kind;}
function log(tag,e){S.log.push(tag+': '+String(e?.message||e).slice(0,180));S.log=S.log.slice(-10);text('diagnostics','PHOTO BOOTH 1.0\n'+S.log.join('\n'));}
function activity(){S.lastActivity=performance.now();}
function timeout(p,ms,message,late){let done=false;return new Promise((resolve,reject)=>{const timer=setTimeout(()=>{done=true;reject(new Error(message));},ms);Promise.resolve(p).then(v=>{if(done){late?.(v);return;}done=true;clearTimeout(timer);resolve(v);},e=>{if(done)return;done=true;clearTimeout(timer);reject(e);});});}
const pause=ms=>new Promise(r=>setTimeout(r,ms));
const paint=()=>new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)));
function valid(ticket,operation){return ticket===S.session&&(operation==null||operation===S.operation);}
function dropCanvas(c){c.width=1;c.height=1;}
function urlFor(blob){const u=URL.createObjectURL(blob);S.urls.add(u);return u;}
function revoke(u){if(S.urls.delete(u))URL.revokeObjectURL(u);}
function setStage(name){S.stage=name;for(const n of ['welcome','camera','processing','manual','result'])$(n+'Panel').hidden=n!==name;
 $('stage').hidden=['camera','manual'].includes(name);$('cameraStage').hidden=name!=='camera';$('sourceArea').hidden=name!=='manual';
 $('guides').classList.toggle('no-interaction',name!=='welcome');
 const step=name==='welcome'?'welcome':name==='result'?'result':'camera';
 document.querySelectorAll('[data-step]').forEach(el=>el.classList.toggle('current',el.dataset.step===step));
 text('heading',name==='result'?'오늘의 교복 사진이 완성됐어요.':name==='camera'?'카메라를 보고 웃어 주세요.':name==='manual'?'얼굴 위치를 함께 맞춰요.':'교복 입은 나를 만나 보세요.');
 text('viewLabel',name==='camera'?'카메라 촬영 준비':name==='manual'?'촬영 원본 · 얼굴 위치 지정':name==='result'?'완성된 합성 사진':'오늘의 교복 사진');
 text('pictureTag',name==='result'?'촬영 후 합성 완료':'고정 배경 · 고정 교복');drawGuides();activity();}
function render(){if(!S.ready)return;ctx.setTransform(1,0,0,1,0,0);ctx.clearRect(0,0,view.width,view.height);ctx.drawImage(base,0,0);
 if(S.sourceReady)for(const [slot,idx] of S.assignments){const points=S.faces[idx];if(!points)continue;const t=S.targets[slot];try{const tile=F.composite(t,raw,points);if(tile)ctx.drawImage(tile,t.box.x,t.box.y,t.box.w,t.box.h);}catch(e){log('composite',e);status('얼굴을 그리지 못했습니다. 사진을 다시 선택해 주세요.','error');}}
 const label=S.assignments.size?'교복 체험 · 합성 사진':'교복 체험 · 기준 사진';ctx.fillStyle='rgba(16,40,31,.65)';ctx.fillRect(0,view.height-45,view.width,45);ctx.fillStyle='#fff';ctx.font='500 18px system-ui';ctx.fillText(label,26,view.height-16);ctx.font='400 14px system-ui';ctx.textAlign='right';ctx.fillText('HANSIN PHOTO STUDIO',view.width-24,view.height-17);ctx.textAlign='left';}
function drawGuides(){gx.clearRect(0,0,guides.width,guides.height);if(!S.ready||S.stage!=='welcome')return;
 S.targets.forEach((t,i)=>{const selected=S.count===2||S.slot===i;if(!selected)return;const b=t.box;gx.strokeStyle='#f6e1a9';gx.lineWidth=3;gx.setLineDash([8,7]);gx.beginPath();gx.ellipse(b.x+b.w/2,b.y+b.h/2,b.w*.59,b.h*.60,0,0,Math.PI*2);gx.stroke();gx.setLineDash([]);gx.fillStyle='#153e31dd';gx.fillRect(b.x-6,b.y+b.h+16,b.w+12,34);gx.fillStyle='#fff';gx.font='600 18px system-ui';gx.textAlign='center';gx.fillText(i===0?'왼쪽 얼굴':'오른쪽 얼굴',b.x+b.w/2,b.y+b.h+39);gx.textAlign='left';});}
function eventPoint(e,c){const b=c.getBoundingClientRect(),s=Math.min(b.width/c.width,b.height/c.height),ox=(b.width-c.width*s)/2,oy=(b.height-c.height*s)/2;const p={x:(e.clientX-b.left-ox)/s,y:(e.clientY-b.top-oy)/s};return p.x>=0&&p.y>=0&&p.x<c.width&&p.y<c.height?p:null;}
function chooseCount(n){if(S.stage!=='welcome')return;S.count=n;document.querySelectorAll('[data-count]').forEach(b=>{const on=+b.dataset.count===n;b.classList.toggle('selected',on);b.setAttribute('aria-pressed',on);});$('slotField').hidden=n===2;$('faceGuides').classList.toggle('pair',n===2);drawGuides();}
function chooseSlot(n){if(S.stage!=='welcome')return;S.slot=n;document.querySelectorAll('[data-slot]').forEach(b=>{const on=+b.dataset.slot===n;b.classList.toggle('selected',on);b.setAttribute('aria-pressed',on);});drawGuides();}
function cameraRelease(){S.cameraTicket++;if(S.stream)S.stream.getTracks().forEach(t=>t.stop());S.stream=null;video.pause();video.srcObject=null;S.starting=false;S.counting=false;$('capture').disabled=true;$('countdown').hidden=true;}
function reset(message='다음 체험을 준비했습니다. 촬영 사진은 화면에서 지웠습니다.'){
 S.session++;S.operation++;cameraRelease();S.busy=false;S.sourceReady=false;S.faces=[];S.assignments.clear();S.manual=null;dropCanvas(raw);dropCanvas(sourceView);
 for(const t of S.targets){t.ctx.clearRect(0,0,t.w,t.h);t.opts=options();F.updateTarget(t,base);}for(const u of [...S.urls])revoke(u);
 if(S.printWindow&&!S.printWindow.closed){try{S.printWindow.close();}catch(_){}}S.printWindow=null;
 S.modelEpoch++;if(S.model)try{S.model.close();}catch(_){}S.model=null;S.modelPromise=null;
 $('photoFile').value='';$('consent').checked=false;$('sourceChoices').replaceChildren();$('adjustments').open=false;$('idleWarning').hidden=true;S.lastIdle=-1;
 $('start').disabled=!S.ready;$('start').textContent='카메라로 시작 →';setStage('welcome');render();status(message,'good');
}
function allow(){if(!S.ready){status('기준 사진이 아직 준비되지 않았습니다.','error');return false;}if(!$('consent').checked){status('촬영·합성에 대한 허락 확인란을 체크해 주세요.','error');$('consent').focus();return false;}return true;}
function cameraError(e){const map={NotAllowedError:'카메라 권한을 허용해 주세요. 이미 차단했다면 브라우저의 사이트 설정에서 카메라를 허용해 주세요.',NotFoundError:'사용할 카메라가 없습니다. 사진 파일로도 체험할 수 있습니다.',NotReadableError:'다른 프로그램이 카메라를 사용 중일 수 있습니다.',InsecureContext:'HTTPS 웹주소 또는 이 컴퓨터의 localhost에서 열어 주세요.',CameraTimeout:'카메라 권한 응답을 기다리다 멈췄습니다. 다시 시작해 주세요.',VideoTimeout:'카메라 영상이 준비되지 않았습니다. 다시 시작해 주세요.'};return map[e.name]||map[e.message]||('카메라를 열 수 없습니다: '+e.message);}
async function startCamera(){if(S.starting||!allow())return;S.operation++;cameraRelease();const ticket=S.session,cameraTicket=S.cameraTicket;S.starting=true;setStage('camera');status('카메라 권한을 허용해 주세요.');$('flip').disabled=true;
 try{if(!isSecureContext||!navigator.mediaDevices?.getUserMedia)throw new Error('InsecureContext');
 const stream=await timeout(navigator.mediaDevices.getUserMedia({audio:false,video:{facingMode:{ideal:S.front?'user':'environment'},width:{ideal:1600},height:{ideal:1200},frameRate:{ideal:24,max:30}}}),25000,'CameraTimeout',s=>s.getTracks().forEach(t=>t.stop()));
 if(!valid(ticket)||cameraTicket!==S.cameraTicket){stream.getTracks().forEach(t=>t.stop());return;}S.stream=stream;video.srcObject=stream;video.style.transform=S.front?'scaleX(-1)':'none';await timeout(video.play(),12000,'VideoTimeout');
 for(let i=0;i<50&&(!video.videoWidth||video.readyState<2);i++){await pause(100);if(!valid(ticket)||cameraTicket!==S.cameraTicket)return;}
 if(!video.videoWidth)throw new Error('VideoTimeout');if(!valid(ticket)||cameraTicket!==S.cameraTicket)return;
 $('capture').disabled=false;$('flip').disabled=false;status('준비가 되면 촬영 버튼을 눌러 주세요.','good');
 }catch(e){if(!valid(ticket)||cameraTicket!==S.cameraTicket)return;cameraRelease();setStage('welcome');status(cameraError(e),'error');log('camera',e);}
 finally{if(valid(ticket)&&cameraTicket===S.cameraTicket)S.starting=false;}}
async function capture(){if(!S.stream||S.counting||!video.videoWidth)return;S.counting=true;const ticket=S.session,ct=S.cameraTicket;$('capture').disabled=true;$('flip').disabled=true;$('countdown').hidden=false;
 for(let n=+$('countSeconds').value;n>0;n--){text('countdown',String(n));await pause(1000);if(!valid(ticket)||ct!==S.cameraTicket)return;}
 try{const k=Math.min(1,1600/Math.max(video.videoWidth,video.videoHeight));raw.width=Math.round(video.videoWidth*k);raw.height=Math.round(video.videoHeight*k);rx.save();if(S.front){rx.translate(raw.width,0);rx.scale(-1,1);}rx.drawImage(video,0,0,raw.width,raw.height);rx.restore();S.sourceReady=true;cameraRelease();await analyzeSource(ticket);}
 catch(e){cameraRelease();setStage('welcome');status('촬영하지 못했습니다. 다시 시작해 주세요.','error');log('capture',e);}}
async function loadFile(file){if(!file||!allow())return;const ticket=++S.session;S.operation++;cameraRelease();S.assignments.clear();S.faces=[];S.sourceReady=false;dropCanvas(raw);
 if(file.size>20*1024*1024){status('20MB 이하의 JPG·PNG·WebP 사진을 사용해 주세요.','error');return;}
 const url=urlFor(file);setStage('processing');text('processMessage','사진 파일을 읽고 있습니다.');
 try{const im=new Image();im.decoding='async';await timeout(new Promise((res,rej)=>{im.onload=res;im.onerror=()=>rej(new Error('사진 형식을 읽지 못했습니다. JPG 또는 PNG로 변환해서 다시 선택해 주세요.'));im.src=url;}),18000,'사진을 읽는 시간이 초과되었습니다.');if(!valid(ticket))return;
 if(im.naturalWidth*im.naturalHeight>60000000)throw new Error('사진 해상도가 너무 큽니다. 6천만 화소 이하 사진을 사용해 주세요.');
 const f=Math.min(1,1600/Math.max(im.naturalWidth,im.naturalHeight));raw.width=Math.round(im.naturalWidth*f);raw.height=Math.round(im.naturalHeight*f);rx.drawImage(im,0,0,raw.width,raw.height);S.sourceReady=true;await analyzeSource(ticket);
 }catch(e){if(valid(ticket)){setStage('welcome');status(e.message,'error');log('photo',e);}}finally{revoke(url);$('photoFile').value='';}}
async function loadBackend(){if(S.backend)return S.backend;if(S.backendPromise)return S.backendPromise;
 S.backendPromise=(async()=>{let config={local:false};try{const c=await fetch('./runtime.json',{cache:'no-cache'});if(c.ok)config=await c.json();}catch(_){}
 const endpoints=config.local?['./vendor/vision']:['https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.21','https://unpkg.com/@mediapipe/tasks-vision@0.10.21'];let last;
 for(const endpoint of endpoints){try{const absolute=new URL(endpoint+'/',document.baseURI).href;const api=await timeout(import(absolute+'vision_bundle.mjs'),11000,'얼굴 인식 프로그램 연결 시간이 초과되었습니다.');const files=await timeout(api.FilesetResolver.forVisionTasks(absolute+'wasm'),9000,'WASM 준비 시간이 초과되었습니다.');
 const url=config.local?'./models/face_landmarker.task':'https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task';const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),22000);let bytes;
 try{const r=await fetch(url,{signal:controller.signal,credentials:'omit',referrerPolicy:'no-referrer'});if(!r.ok)throw new Error('모델 다운로드 HTTP '+r.status);bytes=new Uint8Array(await r.arrayBuffer());}finally{clearTimeout(timer);}
 S.backend={api,files,bytes};return S.backend;
 }catch(e){last=e;log('model download',e);}}
 throw last||new Error('얼굴 인식 프로그램에 연결할 수 없습니다.');})().finally(()=>{S.backendPromise=null;});return S.backendPromise;
}
async function getModel(){if(S.model)return S.model;if(S.modelPromise)return S.modelPromise;const epoch=S.modelEpoch;
 text('modelStatus','자동 얼굴 인식 프로그램을 준비하고 있습니다. 수동 지정은 인터넷 없이도 사용할 수 있습니다.');
 const promise=(async()=>{const {api,files,bytes}=await loadBackend();if(epoch!==S.modelEpoch)throw new Error('취소된 준비');
 const m=await timeout(api.FaceLandmarker.createFromOptions(files,{baseOptions:{modelAssetBuffer:bytes,delegate:'CPU'},runningMode:'IMAGE',numFaces:4,minFaceDetectionConfidence:.45,minFacePresenceConfidence:.5,minTrackingConfidence:.5,outputFaceBlendshapes:false,outputFacialTransformationMatrixes:false}),25000,'얼굴 인식 초기화 시간이 초과되었습니다.',m=>{try{m.close();}catch(_){}});
 if(epoch!==S.modelEpoch){try{m.close();}catch(_){}throw new Error('취소된 준비');}S.model=m;text('modelStatus','자동 얼굴 인식 준비 완료 · 사진을 찍은 뒤 한 번 분석합니다.');return m;})();S.modelPromise=promise;
 try{return await promise;}finally{if(S.modelPromise===promise)S.modelPromise=null;}}
async function refineTargets(model,ticket,op){if(S.refined)return;let found=0;for(let slot=0;slot<2;slot++){if(!valid(ticket,op))return;const b=REFERENCE_BOXES[slot],c=document.createElement('canvas');c.width=b.w*2;c.height=b.h*2;c.getContext('2d').drawImage(base,b.x,b.y,b.w,b.h,0,0,c.width,c.height);try{const out=model.detect(c),lm=out.faceLandmarks?.[0];if(lm){const points=lm.map(p=>({x:b.x+p.x*b.w,y:b.y+p.y*b.h}));S.targets[slot]=F.makeTarget(points,base,options());found++;}}catch(e){log('reference',e);}dropCanvas(c);await paint();}if(found===2)S.refined=true;}
async function analyzeSource(ticket=S.session){if(!valid(ticket)||!S.sourceReady)return;const op=++S.operation;S.busy=true;S.manual=null;S.faces=[];S.assignments.clear();setStage('processing');text('processMessage','\uB208\u00B7\uCF54\u00B7\uC785\uC744 \uCC3E\uACE0, \uAE30\uC900 \uC0AC\uC9C4\uC758 \uC5BC\uAD74\uC5D0 \uB9DE\uCDA5\uB2C8\uB2E4.');status('사진 분석 중 · 실시간 AR이 아니라 촬영한 한 장을 합성합니다.');render();await paint();
 try{const model=await getModel();if(!valid(ticket,op))return;text('processMessage','기준 사진과 촬영한 사진의 얼굴 위치를 맞추고 있습니다.');await refineTargets(model,ticket,op);if(!valid(ticket,op))return;
 const out=model.detect(raw);if(!valid(ticket,op))return;S.faces=(out.faceLandmarks||[]).map(l=>l.map(p=>({x:p.x*raw.width,y:p.y*raw.height}))).filter(p=>F.frame(p).d>=10);
 S.faces.sort((a,b)=>F.frame(b).d-F.frame(a).d);if(S.count===2)S.faces=S.faces.slice(0,2).sort((a,b)=>F.frame(a).c.x-F.frame(b).c.x);
 if(S.faces.length<S.count){beginManual(S.faces.length?'두 명의 얼굴을 모두 찾지 못했습니다. 각 얼굴의 눈과 입을 직접 눌러 주세요.':'얼굴을 찾지 못했습니다. 정면 사진을 사용하거나 눈과 입을 직접 눌러 주세요.');return;}
 if(S.count===1)S.assignments.set(S.slot,0);else{S.assignments.set(0,0);S.assignments.set(1,1);}showResult();
 }catch(e){if(!valid(ticket,op))return;log('face detection',e);text('modelStatus','자동 인식을 불러오지 못했습니다. 인터넷 연결을 확인하거나 세 점 수동 지정을 사용할 수 있습니다.');beginManual('자동 인식 연결이 안 되었습니다. 촬영한 사진에서 눈 두 곳과 입 한 곳을 눌러 합성해 주세요.');}
 finally{if(valid(ticket,op))S.busy=false;}}
function showResult(){S.busy=false;S.manual=null;S.selected=S.count===1?S.slot:0;setStage('result');render();syncAdjust();status('합성 사진이 완성되었습니다. 눈·입과 얼굴 경계를 확인해 주세요.','good');const hasSmall=[...S.assignments.values()].some(i=>F.frame(S.faces[i]).d<38);text('resultInfo',hasSmall?'원본 얼굴이 작아서 선명도가 낮을 수 있어요. 카메라에 가까이서 다시 찍으면 좋아요.':S.count===1?'선택한 자리의 얼굴만 합성했어요. 다른 자리는 기준 사진의 모델입니다.':'두 얼굴을 사진의 왼쪽·오른쪽 순서로 맞췄어요.');}
function beginManual(message='촬영 원본에서 화면 왼쪽 눈, 오른쪽 눈, 입 가운데를 눌러 주세요.'){
 if(!S.sourceReady){status('사진을 먼저 촬영하거나 선택해 주세요.','error');return;}S.operation++;S.busy=false;S.assignments.clear();S.faces=[];S.manual={index:0,points:[]};setStage('manual');text('manualDescription',message);drawManual();status('눈 두 곳과 입 한 곳을 차례로 지정해 주세요.');}
function drawManual(){if(!S.sourceReady||!S.manual)return;sourceView.width=raw.width;sourceView.height=raw.height;sx.drawImage(raw,0,0);const d=Math.max(3,raw.width/180);for(const [i,p]of S.manual.points.entries()){sx.strokeStyle='#ffe5a1';sx.lineWidth=d*.65;sx.beginPath();sx.arc(p.x,p.y,d*1.9,0,Math.PI*2);sx.stroke();sx.fillStyle='#fff';sx.font=`bold ${d*4}px system-ui`;sx.fillText(String(i+1),p.x+d*3,p.y);}
 const part=S.count===2?(S.manual.index===0?'왼쪽 자리에 넣을 얼굴':'오른쪽 자리에 넣을 얼굴'):'내 얼굴';const names=['화면 왼쪽 눈','화면 오른쪽 눈','입 가운데'];text('manualProgress',part+' · '+names[S.manual.points.length]+'을 눌러 주세요.');text('manualHint','촬영 원본: 왼쪽 눈 → 오른쪽 눈 → 입 가운데 · '+S.manual.points.length+'/3');}
function manualClick(e){if(!S.manual||S.stage!=='manual')return;const p=eventPoint(e,sourceView);if(!p)return;S.manual.points.push(p);if(S.manual.points.length===3){const q=S.manual.points;if(Math.hypot(q[0].x-q[1].x,q[0].y-q[1].y)<8){S.manual.points=[];status('두 눈의 간격이 너무 좁습니다. 정확히 다시 눌러 주세요.','error');drawManual();return;}const f=F.synthetic(q);S.faces.push(f);const index=S.manual.index;S.assignments.set(S.count===1?S.slot:index,index);if(S.count===2&&index===0){S.manual={index:1,points:[]};drawManual();return;}showResult();text('resultInfo','세 점 수동 맞춤으로 합성했어요. 자동 인식보다 윤곽이 덜 정확할 수 있어요.');}else drawManual();}
function syncAdjust(){const select=$('editSlot');select.replaceChildren();for(const slot of S.assignments.keys()){const o=document.createElement('option');o.value=slot;o.textContent=slot?'사진의 오른쪽':'사진의 왼쪽';select.append(o);}select.value=S.selected;const opts=S.targets[S.selected].opts;for(const key of ['size','offsetX','offsetY','feather','tone']){$(key).value=opts[key];text(key+'Value',String(opts[key])+(['offsetX','offsetY'].includes(key)?'':'%'));}
 const list=$('sourceChoices');list.replaceChildren();if(S.faces.length>1){const label=document.createElement('p');label.textContent='이 자리에 넣을 촬영 얼굴';list.append(label);S.faces.forEach((_,i)=>{const b=document.createElement('button');b.textContent='촬영 얼굴 '+(i+1);b.className='face-choice'+(S.assignments.get(S.selected)===i?' selected':'');b.onclick=()=>{if(S.count===2){const other=1-S.selected,previous=S.assignments.get(S.selected);if(S.assignments.get(other)===i)S.assignments.set(other,previous);}S.assignments.set(S.selected,i);render();syncAdjust();};list.append(b);});}}
function saveBlob(){return new Promise((resolve,reject)=>view.toBlob(b=>b?resolve(b):reject(new Error('사진 파일을 만들지 못했습니다.')),'image/jpeg',.95));}
async function download(){if(!S.assignments.size)return;const ticket=S.session;try{const blob=await saveBlob();if(!valid(ticket))return;const u=urlFor(blob),a=document.createElement('a');a.href=u;a.download='uniform-photo-'+new Date().toISOString().replace(/[:.]/g,'-')+'.jpg';document.body.append(a);a.click();a.remove();setTimeout(()=>revoke(u),60000);status('저장을 요청했습니다. 브라우저의 다운로드 항목을 확인해 주세요.','good');}catch(e){status(e.message,'error');}}
async function printPhoto(){if(!S.assignments.size)return;const ticket=S.session;const w=window.open('','_blank');if(!w){status('인쇄 창이 차단되었습니다. 팝업을 허용하거나 사진을 저장한 뒤 인쇄해 주세요.','error');return;}S.printWindow=w;w.document.title='교복 체험 합성 사진';w.document.body.textContent='인쇄할 사진을 준비하고 있습니다.';
 try{const blob=await saveBlob();if(!valid(ticket)){w.close();return;}const url=urlFor(blob);w.document.body.replaceChildren();const style=w.document.createElement('style');style.textContent='@page{size:landscape;margin:8mm}body{margin:0;display:grid;place-items:center;min-height:90vh}img{width:100%;height:auto;max-height:95vh;object-fit:contain}';w.document.head.append(style);const im=w.document.createElement('img');im.alt='교복 체험 합성 사진';im.src=url;w.document.body.append(im);await im.decode();w.onafterprint=()=>{revoke(url);try{w.close();}catch(_){}};w.focus();w.print();}catch(e){w.close();status('인쇄를 준비하지 못했습니다. 사진을 저장해 사용해 주세요.','error');log('print',e);}}
function mode(){document.body.classList.toggle('booth',S.booth);text('mode',S.booth?'일반 화면':'부스 화면');activity();}
async function fullscreen(){try{if(document.fullscreenElement)await document.exitFullscreen();else if(document.documentElement.requestFullscreen)await document.documentElement.requestFullscreen();else throw new Error('이 브라우저는 전체 화면 버튼을 지원하지 않습니다. 브라우저 전체 화면 기능을 사용해 주세요.');if(navigator.wakeLock&&document.visibilityState==='visible')S.wake=await navigator.wakeLock.request('screen');}catch(e){status(e.message||'전체 화면으로 전환하지 못했습니다. 일반 화면으로 사용할 수 있습니다.','error');}}
function idleTick(){if(!S.booth||S.stage==='welcome'){$('idleWarning').hidden=true;return;}const duration=+$('idleSeconds').value;if(!duration){$('idleWarning').hidden=true;return;}const remaining=Math.ceil(duration-(performance.now()-S.lastActivity)/1000);if(remaining<=0){reset('일정 시간 조작이 없어 촬영 사진을 지우고 처음 화면으로 돌아왔습니다.');return;}if(remaining<=15){$('idleWarning').hidden=false;if(remaining!==S.lastIdle)text('idleWarning',remaining+'초 후 사진을 지우고 처음으로 돌아갑니다. 계속 사용하려면 화면을 눌러 주세요.');S.lastIdle=remaining;}else $('idleWarning').hidden=true;}
function bind(){document.querySelectorAll('[data-count]').forEach(b=>b.onclick=()=>chooseCount(+b.dataset.count));document.querySelectorAll('[data-slot]').forEach(b=>b.onclick=()=>chooseSlot(+b.dataset.slot));
 guides.onclick=e=>{if(S.stage!=='welcome'||S.count!==1)return;const p=eventPoint(e,guides);if(!p)return;const d=S.targets.map(t=>Math.hypot(F.frame(t.dest).c.x-p.x,F.frame(t.dest).c.y-p.y));chooseSlot(d[0]<d[1]?0:1);};
 $('start').onclick=startCamera;$('upload').onclick=()=>{if(allow())$('photoFile').click();};$('photoFile').onchange=e=>loadFile(e.target.files[0]);$('capture').onclick=capture;$('flip').onclick=()=>{if(S.counting)return;S.front=!S.front;startCamera();};
 $('cancel').onclick=()=>reset();$('cancelProcessing').onclick=()=>reset();$('next').onclick=()=>reset();$('resetAll').onclick=()=>reset();
 $('retake').onclick=()=>{reset('다시 촬영할 수 있습니다. 허락 확인 후 시작해 주세요.');};$('manualCancel').onclick=()=>reset('다시 촬영하거나 정면 사진을 선택해 주세요.');
 $('skipAuto').onclick=()=>beginManual();$('undoManual').onclick=()=>beginManual();$('retryAuto').onclick=()=>analyzeSource();sourceView.onclick=manualClick;
 $('download').onclick=download;$('print').onclick=printPhoto;$('fullscreen').onclick=fullscreen;$('mode').onclick=()=>{S.booth=!S.booth;mode();};
 $('editSlot').onchange=()=>{S.selected=+$('editSlot').value;syncAdjust();};
 for(const k of ['size','offsetX','offsetY','feather','tone'])$(k).oninput=()=>{if(!S.assignments.size)return;const t=S.targets[S.selected];t.opts[k]=+$(k).value;F.updateTarget(t,base);text(k+'Value',$(k).value+(['offsetX','offsetY'].includes(k)?'':'%'));render();};
 $('resetAdjust').onclick=()=>{if(!S.assignments.size)return;const t=S.targets[S.selected];t.opts=options();F.updateTarget(t,base);render();syncAdjust();};
 $('prepareModel').onclick=async()=>{const b=$('prepareModel');b.disabled=true;try{await getModel();status('자동 얼굴 인식이 준비됐습니다.','good');}catch(e){log('prepare',e);text('modelStatus','자동 인식을 준비하지 못했습니다. 네트워크를 확인해 주세요. 세 점 수동 지정도 사용할 수 있습니다.');status('자동 인식을 준비하지 못했습니다. 수동 지정으로 체험할 수 있습니다.','error');}finally{b.disabled=false;}};
 for(const type of ['pointerdown','keydown','input'])document.addEventListener(type,activity,{passive:true});
 document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='hidden'&&(S.stream||S.starting)){reset('화면을 벗어나 카메라를 끄고 사진을 지웠습니다.');}if(document.visibilityState==='hidden'&&S.wake){S.wake.release().catch(()=>{});S.wake=null;}});
 window.addEventListener('pagehide',()=>reset('체험을 종료했습니다.'));window.addEventListener('pageshow',e=>{if(e.persisted)reset('새 체험을 시작해 주세요.');});
}
async function boot(){bind();mode();setInterval(idleTick,1000);try{const im=new Image();await timeout(new Promise((res,rej)=>{im.onload=res;im.onerror=()=>rej(new Error('assets/scene.jpg를 찾지 못했습니다. ZIP의 assets 폴더도 함께 올려 주세요.'));im.src='./assets/scene.jpg';}),15000,'기준 사진을 불러오는 시간이 초과되었습니다.');bx.drawImage(im,0,0,1440,1080);S.targets=fallbackPoints.map(p=>F.makeTarget(p,base,{...options(),manual:true}));S.ready=true;$('baseLoading').hidden=true;$('start').disabled=false;render();drawGuides();status('허락 확인 후 촬영하거나 찍어 둔 사진을 선택해 주세요.','good');}
 catch(e){text('baseLoading',e.message);status(e.message,'error');log('startup',e);}}
boot();
})();