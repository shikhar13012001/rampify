import {it,expect,vi} from 'vitest';import {retainLocalMedia} from './mediaResources';
it('keeps a local asset alive until editor, queued jobs and active render release it',()=>{
 const revoke=vi.spyOn(URL,'revokeObjectURL');const editor=retainLocalMedia(['blob:music']),queue=retainLocalMedia(['blob:music']),render=retainLocalMedia(['blob:music']);editor();queue();expect(revoke).not.toHaveBeenCalled();render();expect(revoke).toHaveBeenCalledWith('blob:music');render();expect(revoke).toHaveBeenCalledOnce();revoke.mockRestore();
});
