import 'server-only';
import { createClient } from '@supabase/supabase-js';
import type { Database } from './database.types';

/** Service-role client for trusted server jobs (the GCC forwarder). Bypasses RLS: only
 * ever call service_role RPCs with it, and never import this from client code. */
export function getServiceClient() {
  return createClient<Database>(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
