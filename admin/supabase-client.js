/* ==========================================================
   supabase-client.js — Derradj Shop | Admin
   Single shared Supabase client for admin.html.

   admin.js, products-manager.js and bestsellers.js all run on the
   same page — each used to call createClient() itself, which spins
   up a separate GoTrueClient per script. Multiple GoTrueClient
   instances sharing one localStorage session race each other on
   token refresh (refresh tokens are single-use: whichever instance
   refreshes second gets "Already Used" and that client's session
   silently dies), causing intermittent auth/RLS failures on writes
   like adding a product. Loading this file once, before the other
   admin scripts, and having them reuse window.sbClient fixes that.
   ========================================================== */
(function () {
  'use strict';

  const SUPABASE_URL      = 'https://jbmcbjzcedqpvnhbmrhk.supabase.co';
  const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImpibWNianpjZWRxcHZuaGJtcmhrIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Njk2NjU1MDUsImV4cCI6MjA4NTI0MTUwNX0.u_D1K7gFCQmmI_m0do5-VpdXrXXLPQ8BCDMLc3Ew1Yk';

  if (!window.supabase?.createClient) return;
  if (!window.sbClient) {
    window.sbClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
  }
})();
