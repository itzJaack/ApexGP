import {build} from 'esbuild';
await build({
  stdin: {contents: "export {createClient} from '@supabase/supabase-js';", resolveDir: process.cwd()},
  outfile: 'dist/vendor/supabase.js', bundle: true, format: 'esm', minify: true,
  target: ['es2022'], legalComments: 'eof',
});

