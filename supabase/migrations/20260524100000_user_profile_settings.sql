-- ============================================================================
-- Extend user_profiles for settings page + billing + notifications
-- ============================================================================

-- Profile & business fields
alter table user_profiles
  add column if not exists display_name      text,
  add column if not exists phone             text,
  add column if not exists avatar_url        text,
  add column if not exists business_name     text,
  add column if not exists business_type     text,
  add column if not exists business_street   text,
  add column if not exists business_city     text,
  add column if not exists business_state    text,
  add column if not exists business_zip      text,
  add column if not exists tax_id            text;

-- Notification preferences
alter table user_profiles
  add column if not exists notif_extraction_fail  boolean not null default true,
  add column if not exists notif_weekly_summary   boolean not null default false,
  add column if not exists notif_usage_alert      boolean not null default true;

-- Billing / subscription
alter table user_profiles
  add column if not exists stripe_customer_id  text,
  add column if not exists subscription_plan   text not null default 'free',
  add column if not exists subscription_status text not null default 'active',
  add column if not exists billing_period_end  timestamptz,
  add column if not exists invoice_limit       int  not null default 100;

-- RLS: user can update their own profile row
drop policy if exists "users_update_own_profile" on user_profiles;
create policy "users_update_own_profile" on user_profiles
  for update using (user_id = auth.uid());

-- RLS: user can delete their own profile row (used by delete-account flow)
drop policy if exists "users_delete_own_profile" on user_profiles;
create policy "users_delete_own_profile" on user_profiles
  for delete using (user_id = auth.uid());

-- Supabase Storage bucket for avatars (idempotent)
insert into storage.buckets (id, name, public)
  values ('avatars', 'avatars', true)
  on conflict (id) do nothing;

-- Allow authenticated users to upload/update/delete only their own avatar.
-- File path convention: avatars/<user_uuid>.<ext>
drop policy if exists "avatar_upload" on storage.objects;
create policy "avatar_upload" on storage.objects
  for insert with check (
    bucket_id = 'avatars'
    and auth.uid()::text = split_part(name, '.', 1)
  );

drop policy if exists "avatar_update" on storage.objects;
create policy "avatar_update" on storage.objects
  for update using (
    bucket_id = 'avatars'
    and auth.uid()::text = split_part(name, '.', 1)
  );

drop policy if exists "avatar_delete" on storage.objects;
create policy "avatar_delete" on storage.objects
  for delete using (
    bucket_id = 'avatars'
    and auth.uid()::text = split_part(name, '.', 1)
  );

drop policy if exists "avatar_public_read" on storage.objects;
create policy "avatar_public_read" on storage.objects
  for select using (bucket_id = 'avatars');
