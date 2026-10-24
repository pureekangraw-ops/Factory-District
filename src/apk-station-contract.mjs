// Factory APK Station handoff contract. This is NOT the CODE Dynamic Worker runner.
const SHA40=/^[0-9a-f]{40}$/;
const SHA64=/^[0-9a-f]{64}$/;
const ORDER_FIELDS=['repository','sourceCommit','packageName','versionCode','versionName','signerSha256','signingMode'];
const RECEIPT_FIELDS=['schema','packageName','versionCode','versionName','sourceCommit','signerSha256','signedApkSha256','signingStatus'];
const plain=x=>x!==null&&typeof x==='object'&&!Array.isArray(x)&&Object.getPrototypeOf(x)===Object.prototype;
const exact=(x,keys)=>plain(x)&&Object.keys(x).length===keys.length&&
  Object.keys(x).every(k=>keys.includes(k))&&keys.every(k=>Object.hasOwn(x,k));

export function validateApkAssemblyOrder(order){
 if(!exact(order,ORDER_FIELDS))throw Error('APK_ORDER_FIELDS_INVALID');
 if(order.repository!=='pureekangraw-ops/ygph-metropolis'||
    !SHA40.test(order.sourceCommit)||order.packageName!=='com.big.gobrowser'||
    !Number.isInteger(order.versionCode)||order.versionCode<1||
    !/^\d+\.\d+\.\d+$/.test(order.versionName)||
    !SHA64.test(order.signerSha256)||order.signingMode!=='OWNER_ISOLATED')
    throw Error('APK_ORDER_IDENTITY_INVALID');
 return {...order};
}

export function verifyApkSigningReceipt(order,receipt){
 const expected=validateApkAssemblyOrder(order);
 if(!exact(receipt,RECEIPT_FIELDS)||
   receipt.schema!=='FACTORY_APK_SIGNING_RECEIPT_V1'||
   receipt.signingStatus!=='SIGNED_AND_APKSIGNER_VERIFIED'||
   !SHA64.test(receipt.signedApkSha256))throw Error('APK_SIGNING_RECEIPT_INVALID');
 for(const field of ['packageName','versionCode','versionName','sourceCommit','signerSha256'])
   if(receipt[field]!==expected[field])throw Error('APK_SIGNING_IDENTITY_MISMATCH');
 return {status:'SIGNED_RECEIPT_MATCHES_ORDER',sha256:receipt.signedApkSha256};
}
