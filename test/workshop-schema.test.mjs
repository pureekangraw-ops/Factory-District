import test from 'node:test';
import assert from 'node:assert/strict';
import {assertWorkshopSchema,matchesWorkshopSchema} from '../src/workshop-schema.mjs';

test('bounded schema subset checks nested types, required keys and extra properties without coercion',()=>{
  const schema={type:'object',properties:{items:{type:'array',items:{type:'integer'}},enabled:{type:'boolean'}},required:['items'],additionalProperties:false};
  assert.equal(matchesWorkshopSchema(schema,{items:[1,2],enabled:true}),true);
  for(const value of [{items:['1']},{items:[1.5]},{enabled:true},{items:[],extra:1},null]) assert.equal(matchesWorkshopSchema(schema,value),false);
  assert.equal(matchesWorkshopSchema({type:'number'},'4'),false);
  assert.equal(matchesWorkshopSchema({type:'string'},4),false);
  assert.equal(matchesWorkshopSchema({type:'number'},Infinity),false);
  assert.equal(matchesWorkshopSchema({type:'null'},null),true);
});

test('unsupported schema constructs are rejected explicitly rather than ignored',()=>{
  for(const schema of [true,false,{}, {type:'string',pattern:'.*'}, {$ref:'external://schema'}, {type:['string','number']}, {type:'array'}, {type:'object',additionalProperties:{type:'string'}}, {type:'object',properties:{x:{type:'number',minimum:0}}}])
    assert.throws(()=>assertWorkshopSchema(schema),/WORKSHOP_SCHEMA_UNSUPPORTED/);
});
