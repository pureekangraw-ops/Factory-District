const $=id=>document.getElementById(id);
let mode='FACTORY',selectedWork=null,readSequence=0;
function status(text){$('status').textContent=text;}
async function get(path){const r=await fetch(path,{cache:'no-store'});if(!r.ok)throw new Error('APP_UNAVAILABLE');return r.json();}
for(const [id,value] of [['factory','FACTORY'],['maintenance','MAINTENANCE']]) $(id).onclick=()=>{
 mode=value;for(const other of ['factory','maintenance']){const active=other===id;$(other).classList.toggle('selected',active);$(other).setAttribute('aria-pressed',String(active));}
 $('lane').textContent=value==='FACTORY'?'เตรียมโจทย์โรงงาน':'เตรียมโจทย์ซ่อมบำรุง';
};
$('refresh').onclick=async()=>{
 $('refresh').disabled=true;selectedWork=null;readSequence++;$('readback').textContent='ยังไม่ได้เลือก Work';$('works').replaceChildren();
 try{
 const current=await get('/api/arrival');
 if(current.status==='UNKNOWN'){$('connection').textContent='UNKNOWN · '+current.reason;status('ยังอ่านข้อมูลจริงจากเมโทรไม่ได้');return;}
 $('connection').textContent='อ่านเมโทรแล้ว · '+current.actor;
 $('actor').textContent=`บัญชี ${current.actor} · ตรวจเมื่อ ${current.observedAt ?? 'UNKNOWN'}`;
 const works=current.current.works;
 if(!works.length)status('ยังไม่มี Work ที่ได้รับสิทธิ์จากเมโทร');else status('เลือก Work เพื่ออ่านผลปัจจุบัน');
 for(const work of works){const button=document.createElement('button');button.className='work';const name=document.createElement('strong');name.textContent=work.workId;const info=document.createElement('small');info.textContent=`${work.state??'UNKNOWN'} · checkpoint ${work.checkpointId??'UNKNOWN'}`;button.append(name,info);button.onclick=async()=>{
 button.disabled=true;selectedWork=null;const sequence=++readSequence;try{const result=await get('/api/work?workId='+encodeURIComponent(work.workId));if(sequence!==readSequence)return;if(result.status==='UNKNOWN'){selectedWork=null;status(result.reason);}else selectedWork={workId:result.record.workId,checkpointId:result.record.checkpointId};$('readback').textContent=JSON.stringify(result,null,2);}catch{status('อ่าน Work ไม่สำเร็จ');}finally{button.disabled=false;}};$('works').append(button);}
 }catch{$('connection').textContent='UNKNOWN';status('แอปยังติดต่อเซิร์ฟเวอร์ไม่ได้');}finally{$('refresh').disabled=false;}
};
$('copy').onclick=async()=>{
 if(!$('problem').value.trim()||!$('outcome').value.trim()){status('เติมโจทย์และผลที่ต้องการก่อนครับ');return;}
 const draft={kind:'DWARF_CREW_INTENT_DRAFT',mode,workContext:selectedWork,problem:$('problem').value.trim(),requestedResult:$('outcome').value.trim(),submitted:false};
 try{await navigator.clipboard.writeText(JSON.stringify(draft,null,2));status('คัดลอกแบบร่างแล้ว ยังไม่ได้ส่งงาน');}catch{status('คัดลอกอัตโนมัติไม่ได้ เลือกข้อความจากช่องผลอ่านกลับได้');$('readback').textContent=JSON.stringify(draft,null,2);}
};
