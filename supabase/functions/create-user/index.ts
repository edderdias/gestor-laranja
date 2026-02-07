import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.0';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { email, password, fullName, isFamilyMember } = await req.json();

    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response('Unauthorized', { status: 401, headers: corsHeaders });
    }
    const token = authHeader.replace('Bearer ', '');
    const { data: { user: inviterUser }, error: inviterError } = await supabaseAdmin.auth.getUser(token);

    if (inviterError || !inviterUser) {
      console.error("[create-user] Error getting inviter user:", inviterError);
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Cria o usuário diretamente com senha e confirmação de e-mail automática
    const { data: newUser, error: authError } = await supabaseAdmin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: { full_name: fullName }
    });

    if (authError) {
      console.error("[create-user] Error creating user:", authError);
      return new Response(JSON.stringify({ error: authError.message }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    if (!newUser.user) {
      return new Response(JSON.stringify({ error: 'User not created' }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Atualiza o perfil do usuário recém-criado
    const { error: profileError } = await supabaseAdmin
      .from('profiles')
      .update({
        invited_by_user_id: inviterUser.id,
        is_family_member: isFamilyMember,
        full_name: fullName,
      })
      .eq('id', newUser.user.id);

    if (profileError) {
      console.error("[create-user] Error updating profile:", profileError);
      return new Response(JSON.stringify({ error: 'Failed to update user profile' }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    return new Response(JSON.stringify({ message: 'User created successfully', user: newUser.user }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error) {
    console.error("[create-user] Unhandled error:", error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});