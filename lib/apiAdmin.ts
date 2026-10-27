import 'server-only'
import { NextRequest, NextResponse } from 'next/server'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'

/**
 * Para rotas da API que só o administrador pode usar. O cliente Supabase
 * devolvido usa o token da própria pessoa, então as regras de acesso do banco
 * continuam valendo (nenhuma chave mestra é usada).
 */
export async function exigirAdmin(
  request: NextRequest
): Promise<{ supabase: SupabaseClient; userId: string } | NextResponse> {
  const token = request.headers.get('authorization')?.replace('Bearer ', '')
  if (!token) return NextResponse.json({ error: 'Não autenticado.' }, { status: 401 })

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { global: { headers: { Authorization: `Bearer ${token}` } } }
  )
  const { data: userData, error } = await supabase.auth.getUser(token)
  if (error || !userData.user)
    return NextResponse.json({ error: 'Não autenticado.' }, { status: 401 })

  const { data: perfil } = await supabase
    .from('perfis')
    .select('papel')
    .eq('id', userData.user.id)
    .single()
  if (perfil?.papel !== 'admin') {
    return NextResponse.json(
      { error: 'Só o administrador pode usar esta função.' },
      { status: 403 }
    )
  }
  return { supabase, userId: userData.user.id }
}
