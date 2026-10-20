import {it,expect} from 'vitest';import {diagnostic} from './diagnostics';
it('support diagnostics contain version and stage only',()=>{const value=diagnostic('ui_render','0.2.0');expect(value).toEqual({version:'0.2.0',stage:'ui_render'});expect(JSON.stringify(value)).not.toMatch(/media|filename|transcript|stack|token/);});
