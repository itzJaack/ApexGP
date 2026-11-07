import {build} from 'esbuild';
await build({
  stdin: {contents: "export {createClient} from '@supabase/supabase-js';", resolveDir: process.cwd()},
  outfile: 'dist/vendor/supabase.js', bundle: true, format: 'esm', minify: true,
  target: ['es2022'], legalComments: 'eof',
});
// Publish one versioned game module so a cached dependency cannot mix the
// previous contact code with the new fall/skin data structures.
await build({
  entryPoints:['dist/game.js'],outfile:'dist/app.bundle.js',bundle:true,
  format:'esm',minify:true,target:['es2022'],legalComments:'eof',
  external:['./vendor/supabase.js'],
});

