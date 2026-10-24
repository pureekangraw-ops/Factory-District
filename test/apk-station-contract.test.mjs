import test from 'node:test';
import assert from 'node:assert/strict';
import {validateApkAssemblyOrder,verifyApkSigningReceipt} from '../src/apk-station-contract.mjs';
const order={repository:'pureekangraw-ops/ygph-metropolis',
 sourceCommit:'a4f52400bdcf708608a1aa0eadbd0c32cdcab513',
 packageName:'com.big.gobrowser',versionCode:18,versionName:'0.7.2',
 signerSha256:'31bf91b925558771a03bdc81d258cd4d1024a3bb48702bb08534f216e88d0624',
 signingMode:'OWNER_ISOLATED'};
const receipt={schema:'FACTORY_APK_SIGNING_RECEIPT_V1',
 packageName:order.packageName,versionCode:order.versionCode,versionName:order.versionName,
 sourceCommit:order.sourceCommit,signerSha256:order.signerSha256,
 signedApkSha256:'a'.repeat(64),signingStatus:'SIGNED_AND_APKSIGNER_VERIFIED'};

test('order has pinned public identity and no private key/password',()=>{
 assert.deepEqual(validateApkAssemblyOrder(order),order);
 assert.throws(()=>validateApkAssemblyOrder({...order,password:'secret'}),/FIELDS_INVALID/);
 assert.throws(()=>validateApkAssemblyOrder({...order,keystore:'private-file'}),/FIELDS_INVALID/);
 assert.throws(()=>validateApkAssemblyOrder({...order,signingMode:'FACTORY_DYNAMIC_WORKER'}),/IDENTITY_INVALID/);
});

test('external signer receipt matches order package/version/source/certificate',()=>{
 assert.equal(verifyApkSigningReceipt(order,receipt).status,'SIGNED_RECEIPT_MATCHES_ORDER');
 for(const [field,value] of [['sourceCommit','b'.repeat(40)],['signerSha256','c'.repeat(64)],
   ['versionCode',17],['packageName','com.big.gobrowser.preview']]){
   assert.throws(()=>verifyApkSigningReceipt(order,{...receipt,[field]:value}),/IDENTITY_MISMATCH/);
 }
});
test('unsigned or tampered receipt is rejected rather than reported signed',()=>{
 for(const item of [{...receipt,signingStatus:'UNSIGNED'},
    {...receipt,signedApkSha256:'invalid'},{...receipt,privateKey:'not-allowed'}])
   assert.throws(()=>verifyApkSigningReceipt(order,item),/RECEIPT_INVALID/);
});
