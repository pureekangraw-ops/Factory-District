// Deliberately bounded JSON Schema subset. Unknown keywords fail closed rather
// than being treated as annotations. Validation never coerces values.
const fail=code=>{throw Object.assign(new Error(code),{code});};
const object=x=>x!==null&&typeof x==='object'&&!Array.isArray(x);
const types=['object','array','string','number','integer','boolean','null'];
export function assertWorkshopSchema(schema,depth=0) {
  if(depth>8||!object(schema)||!types.includes(schema.type)) fail('WORKSHOP_SCHEMA_UNSUPPORTED');
  const allowed=schema.type==='object'?['type','properties','required','additionalProperties']:schema.type==='array'?['type','items']:['type'];
  if(Object.keys(schema).some(k=>!allowed.includes(k))) fail('WORKSHOP_SCHEMA_UNSUPPORTED');
  if(schema.type==='object') {
    if(schema.properties!==undefined) {
      if(!object(schema.properties)||Object.keys(schema.properties).length>32) fail('WORKSHOP_SCHEMA_UNSUPPORTED');
      for(const sub of Object.values(schema.properties)) assertWorkshopSchema(sub,depth+1);
    }
    if(schema.required!==undefined&&(!Array.isArray(schema.required)||schema.required.length>32||schema.required.some(x=>typeof x!=='string'||!x)||new Set(schema.required).size!==schema.required.length)) fail('WORKSHOP_SCHEMA_UNSUPPORTED');
    if(schema.additionalProperties!==undefined&&typeof schema.additionalProperties!=='boolean') fail('WORKSHOP_SCHEMA_UNSUPPORTED');
  }
  if(schema.type==='array') { if(schema.items===undefined) fail('WORKSHOP_SCHEMA_UNSUPPORTED');assertWorkshopSchema(schema.items,depth+1); }
  return schema;
}
export function matchesWorkshopSchema(schema,value) {
  assertWorkshopSchema(schema);
  const matches=(s,v)=>{
    switch(s.type) {
      case 'null':return v===null;
      case 'string':return typeof v==='string';
      case 'boolean':return typeof v==='boolean';
      case 'number':return typeof v==='number'&&Number.isFinite(v);
      case 'integer':return typeof v==='number'&&Number.isSafeInteger(v);
      case 'array':return Array.isArray(v)&&v.every(item=>matches(s.items,item));
      case 'object':return object(v)&&(s.required||[]).every(key=>Object.hasOwn(v,key))
        &&Object.entries(v).every(([key,item])=>Object.hasOwn(s.properties||{},key)?matches(s.properties[key],item):s.additionalProperties!==false);
      default:return false;
    }
  };
  return matches(schema,value);
}
export function requireWorkshopSchema(schema,value,kind) {
  if(!matchesWorkshopSchema(schema,value)) fail(`WORKSHOP_${kind}_SCHEMA_MISMATCH`);
}
