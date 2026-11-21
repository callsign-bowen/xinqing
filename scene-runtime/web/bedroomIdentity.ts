/** Match the initial app's per-account local storage without sending room images to a server. */
export function roomStorageSuffix():string {
  try {
    const owner=JSON.parse(localStorage.getItem('nuo_session')||'null')?.username;
    if(typeof owner!=='string'||!owner)return '';
    let first=localStorage.getItem('nuo_bedroom_legacy_owner');
    if(!first){localStorage.setItem('nuo_bedroom_legacy_owner',owner);first=owner;}
    return first===owner?'':`:${encodeURIComponent(owner.toLowerCase())}`;
  }catch{return '';}
}
