export function canReloadForUpdate(exporting:boolean,batchProcessing:boolean,hasProject:boolean,saved:boolean):boolean{return !exporting&&!batchProcessing&&(!hasProject||saved);}
