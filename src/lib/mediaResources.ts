/** Reference ownership for local object URLs shared by editor, queues and renders. */
const references=new Map<string,number>();
export function retainLocalMedia(urls:(string|undefined|null)[]):()=>void{
 const local=[...new Set(urls.filter((url):url is string=>!!url&&url.startsWith('blob:')))];
 for(const url of local)references.set(url,(references.get(url)??0)+1);
 let released=false;
 return ()=>{if(released)return;released=true;for(const url of local){const count=(references.get(url)??1)-1;if(count>0)references.set(url,count);else{references.delete(url);URL.revokeObjectURL(url);}}};
}
export function createMediaOwner(){
 const held=new Map<string,()=>void>();
 return (urls:(string|undefined|null)[])=>{const next=new Set(urls.filter((url):url is string=>!!url&&url.startsWith('blob:')));for(const url of next)if(!held.has(url))held.set(url,retainLocalMedia([url]));for(const [url,release] of held)if(!next.has(url)){release();held.delete(url);}};
}
