import {createSocialHandler} from './social.mjs';
Deno.serve(createSocialHandler({url:Deno.env.get('SUPABASE_URL'),serviceKey:Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')}));
