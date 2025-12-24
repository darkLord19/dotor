import { NextRequest, NextResponse } from 'next/server';
import { createServerClient, type CookieOptions } from '@supabase/ssr';

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL ?? '';
const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? '';

export async function POST(request: NextRequest) {
  console.log('[LOGIN API] Starting login request');
  
  // We'll create the redirect response after signInWithPassword completes
  // signInWithPassword should automatically trigger setAll to set cookies
  let redirectResponse: NextResponse | null = null;
  
  const supabase = createServerClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    cookies: {
      getAll() {
        const cookies = request.cookies.getAll();
        console.log('[LOGIN API] Getting cookies:', cookies.map(c => c.name));
        return cookies;
      },
      setAll(cookiesToSetArray: Array<{ name: string; value: string; options?: CookieOptions }>) {
        console.log('[LOGIN API] setAll called with', cookiesToSetArray.length, 'cookies:', cookiesToSetArray.map(c => ({ name: c.name, hasValue: !!c.value, valueLength: c.value?.length })));
        
        // Update request cookies
        cookiesToSetArray.forEach(({ name, value }) => {
          request.cookies.set(name, value);
        });
        
        // Create redirect response AFTER cookies are set
        // This is the key - create response when setAll is called
        redirectResponse = NextResponse.redirect(new URL('/ask', request.url));
        
        // Set all cookies in the redirect response with proper options
        cookiesToSetArray.forEach(({ name, value, options }) => {
          redirectResponse!.cookies.set(name, value, {
            ...options,
            httpOnly: false, // Browser needs to read this for SSR
            secure: options?.secure ?? (process.env.NODE_ENV === 'production'),
            sameSite: options?.sameSite ?? 'lax',
            path: options?.path ?? '/',
          });
        });
        
        console.log('[LOGIN API] Cookies set in redirect response:', redirectResponse!.cookies.getAll().map(c => c.name));
      },
    },
  });
  
  const formData = await request.formData();
  const email = formData.get('email') as string;
  const password = formData.get('password') as string;

  console.log('[LOGIN API] Attempting signInWithPassword for:', email);

  // signInWithPassword should automatically trigger setAll to set cookies
  const { data, error } = await supabase.auth.signInWithPassword({
    email,
    password,
  });

  if (error) {
    console.log('[LOGIN API] Sign in error:', error.message);
    return NextResponse.json(
      { error: error.message },
      { status: 400 }
    );
  }

  console.log('[LOGIN API] Sign in successful. Session:', {
    hasSession: !!data.session,
    userId: data.session?.user?.id,
    expiresAt: data.session?.expires_at,
  });

  // signInWithPassword returns session in the response
  if (!data.session) {
    console.log('[LOGIN API] No session in response data');
    return NextResponse.json(
      { error: 'Failed to create session. Please try again.' },
      { status: 500 }
    );
  }

  // signInWithPassword might not automatically trigger setAll in Route Handlers
  // So we need to explicitly set the session to trigger cookie persistence
  console.log('[LOGIN API] Explicitly setting session to trigger cookie persistence');
  const { error: setSessionError } = await supabase.auth.setSession({
    access_token: data.session.access_token,
    refresh_token: data.session.refresh_token,
  });

  if (setSessionError) {
    console.log('[LOGIN API] setSession error:', setSessionError.message);
    // Continue anyway - cookies might have been set
  }

  // If setAll was called (either during signInWithPassword or setSession), redirectResponse should be set
  if (redirectResponse) {
    const finalCookies = redirectResponse.cookies.getAll();
    console.log('[LOGIN API] setAll was called, cookies in redirect:', finalCookies.map(c => ({ name: c.name, hasValue: !!c.value && c.value.length > 0 })));
    console.log('[LOGIN API] Redirecting to /ask');
    return redirectResponse;
  }

  // If setAll still wasn't called, manually create response with cookies
  console.log('[LOGIN API] WARNING: setAll was not called, manually setting cookies');
  redirectResponse = NextResponse.redirect(new URL('/ask', request.url));
  
  // Manually set the cookie in the format Supabase expects
  const urlParts = SUPABASE_URL.replace('https://', '').replace('http://', '').split('.');
  const projectRef = urlParts[0];
  const authCookieName = `sb-${projectRef}-auth-token`;
  
  const cookieValue = JSON.stringify({
    access_token: data.session.access_token,
    refresh_token: data.session.refresh_token,
    expires_at: data.session.expires_at,
    expires_in: data.session.expires_in,
    token_type: data.session.token_type,
    user: data.session.user,
  });
  
  const expiresAt = data.session.expires_at 
    ? new Date(data.session.expires_at * 1000)
    : new Date(Date.now() + (data.session.expires_in || 3600) * 1000);
  
  redirectResponse.cookies.set(authCookieName, cookieValue, {
    httpOnly: false,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    expires: expiresAt,
    maxAge: data.session.expires_in || 3600,
  });
  
  console.log('[LOGIN API] Manually set cookie:', authCookieName);
  console.log('[LOGIN API] Redirecting to /ask');
  return redirectResponse;
}

