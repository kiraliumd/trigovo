import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export async function GET(request: Request) {
    const { searchParams, origin } = new URL(request.url)

    // Verifica se recebeu o código de autorização (PKCE)
    const code = searchParams.get('code')

    // Verifica erros retornados pelo Supabase (ex: link expirado)
    const error = searchParams.get('error')
    const errorCode = searchParams.get('error_code')
    const errorDescription = searchParams.get('error_description')

    if (error) {
        console.error('❌ Supabase Auth Error:', { error, errorCode, errorDescription })
        return NextResponse.redirect(`${origin}/auth/auth-code-error?code=${errorCode || 'unknown'}`)
    }

    if (code) {
        const supabase = await createClient()

        // Troca o código pela sessão do usuário
        const { error: exchangeError } = await supabase.auth.exchangeCodeForSession(code)

        if (!exchangeError) {
            console.log('✅ Auth Session Exchanged Successfully')

            // Busca o usuário atual
            const { data: { user } } = await supabase.auth.getUser()

            if (user) {
                // Verifica se a agência já existe no banco
                const { data: agency } = await supabase
                    .from('agencies')
                    .select('id')
                    .eq('id', user.id)
                    .single()

                const next = agency ? '/dashboard' : '/onboarding'

                // SUCESSO: Redireciona para o destino correto
                const forwardedHost = request.headers.get('x-forwarded-host')
                const isLocalEnv = process.env.NODE_ENV === 'development'

                if (isLocalEnv) {
                    return NextResponse.redirect(`${origin}${next}`)
                } else if (forwardedHost) {
                    return NextResponse.redirect(`https://${forwardedHost}${next}`)
                } else {
                    return NextResponse.redirect(`${origin}${next}`)
                }
            }
        } else {
            console.error('❌ Erro na troca de token Supabase:', exchangeError)
        }
    } else {
        console.error('❌ Auth Callback Error: No code provided')
    }

    // ERRO: Se não tiver código ou der erro, manda para uma página de erro
    return NextResponse.redirect(`${origin}/auth/auth-code-error`)
}