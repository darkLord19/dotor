import { NextRequest, NextResponse } from 'next/server';
import { createServerClient, type CookieOptions } from '@supabase/ssr';

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL ?? '';
const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? '';

export async function GET(request: NextRequest) {
  console.log('[SESSION API] Getting session');
  const requestCookies = request.cookies.getAll();
  console.log('[SESSION API] Request cookies:', requestCookies.map(c => ({ name: c.name, valueLength: c.value?.length })));
  
  // Check if cookie value is JSON format (manually set)
  const authCookie = requestCookies.find(c => c.name.includes('auth-token'));
  let parsedSession: any = null;
  
  if (authCookie && authCookie.value?.startsWith('{')) {
    try {
      parsedSession = JSON.parse(authCookie.value);
      console.log('[SESSION API] Cookie is JSON format, parsed session data available');
    } catch (e) {
      console.log('[SESSION API] Cookie is not valid JSON');
    }
  }
  
  // Create response that we'll update
  let response = NextResponse.next();
  
  // Track cookies that get set by Supabase
  const cookiesToSet: Array<{ name: string; value: string; options?: CookieOptions }> = [];
  
  const supabase = createServerClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    cookies: {
      getAll() {
        return requestCookies;
      },
      setAll(cookiesToSetArray: Array<{ name: string; value: string; options?: CookieOptions }>) {
        console.log('[SESSION API] setAll called with', cookiesToSetArray.length, 'cookies:', cookiesToSetArray.map(c => c.name));
        cookiesToSet.push(...cookiesToSetArray);
        // Update response with new cookies
        cookiesToSetArray.forEach(({ name, value, options }) => {
          request.cookies.set(name, value);
          response = NextResponse.next({ request });
          response.cookies.set(name, value, {
            ...options,
            httpOnly: false,
            secure: options?.secure ?? (process.env.NODE_ENV === 'production'),
            sameSite: options?.sameSite ?? 'lax',
            path: options?.path ?? '/',
          });
        });
      },
    },
  });

  // If we have a manually set JSON cookie, extract the user data directly
  // and return it, since Supabase SSR can't read manually set cookies
  if (parsedSession && parsedSession.access_token && parsedSession.user) {
    console.log('[SESSION API] Using session data directly from manually set cookie');
    
    // Return the user data directly from the cookie
    const jsonResponse = NextResponse.json({
      accessToken: parsedSession.access_token,
      user: {
        id: parsedSession.user.id,
        email: parsedSession.user.email,
        name: parsedSession.user.user_metadata?.full_name || parsedSession.user.user_metadata?.name || '',
      },
    });

    // Try to set the session properly so Supabase can manage it
    // This should trigger setAll to set cookies in the correct format
    const { error: setSessionError } = await supabase.auth.setSession({
      access_token: parsedSession.access_token,
      refresh_token: parsedSession.refresh_token,
    });
    
    if (!setSessionError) {
      console.log('[SESSION API] Successfully set session, checking if setAll was called');
      
      // Copy cookies from response (setAll should have updated it)
      response.cookies.getAll().forEach((cookie) => {
        jsonResponse.cookies.set(cookie.name, cookie.value, {
          httpOnly: false,
          secure: process.env.NODE_ENV === 'production',
          sameSite: 'lax',
          path: '/',
        });
      });

      // Add any new cookies from setAll
      cookiesToSet.forEach(({ name, value, options }) => {
        jsonResponse.cookies.set(name, value, {
          ...options,
          httpOnly: false,
          secure: options?.secure ?? (process.env.NODE_ENV === 'production'),
          sameSite: options?.sameSite ?? 'lax',
          path: options?.path ?? '/',
        });
      });
      
      console.log('[SESSION API] Returning user data from cookie, cookies updated:', jsonResponse.cookies.getAll().map(c => c.name));
      return jsonResponse;
    } else {
      console.log('[SESSION API] setSession failed but returning user data from cookie anyway:', setSessionError.message);
      // Still return the user data even if setSession failed
      return jsonResponse;
    }
  }

  // Try getSession first
  const { data: { session: sessionData }, error: sessionError } = await supabase.auth.getSession();
  
  console.log('[SESSION API] getSession result:', {
    hasSession: !!sessionData,
    userId: sessionData?.user?.id,
    error: sessionError?.message,
  });
  
  if (sessionData && sessionData.user) {
    // Session found, return it
    const jsonResponse = NextResponse.json({
      accessToken: sessionData.access_token,
      user: {
        id: sessionData.user.id,
        email: sessionData.user.email,
        name: sessionData.user.user_metadata?.full_name || sessionData.user.user_metadata?.name || '',
      },
    });

    // Copy cookies from response
    response.cookies.getAll().forEach((cookie) => {
      jsonResponse.cookies.set(cookie.name, cookie.value, {
        httpOnly: false,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'lax',
        path: '/',
      });
    });

    // Add any new cookies
    cookiesToSet.forEach(({ name, value, options }) => {
      jsonResponse.cookies.set(name, value, {
        ...options,
        httpOnly: false,
        secure: options?.secure ?? (process.env.NODE_ENV === 'production'),
        sameSite: options?.sameSite ?? 'lax',
        path: options?.path ?? '/',
      });
    });

    return jsonResponse;
  }

  // If getSession failed, try getUser
  const { data: { user }, error: userError } = await supabase.auth.getUser();
  
  console.log('[SESSION API] getUser result:', {
    hasUser: !!user,
    userId: user?.id,
    error: userError?.message,
  });
  
  if (userError || !user) {
    console.log('[SESSION API] No user found, error:', userError?.message);
    // Clear the bad cookie
    if (authCookie) {
      console.log('[SESSION API] Clearing invalid auth cookie');
      const errorResponse = NextResponse.json(
        { error: 'No session found' },
        { status: 401 }
      );
      errorResponse.cookies.delete(authCookie.name);
      errorResponse.cookies.set(authCookie.name, '', {
        expires: new Date(0),
        path: '/',
      });
      return errorResponse;
    }
    return NextResponse.json(
      { error: 'No session found' },
      { status: 401 }
    );
  }

  // Get the current session
  const { data: { session } } = await supabase.auth.getSession();
  
  if (!session) {
    console.log('[SESSION API] No session found after getUser');
    return NextResponse.json(
      { error: 'No session found' },
      { status: 401 }
    );
  }

  // Create JSON response
  const jsonResponse = NextResponse.json({
    accessToken: session.access_token,
    user: {
      id: user.id,
      email: user.email,
      name: user.user_metadata?.full_name || user.user_metadata?.name || '',
    },
  });

  // Copy cookies from response
  response.cookies.getAll().forEach((cookie) => {
    jsonResponse.cookies.set(cookie.name, cookie.value, {
      httpOnly: false,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      path: '/',
    });
  });

  // Add all cookies that were set by Supabase (including refreshed ones)
  cookiesToSet.forEach(({ name, value, options }) => {
    jsonResponse.cookies.set(name, value, {
      ...options,
      httpOnly: false,
      secure: options?.secure ?? (process.env.NODE_ENV === 'production'),
      sameSite: options?.sameSite ?? 'lax',
      path: options?.path ?? '/',
    });
  });

  console.log('[SESSION API] Final response cookies:', jsonResponse.cookies.getAll().map(c => c.name));
  return jsonResponse;
}

