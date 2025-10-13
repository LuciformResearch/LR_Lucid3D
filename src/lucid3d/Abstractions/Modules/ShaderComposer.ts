import { Phase, ShaderModuleBase, gatherSnippetsForPhase } from './ShaderModule';

export type ComposeResult = { codeVert: string, codeFrag: string };

export class ShaderComposer {
  static compose(bodyVert: string, bodyFrag: string, modules: ShaderModuleBase[]): ComposeResult {
    const collect = (phase: Phase) => gatherSnippetsForPhase(modules, phase).join('\n');
    const placeholders: Array<{ token: string, phase: Phase }> = [
      { token: '// @@GLOBAL_SNIPPETS', phase: 'GLOBAL_SNIPPETS' },
      { token: '// @@VERTEX_INITIALIZE_SNIPPETS', phase: 'VERTEX_INITIALIZE_SNIPPETS' },
      { token: '// @@VERTEX_EXTRA_SNIPPETS', phase: 'VERTEX_EXTRA_SNIPPETS' },
      { token: '// @@FRAGMENT_INITIALIZE_SNIPPETS', phase: 'FRAGMENT_INITIALIZE_SNIPPETS' },
      { token: '// @@MATERIALINFO_SNIPPETS', phase: 'MATERIALINFO_SNIPPETS' },
      { token: '// @@NORMALMAP_SNIPPETS', phase: 'NORMALMAP_SNIPPETS' },
      { token: '// @@LIGHT_INIT_SNIPPETS', phase: 'LIGHT_INIT_SNIPPETS' },
      { token: '// @@LIGHT_COMPUTE_SNIPPETS', phase: 'LIGHT_COMPUTE_SNIPPETS' },
      { token: '// @@LAYER_BLEND_SNIPPETS', phase: 'LAYER_BLEND_SNIPPETS' },
      { token: '// @@FRAGMENT_FINALIZE_SNIPPETS', phase: 'FRAGMENT_FINALIZE_SNIPPETS' },
    ];
    const inject = (body: string) => {
      let result = body;
      for (const { token, phase } of placeholders) {
        result = result.replace(token, collect(phase));
      }
      return result;
    };
    return { codeVert: inject(bodyVert), codeFrag: inject(bodyFrag) };
  }
}
