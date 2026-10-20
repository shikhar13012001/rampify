export function diagnostic(stage:'ui_render'|'export',version:string):{version:string;stage:string} {
 return {version:version.replace(/[^a-zA-Z0-9_.-]/g,'').slice(0,40),stage};
}
