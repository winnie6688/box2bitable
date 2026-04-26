const { createClient } = require('@supabase/supabase-js');

let supabase = null;
let supabaseConfigKey = '';

const getSupabase = () => {
  const url = process.env.SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const cfgKey = `${url || ''}::${serviceRoleKey || ''}`;

  if (!url || !serviceRoleKey) {
    throw new Error('SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required');
  }

  if (supabase && supabaseConfigKey === cfgKey) return supabase;
  supabaseConfigKey = cfgKey;
  supabase = createClient(url, serviceRoleKey);
  return supabase;
};

module.exports = {
  getSupabase,
};
